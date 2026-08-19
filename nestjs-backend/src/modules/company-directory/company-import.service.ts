import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Inject,
  forwardRef,
} from '@nestjs/common';
import {
  CompanyDirectoryCategory,
  CompanyImportItemResult,
  CompanyImportJobStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AresApiException, AresService } from './ares.service';
import type { AresEconomicSubject, AresSearchFilter } from './ares.types';
import {
  ARES_IMPORT_BATCH_SIZE,
  ARES_IMPORT_DELAY_MS,
  ARES_IMPORT_ENABLED,
  ARES_IMPORT_MAX_REQUESTS_PER_RUN,
  ARES_WORKER_TICK_MS,
} from './company-directory.constants';
import {
  buildAresSearchFilter,
  computeAggregateTotal,
  createEmptySearchCheckpoint,
  buildInitialPartitions,
  isAresTooManyResultsError,
  isWholeCountryRegion,
  parseSearchCheckpoint,
  subdivideNaceCode,
  buildPartitionKeyWithoutPage,
  type AresSearchCheckpoint,
} from './ares-import-split.util';
import {
  appendDiagnostic,
  ARES_SEARCH_ENDPOINT,
  computeRegionProgress,
  icosFromSubjects,
  resultFingerprint,
  sanitizeAresRequestBody,
  type AresRequestDiagnostic,
} from './ares-import-diagnostics.util';
import { AresQueryPartitionService } from './ares-query-partition.service';
import { normalizeAresCompanyForDb } from './company-directory.serializer';
import { getAresImportSkipReason } from './ares-company-importability.util';
import { CompanyEventsService } from './company-events.service';
import { CompanyImportPartitionService } from './company-import-partition.service';
import { computeJobProgress, computePartitionBasedProgress } from './company-job-progress.util';

type StartImportInput = {
  category?: CompanyDirectoryCategory;
  region?: string;
  district?: string;
  city?: string;
  batchSize?: number;
  delayMs?: number;
  importMode?: 'SEARCH' | 'ICO_LIST';
  icoList?: string[];
  limit?: number;
  query?: string;
};

@Injectable()
export class CompanyImportService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(CompanyImportService.name);
  private workerTimer: ReturnType<typeof setInterval> | null = null;
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ares: AresService,
    private readonly partitionService: AresQueryPartitionService,
    private readonly importPartitions: CompanyImportPartitionService,
    @Inject(forwardRef(() => CompanyEventsService))
    private readonly events: CompanyEventsService,
  ) {}

  onModuleInit(): void {
    this.workerTimer = setInterval(() => void this.tick(), ARES_WORKER_TICK_MS);
    void this.recoverStaleJobs();
  }

  onModuleDestroy(): void {
    if (this.workerTimer) clearInterval(this.workerTimer);
  }

  async startImport(input: StartImportInput) {
    if (!ARES_IMPORT_ENABLED) {
      throw new BadRequestException('ARES import je vypnutý (ARES_IMPORT_ENABLED=false).');
    }

    const sanitized = this.sanitizeStartInput(input);
    this.log.log(
      `[ARES-IMPORT] start route payload category=${sanitized.category ?? '—'} region=${sanitized.region ?? '—'} city=${sanitized.city ?? '—'} mode=${sanitized.importMode}`,
    );

    const active = await this.findActiveJob();
    if (active) {
      throw new ConflictException({
        message: 'Již běží jiný ARES import. Otevřete existující úlohu nebo ji nejdříve zastavte.',
        activeJobId: active.id,
        status: active.status,
      });
    }

    const importMode = sanitized.importMode;
    const wholeCountry = isWholeCountryRegion(sanitized.region);
    if (
      importMode === 'SEARCH' &&
      !wholeCountry &&
      !sanitized.city?.trim() &&
      !sanitized.region?.trim() &&
      !sanitized.district?.trim()
    ) {
      throw new BadRequestException(
        'Pro vyhledávací import zadejte Celá ČR, kraj, okres nebo město.',
      );
    }

    if (importMode === 'ICO_LIST') {
      const list = sanitized.icoList ?? [];
      if (!list.length) {
        throw new BadRequestException('Pro import ze seznamu IČO zadejte alespoň jedno IČO.');
      }
    }

    const searchFilter = this.buildSearchFilter(sanitized);
    const importLimit =
      sanitized.limit != null && Number.isFinite(sanitized.limit) && sanitized.limit > 0
        ? Math.floor(sanitized.limit)
        : null;

    const baseFilter = searchFilter as AresSearchFilter;
    const partitionCtx = {
      category: sanitized.category ?? null,
      region: wholeCountry ? 'Celá ČR' : sanitized.region ?? null,
      district: sanitized.district ?? null,
      city: sanitized.city ?? null,
      wholeCountry,
    };

    let initialCheckpoint: Prisma.InputJsonValue | undefined;
    if (importMode === 'SEARCH') {
      const parts = buildInitialPartitions(baseFilter, partitionCtx);
      const checkpoint = createEmptySearchCheckpoint(importLimit);
      checkpoint.phase = parts.length > 1 ? 'PARTITIONING' : 'RUNNING';
      checkpoint.subQueries = parts.map((p) => p.filter);
      checkpoint.subQueryLabels = parts.map((p) => p.label);
      checkpoint.subQueryDepths = parts.map((p) => p.depth);
      checkpoint.regionsTotal = wholeCountry ? 14 : null;
      initialCheckpoint = checkpoint as unknown as Prisma.InputJsonValue;
      this.log.log(
        `[ARES-IMPORT] created partitions count=${parts.length} wholeCountry=${wholeCountry}`,
      );
    }

    try {
      const job = await this.prisma.companyImportJob.create({
        data: {
          category: sanitized.category ?? null,
          region: wholeCountry ? 'Celá ČR' : sanitized.region?.trim() || null,
          district: sanitized.district?.trim() || null,
          city: sanitized.city?.trim() || null,
          batchSize: sanitized.batchSize,
          delayMs: sanitized.delayMs,
          importMode,
          icoList: importMode === 'ICO_LIST' ? (sanitized.icoList ?? []) : [],
          searchFilter: searchFilter as Prisma.InputJsonValue,
          checkpoint: initialCheckpoint,
          status: CompanyImportJobStatus.PENDING,
          totalExpected:
            importMode === 'ICO_LIST'
              ? (sanitized.icoList ?? []).length
              : null,
        },
      });

      this.log.log(`[ARES-IMPORT] job created id=${job.id} status=${job.status}`);

      if (importMode === 'SEARCH' && initialCheckpoint) {
        const cp = parseSearchCheckpoint(initialCheckpoint);
        if (cp?.subQueries.length) {
          const specs = cp.subQueries.map((filter, i) => ({
            filter,
            label: cp.subQueryLabels[i] ?? `partition-${i + 1}`,
            depth: cp.subQueryDepths[i] ?? 0,
            partitionKey: buildPartitionKeyWithoutPage(filter, partitionCtx),
          }));
          await this.importPartitions.createInitialPartitions(job.id, specs, partitionCtx);
        }
      }

      void this.tick();

      return {
        jobId: job.id,
        id: job.id,
        status: 'QUEUED',
        importMode,
        partitions: importMode === 'SEARCH' ? (parseSearchCheckpoint(initialCheckpoint)?.subQueries.length ?? 0) : null,
      };
    } catch (err) {
      const prismaCode =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: string }).code)
          : undefined;
      this.log.error(
        `[ARES-IMPORT] job create failed prisma=${prismaCode ?? '—'} error=${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
      if (prismaCode === 'P2002') {
        throw new ConflictException('Databáze odmítla vytvořit importní úlohu — duplicitní záznam.');
      }
      throw err;
    }
  }

  async retryImport(jobId: string) {
    const job = await this.getJobOrThrow(jobId);
    return this.startImport({
      category: job.category ?? undefined,
      region: job.region ?? undefined,
      district: job.district ?? undefined,
      city: job.city ?? undefined,
      batchSize: job.batchSize ?? ARES_IMPORT_BATCH_SIZE,
      delayMs: job.delayMs ?? ARES_IMPORT_DELAY_MS,
      importMode: (job.importMode as 'SEARCH' | 'ICO_LIST') ?? 'SEARCH',
      icoList: job.icoList ?? [],
      limit: parseSearchCheckpoint(job.checkpoint)?.importLimit ?? undefined,
    });
  }

  private sanitizeStartInput(input: StartImportInput): StartImportInput {
    const category =
      input.category && String(input.category).trim()
        ? (String(input.category).trim() as CompanyDirectoryCategory)
        : undefined;
    const batchSize =
      input.batchSize != null && Number.isFinite(input.batchSize) && input.batchSize > 0
        ? Math.min(500, Math.floor(input.batchSize))
        : ARES_IMPORT_BATCH_SIZE;
    const delayMs =
      input.delayMs != null && Number.isFinite(input.delayMs) && input.delayMs >= 0
        ? Math.floor(input.delayMs)
        : ARES_IMPORT_DELAY_MS;
    const importMode = input.importMode ?? (input.icoList?.length ? 'ICO_LIST' : 'SEARCH');
    const icoList = (input.icoList ?? [])
      .map((ico) => ico.replace(/\D/g, '').padStart(8, '0'))
      .filter((ico) => /^\d{8}$/.test(ico));

    return {
      ...input,
      category,
      region: input.region?.trim() || undefined,
      district: input.district?.trim() || undefined,
      city: input.city?.trim() || undefined,
      batchSize,
      delayMs,
      importMode,
      icoList,
      limit: input.limit,
    };
  }

  private async findActiveJob() {
    return this.prisma.companyImportJob.findFirst({
      where: {
        status: {
          in: [
            CompanyImportJobStatus.PENDING,
            CompanyImportJobStatus.RUNNING,
            CompanyImportJobStatus.PAUSE_REQUESTED,
            CompanyImportJobStatus.CANCEL_REQUESTED,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async pauseJob(jobId: string) {
    const job = await this.getJobOrThrow(jobId);
    if (
      job.status === CompanyImportJobStatus.PAUSED ||
      job.status === CompanyImportJobStatus.PAUSE_REQUESTED
    ) {
      return await this.serializeJob(job);
    }
    if (
      job.status === CompanyImportJobStatus.COMPLETED ||
      job.status === CompanyImportJobStatus.CANCELLED ||
      job.status === CompanyImportJobStatus.FAILED
    ) {
      throw new BadRequestException('Import nelze pozastavit.');
    }
    await this.appendAudit(jobId, 'Admin requested PAUSE');
    const updated = await this.prisma.companyImportJob.update({
      where: { id: jobId },
      data: {
        pauseRequested: true,
        status:
          job.status === CompanyImportJobStatus.PENDING
            ? CompanyImportJobStatus.PAUSED
            : CompanyImportJobStatus.PAUSE_REQUESTED,
      },
    });
    await this.appendAudit(jobId, 'Pause request stored');
    return await this.serializeJob(updated);
  }

  async resumeJob(jobId: string) {
    const job = await this.getJobOrThrow(jobId);
    if (
      job.status !== CompanyImportJobStatus.PAUSED &&
      job.status !== CompanyImportJobStatus.FAILED
    ) {
      throw new BadRequestException('Import není pozastavený ani opravitelný.');
    }
    await this.appendAudit(jobId, 'Admin resumed job');
    if (job.status === CompanyImportJobStatus.FAILED) {
      await this.importPartitions.repairFailedJob(jobId);
    }
    const updated = await this.prisma.companyImportJob.update({
      where: { id: jobId },
      data: {
        status: CompanyImportJobStatus.PENDING,
        pauseRequested: false,
        cancelRequested: false,
        error: null,
        finishedAt: null,
      },
    });
    void this.tick();
    return await this.serializeJob(updated);
  }

  /** Obnoví failed job — pokračuje od problematického partitionu bez ztráty dat. */
  async resumeWithResplit(jobId: string) {
    const job = await this.getJobOrThrow(jobId);
    if (job.status !== CompanyImportJobStatus.FAILED) {
      throw new BadRequestException('Oprava je dostupná jen pro FAILED job.');
    }
    await this.appendAudit(jobId, 'Admin requested repair/resplit');
    await this.importPartitions.repairFailedJob(jobId);
    const checkpoint = parseSearchCheckpoint(job.checkpoint) ?? createEmptySearchCheckpoint(null);
    checkpoint.needsResplit = false;
    checkpoint.stopped = false;
    checkpoint.phase = 'RUNNING';

    const partitionCtx = this.partitionService.buildContext(job);
    partitionCtx.wholeCountry = isWholeCountryRegion(job.region);
    const idx = Math.min(
      checkpoint.subQueryIndex,
      Math.max(0, checkpoint.subQueries.length - 1),
    );
    if (checkpoint.subQueries[idx]) {
      await this.attemptAutoSplit(
        jobId,
        checkpoint.subQueries[idx],
        partitionCtx,
        checkpoint.subQueryDepths[idx] ?? 0,
        checkpoint.subQueryLabels[idx] ?? `partition-${idx + 1}`,
        checkpoint,
        idx,
      );
    }

    const updated = await this.prisma.companyImportJob.update({
      where: { id: jobId },
      data: {
        status: CompanyImportJobStatus.PENDING,
        error: null,
        finishedAt: null,
        pauseRequested: false,
        cancelRequested: false,
        checkpoint: checkpoint as unknown as Prisma.InputJsonValue,
      },
    });
    void this.tick();
    return await this.serializeJob(updated);
  }

  async stopJob(jobId: string) {
    const job = await this.getJobOrThrow(jobId);
    if (
      job.status === CompanyImportJobStatus.COMPLETED ||
      job.status === CompanyImportJobStatus.CANCELLED
    ) {
      return await this.serializeJob(job);
    }
    if (job.status === CompanyImportJobStatus.CANCEL_REQUESTED) {
      return await this.serializeJob(job);
    }
    await this.appendAudit(jobId, 'Admin requested CANCEL');
    const updated = await this.prisma.companyImportJob.update({
      where: { id: jobId },
      data: {
        status: CompanyImportJobStatus.CANCEL_REQUESTED,
        cancelRequested: true,
        pauseRequested: false,
      },
    });
    void this.tick();
    return await this.serializeJob(updated);
  }

  async getJob(jobId: string) {
    const job = await this.getJobOrThrow(jobId);
    return await this.serializeJob(job);
  }

  async getJobItems(jobId: string, limit = 100) {
    return this.prisma.companyImportItem.findMany({
      where: { jobId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async testCurrentPartition(jobId: string) {
    const job = await this.getJobOrThrow(jobId);
    if (job.importMode !== 'SEARCH') {
      throw new BadRequestException('Test partition je dostupný jen pro vyhledávací import.');
    }
    const checkpoint = parseSearchCheckpoint(job.checkpoint);
    if (!checkpoint?.subQueries.length) {
      throw new BadRequestException('Import job nemá připravené partitiony.');
    }
    const idx = Math.min(checkpoint.subQueryIndex, checkpoint.subQueries.length - 1);
    const activeFilter = checkpoint.subQueries[idx];
    const partitionCtx = this.partitionService.buildContext(job);
    partitionCtx.wholeCountry = isWholeCountryRegion(job.region);
    const partitionLabel = checkpoint.subQueryLabels[idx] ?? `partition-${idx + 1}`;
    const partitionKey = buildPartitionKeyWithoutPage(activeFilter, partitionCtx);
    const startedAt = Date.now();

    const countResult = await this.partitionService.countPartition(activeFilter, partitionCtx, {
      partitionId: `${jobId}:${idx}`,
      partitionLabel,
    });

    const pages: Array<{
      offset: number;
      returnedCount: number;
      pocetCelkem: number | null;
      firstIco: string | null;
      lastIco: string | null;
      existingInPage: number;
      newInPage: number;
      durationMs: number;
    }> = [];
    const allIcos: string[] = [];
    let start = 0;
    const pocet = 100;
    let pocetCelkem = countResult.total;

    while (pages.length < 50) {
      const pageStarted = Date.now();
      const response = await this.ares.searchCompanies({ ...activeFilter, start, pocet });
      const subjects = response.ekonomickeSubjekty ?? [];
      pocetCelkem = response.pocetCelkem ?? pocetCelkem;
      const { firstIco, lastIco, icos } = icosFromSubjects(subjects);
      const existingInDb = icos.length
        ? await this.prisma.companyDirectoryEntry.findMany({
            where: { ico: { in: icos } },
            select: { ico: true },
          })
        : [];
      const existingSet = new Set(existingInDb.map((row) => row.ico));
      allIcos.push(...icos);
      pages.push({
        offset: start,
        returnedCount: subjects.length,
        pocetCelkem,
        firstIco,
        lastIco,
        existingInPage: existingSet.size,
        newInPage: icos.filter((ico) => !existingSet.has(ico)).length,
        durationMs: Date.now() - pageStarted,
      });
      const cap = pocetCelkem != null ? Math.min(pocetCelkem, 1000) : null;
      if (
        subjects.length === 0 ||
        subjects.length < pocet ||
        (cap != null && start + subjects.length >= cap)
      ) {
        break;
      }
      start += subjects.length;
    }

    const uniqueIcos = [...new Set(allIcos)];
    const existingRows = uniqueIcos.length
      ? await this.prisma.companyDirectoryEntry.findMany({
          where: { ico: { in: uniqueIcos } },
          select: { ico: true },
        })
      : [];
    const existingIcoSet = new Set(existingRows.map((row) => row.ico));
    const newIcos = uniqueIcos.filter((ico) => !existingIcoSet.has(ico));

    return {
      endpoint: ARES_SEARCH_ENDPOINT,
      apiVersion: 'ARES REST ekonomicke-subjekty-v-be',
      partitionIndex: idx,
      partitionLabel,
      partitionKey,
      requestBody: sanitizeAresRequestBody(activeFilter),
      countRequest: {
        httpStatus: countResult.httpStatus,
        pocetCelkem: countResult.total,
        returnedCount: countResult.returnedCount,
      },
      pocetCelkem,
      pagesRequested: pages.length,
      rawAresUniqueIco: uniqueIcos.length,
      pages,
      dbExisting: existingIcoSet.size,
      dbNew: newIcos.length,
      newIcos: newIcos.slice(0, 100),
      paginationWorking:
        pages.length > 1 ||
        (pages[0] != null &&
          pocetCelkem != null &&
          pages[0].returnedCount >= Math.min(pocetCelkem, pocet)),
      naceFilterWorking: Boolean(activeFilter.czNace?.length),
      regionFilterWorking: activeFilter.sidlo?.kodKraje != null,
      municipalityFilterWorking: Boolean(activeFilter.sidlo?.nazevObce),
      durationMs: Date.now() - startedAt,
    };
  }

  async listJobs(limit = 20) {
    const rows = await this.prisma.companyImportJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return Promise.all(rows.map((row) => this.serializeJob(row)));
  }

  async importIcoBatch(icoList: string[], category?: CompanyDirectoryCategory | null) {
    const results = { created: 0, updated: 0, failed: 0, skipped: 0 };
    for (const rawIco of icoList) {
      try {
        const result = await this.upsertIco(rawIco, category ?? null);
        results[result.action] += 1;
        await this.sleep(ARES_IMPORT_DELAY_MS);
      } catch (err) {
        results.failed += 1;
        this.log.warn(`Import IČO ${rawIco} selhal: ${String(err)}`);
      }
    }
    return results;
  }

  /** Veřejný upsert firmy z ARES podle IČO (pro recenze). */
  async upsertPublicFromAres(ico: string, category?: CompanyDirectoryCategory | null) {
    if (!ARES_IMPORT_ENABLED) {
      throw new BadRequestException('ARES import není aktivní.');
    }
    const normalized = ico.replace(/\D/g, '').padStart(8, '0').slice(-8);
    if (!/^\d{8}$/.test(normalized)) {
      throw new BadRequestException('Neplatné IČO.');
    }
    const result = await this.upsertIco(normalized, category ?? null);
    if (!result.companyId) {
      throw new BadRequestException('Nepodařilo se vytvořit profil firmy z ARES.');
    }
    const company = await this.prisma.companyDirectoryEntry.findUnique({
      where: { id: result.companyId },
    });
    if (!company) {
      throw new NotFoundException('Firma nenalezena po importu z ARES.');
    }
    return {
      action: result.action,
      company: {
        id: company.id,
        ico: company.ico,
        name: company.name,
        slug: company.slug,
        city: company.city,
        region: company.region,
        aresSource: company.aresSource,
        profileStatus: company.profileStatus,
        verificationStatus: company.verificationStatus,
        publicProfile: company.publicProfile,
      },
      message:
        result.action === 'created'
          ? 'Profil vytvořen z veřejných rejstříkových údajů.'
          : 'Použit existující profil firmy.',
    };
  }

  private async tick() {
    if (this.processing || !ARES_IMPORT_ENABLED) return;
    const job = await this.prisma.companyImportJob.findFirst({
      where: {
        status: {
          in: [
            CompanyImportJobStatus.PENDING,
            CompanyImportJobStatus.RUNNING,
            CompanyImportJobStatus.PAUSE_REQUESTED,
            CompanyImportJobStatus.CANCEL_REQUESTED,
          ],
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!job) return;

    this.processing = true;
    try {
      await this.processJobBatch(job.id);
    } finally {
      this.processing = false;
    }
  }

  private async acknowledgePauseIfRequested(jobId: string) {
    const job = await this.prisma.companyImportJob.findUnique({ where: { id: jobId } });
    if (!job?.pauseRequested) return false;
    if (
      job.status === CompanyImportJobStatus.PAUSE_REQUESTED ||
      job.status === CompanyImportJobStatus.RUNNING ||
      job.status === CompanyImportJobStatus.PENDING
    ) {
      await this.prisma.companyImportJob.update({
        where: { id: jobId },
        data: { status: CompanyImportJobStatus.PAUSED, pauseRequested: false },
      });
      await this.appendAudit(jobId, 'Worker acknowledged PAUSE');
      return true;
    }
    return false;
  }

  private async acknowledgeCancelIfRequested(jobId: string) {
    const job = await this.prisma.companyImportJob.findUnique({ where: { id: jobId } });
    if (
      !job ||
      (!job.cancelRequested && job.status !== CompanyImportJobStatus.CANCEL_REQUESTED)
    ) {
      return false;
    }
    await this.importPartitions.cancelPendingPartitions(jobId);
    const checkpoint = this.mergeCheckpoint(job.checkpoint, { stopped: true });
    await this.prisma.companyImportJob.update({
      where: { id: jobId },
      data: {
        status: CompanyImportJobStatus.CANCELLED,
        cancelRequested: true,
        pauseRequested: false,
        finishedAt: new Date(),
        error: 'Import zastaven administrátorem.',
        checkpoint,
      },
    });
    await this.appendAudit(jobId, 'Worker acknowledged CANCEL');
    return true;
  }

  private async shouldAbortJob(jobId: string): Promise<boolean> {
    const job = await this.prisma.companyImportJob.findUnique({ where: { id: jobId } });
    if (!job) return true;
    if (
      job.cancelRequested ||
      job.status === CompanyImportJobStatus.CANCELLED ||
      job.status === CompanyImportJobStatus.CANCEL_REQUESTED
    ) {
      return true;
    }
    if (job.pauseRequested || job.status === CompanyImportJobStatus.PAUSED) return true;
    const checkpoint = parseSearchCheckpoint(job.checkpoint);
    if (checkpoint?.stopped) return true;
    return false;
  }

  private async handleAbortSignals(jobId: string) {
    const job = await this.prisma.companyImportJob.findUnique({ where: { id: jobId } });
    if (!job) return;
    if (job.pauseRequested || job.status === CompanyImportJobStatus.PAUSE_REQUESTED) {
      await this.acknowledgePauseIfRequested(jobId);
      return;
    }
    if (job.cancelRequested || job.status === CompanyImportJobStatus.CANCEL_REQUESTED) {
      await this.acknowledgeCancelIfRequested(jobId);
    }
  }

  private async processJobBatch(jobId: string) {
    const job = await this.prisma.companyImportJob.findUnique({ where: { id: jobId } });
    if (!job) return;
    if (
      job.status !== CompanyImportJobStatus.PENDING &&
      job.status !== CompanyImportJobStatus.RUNNING &&
      job.status !== CompanyImportJobStatus.PAUSE_REQUESTED &&
      job.status !== CompanyImportJobStatus.CANCEL_REQUESTED
    ) {
      return;
    }

    if (await this.shouldAbortJob(jobId)) {
      await this.handleAbortSignals(jobId);
      return;
    }

    const batchSize = job.batchSize ?? 10;
    const delayMs = job.delayMs ?? ARES_IMPORT_DELAY_MS;
    const maxRequests = ARES_IMPORT_MAX_REQUESTS_PER_RUN;
    let requests = 0;

    await this.prisma.companyImportJob.update({
      where: { id: jobId },
      data: {
        status: CompanyImportJobStatus.RUNNING,
        startedAt: job.startedAt ?? new Date(),
        error: null,
        lastActivityAt: new Date(),
        heartbeatAt: new Date(),
      },
    });

    try {
      if (job.importMode === 'ICO_LIST') {
        const list = job.icoList ?? [];
        const startIndex = job.lastCursor;
        const slice = list.slice(startIndex, startIndex + batchSize);
        if (slice.length === 0) {
          await this.completeJob(jobId);
          return;
        }

        let created = job.created;
        let updated = job.updated;
        let failed = job.failed;
        let processed = job.processed;
        let lastIco = job.lastIco;

        for (const ico of slice) {
          if (requests >= maxRequests) break;
          requests += 1;
          try {
            const result = await this.upsertIco(ico, job.category, jobId);
            if (result.action === 'created') created += 1;
            if (result.action === 'updated') updated += 1;
            processed += 1;
            lastIco = ico;
            await this.logImportItem({
              jobId,
              ico,
              result: result.action === 'created' ? CompanyImportItemResult.CREATED : CompanyImportItemResult.UPDATED,
              companyId: result.companyId,
              name: result.name,
              city: result.city,
              category: job.category,
            });
          } catch (err) {
            failed += 1;
            processed += 1;
            await this.logImportItem({
              jobId,
              ico,
              result: CompanyImportItemResult.FAILED,
              errorMessage: err instanceof Error ? err.message.slice(0, 500) : 'Chyba importu',
            });
          }
          await this.sleep(delayMs);
        }

        const nextCursor = startIndex + slice.length;
        const done = nextCursor >= list.length && requests < maxRequests;
        await this.prisma.companyImportJob.update({
          where: { id: jobId },
          data: {
            processed,
            created,
            updated,
            failed,
            lastCursor: nextCursor,
            lastIco,
            requestsCount: { increment: requests },
            lastActivityAt: new Date(),
            heartbeatAt: new Date(),
            checkpoint: { mode: 'ICO_LIST', index: nextCursor } as Prisma.InputJsonValue,
            status: done ? CompanyImportJobStatus.COMPLETED : CompanyImportJobStatus.PENDING,
            finishedAt: done ? new Date() : null,
          },
        });
        return;
      }

      const baseFilter = (job.searchFilter ?? this.buildSearchFilter(job)) as AresSearchFilter;
      const pocet = batchSize;
      const partitionCtx = this.partitionService.buildContext(job);
      partitionCtx.wholeCountry = isWholeCountryRegion(job.region);

      let checkpoint =
        parseSearchCheckpoint(job.checkpoint) ?? createEmptySearchCheckpoint(null);
      if (
        typeof checkpoint.subQueryStart !== 'number' ||
        !Number.isFinite(checkpoint.subQueryStart)
      ) {
        checkpoint.subQueryStart = 0;
      }

      if (checkpoint.subQueries.length === 0) {
        const parts = buildInitialPartitions(baseFilter, partitionCtx);
        checkpoint.subQueries = parts.map((p) => p.filter);
        checkpoint.subQueryLabels = parts.map((p) => p.label);
        checkpoint.subQueryDepths = parts.map((p) => p.depth);
        checkpoint.regionsTotal = partitionCtx.wholeCountry ? 14 : checkpoint.regionsTotal;
        checkpoint.phase = parts.length > 1 ? 'PARTITIONING' : 'RUNNING';
      }

      if (checkpoint.stopped) return;

      const idx = Math.min(checkpoint.subQueryIndex, Math.max(0, checkpoint.subQueries.length - 1));
      let activeFilter = checkpoint.subQueries[idx] ?? baseFilter;
      let start = checkpoint.subQueryStart;
      const partitionLabel =
        checkpoint.subQueryLabels[idx] ??
        `partition-${idx + 1}/${checkpoint.subQueries.length}`;
      checkpoint.currentPartitionLabel = partitionLabel;
      checkpoint.phase = 'RUNNING';

      const partitionDepth = checkpoint.subQueryDepths[idx] ?? 0;
      const partitionKey = buildPartitionKeyWithoutPage(activeFilter, partitionCtx);
      const regionProgress = computeRegionProgress(checkpoint.subQueryLabels, idx);
      checkpoint.currentRegion = regionProgress.currentRegion;
      checkpoint.currentRegionOrder = regionProgress.regionOrder;
      checkpoint.regionsTotal = regionProgress.regionsTotal;
      checkpoint.regionsCompleted = regionProgress.regionsCompleted;

      const dbPart = await this.importPartitions.getPartitionBySortOrder(jobId, idx);
      if (dbPart?.status === 'COMPLETED' || dbPart?.status === 'SPLIT') {
        checkpoint.subQueryIndex = idx + 1;
        checkpoint.subQueryStart = 0;
        await this.persistCheckpoint(jobId, job, checkpoint);
        return;
      }
      if (dbPart?.status === 'PENDING') {
        await this.importPartitions.markPartitionRunning(dbPart.id);
      }

      if (checkpoint.subQueryTotals[idx] == null && requests < maxRequests) {
        if (await this.shouldAbortJob(jobId)) {
          await this.handleAbortSignals(jobId);
          return;
        }
        requests += 1;
        try {
          const countResult = await this.partitionService.countPartition(activeFilter, partitionCtx, {
            partitionId: `${jobId}:${idx}`,
            partitionLabel,
          });
          checkpoint.subQueryTotals[idx] = countResult.total ?? 0;
          if (this.partitionService.needsFurtherSplit(countResult.total)) {
            const splitOk = await this.attemptAutoSplit(
              jobId,
              activeFilter,
              partitionCtx,
              partitionDepth,
              partitionLabel,
              checkpoint,
              idx,
            );
            if (splitOk) return;
            this.log.warn(
              `Import ${jobId}: partition ${partitionLabel} NEEDS_FURTHER_SPLIT (total=${countResult.total})`,
            );
          }
        } catch (err) {
          if (isAresTooManyResultsError(err)) {
            const splitOk = await this.attemptAutoSplit(
              jobId,
              activeFilter,
              partitionCtx,
              partitionDepth,
              partitionLabel,
              checkpoint,
              idx,
            );
            if (splitOk) return;
          }
          throw err;
        }
      }

      if (requests >= maxRequests) {
        await this.persistCheckpoint(jobId, job, checkpoint);
        return;
      }

      if (await this.shouldAbortJob(jobId)) {
        await this.handleAbortSignals(jobId);
        return;
      }

      requests += 1;
      const fetchStarted = Date.now();
      this.partitionService.logPartitionRequest('FETCH', activeFilter, partitionCtx, {
        partitionId: `${jobId}:${idx}`,
        partitionLabel,
      }, { page: start, limit: pocet });

      let response;
      try {
        response = await this.ares.searchCompanies({
          ...activeFilter,
          start,
          pocet,
        });
      } catch (err) {
        if (isAresTooManyResultsError(err)) {
          const splitOk = await this.attemptAutoSplit(
            jobId,
            activeFilter,
            partitionCtx,
            partitionDepth,
            partitionLabel,
            checkpoint,
            idx,
          );
          if (splitOk) return;
        }
        throw err;
      }

      const subjects = response.ekonomickeSubjekty ?? [];
      const fetchDurationMs = Date.now() - fetchStarted;
      const { firstIco, lastIco: responseLastIco, icos: responseIcos } =
        icosFromSubjects(subjects);
      let subTotal = response.pocetCelkem ?? checkpoint.subQueryTotals[idx] ?? null;
      const existingBeforeUpsert = responseIcos.length
        ? await this.prisma.companyDirectoryEntry.findMany({
            where: { ico: { in: responseIcos } },
            select: { ico: true },
          })
        : [];
      const existingIcoSet = new Set(existingBeforeUpsert.map((row) => row.ico));
      let batchCreated = 0;
      let batchUpdated = 0;
      let batchSkipped = 0;

      if (subTotal != null && subTotal > 1000) {
        const splitOk = await this.attemptAutoSplit(
          jobId,
          activeFilter,
          partitionCtx,
          partitionDepth,
          partitionLabel,
          checkpoint,
          idx,
        );
        if (splitOk) return;
        this.log.warn(
          `[ARES-IMPORT] partition ${partitionLabel} has ${subTotal} results — importing capped batch of 1000`,
        );
        subTotal = 1000;
      }

      if (subTotal != null) {
        checkpoint.subQueryTotals[idx] = subTotal;
        checkpoint.aggregateTotal = computeAggregateTotal(
          checkpoint.subQueryTotals,
          checkpoint.importLimit,
        );
      }

      const totalExpected =
        checkpoint.aggregateTotal ??
        (checkpoint.importLimit != null
          ? Math.min(subTotal ?? checkpoint.importLimit, checkpoint.importLimit)
          : subTotal) ??
        job.totalExpected ??
        null;

      let created = job.created;
      let updated = job.updated;
      let failed = job.failed;
      let skipped = job.skipped;
      let processed = job.processed;
      let lastIco = job.lastIco;
      let currentCompanyName: string | null = null;
      let rawResults = checkpoint.rawResults;
      let duplicatesSkipped = checkpoint.duplicatesSkipped;

      const importLimit = checkpoint.importLimit;

      for (const subject of subjects) {
        if (importLimit != null && processed >= importLimit) break;
        if (await this.shouldAbortJob(jobId)) {
          await this.persistCheckpoint(jobId, job, checkpoint);
          await this.handleAbortSignals(jobId);
          return;
        }

        rawResults += 1;
        const normalizedIco = subject.ico.replace(/\D/g, '').padStart(8, '0');
        const dupInJob = await this.prisma.companyImportItem.findFirst({
          where: {
            jobId,
            ico: normalizedIco,
            result: { in: [CompanyImportItemResult.CREATED, CompanyImportItemResult.UPDATED, CompanyImportItemResult.SKIPPED] },
          },
        });
        if (dupInJob) {
          skipped += 1;
          duplicatesSkipped += 1;
          batchSkipped += 1;
          continue;
        }

        try {
          const result = await this.upsertFromSubject(subject, job.category, jobId);
          if (result.action === 'created') {
            created += 1;
            batchCreated += 1;
          }
          if (result.action === 'updated') {
            updated += 1;
            batchUpdated += 1;
          }
          if (result.action === 'skipped') {
            skipped += 1;
            batchSkipped += 1;
          }
          processed += 1;
          lastIco = normalizedIco;
          currentCompanyName = result.name ?? subject.obchodniJmeno ?? null;
          await this.logImportItem({
            jobId,
            ico: normalizedIco,
            result:
              result.action === 'created'
                ? CompanyImportItemResult.CREATED
                : result.action === 'skipped'
                  ? CompanyImportItemResult.SKIPPED
                  : CompanyImportItemResult.UPDATED,
            companyId: result.companyId,
            name: result.name,
            city: result.city,
            category: job.category,
            errorMessage: result.skipReason,
          });
        } catch (err) {
          failed += 1;
          processed += 1;
          await this.logImportItem({
            jobId,
            ico: normalizedIco,
            result: CompanyImportItemResult.FAILED,
            errorMessage: err instanceof Error ? err.message.slice(0, 500) : 'Chyba importu',
          });
        }
        await this.sleep(Math.min(300, delayMs));
      }

      const fingerprint = resultFingerprint(
        firstIco,
        responseLastIco,
        subjects.length,
        subTotal,
        start,
      );
      const fingerprints = { ...(checkpoint.resultFingerprints ?? {}) };
      let duplicateResultSet = false;
      let duplicateOfPartitionIndex: number | null = null;
      for (const [partitionIndex, existingFingerprint] of Object.entries(fingerprints)) {
        if (existingFingerprint === fingerprint && partitionIndex !== String(idx)) {
          duplicateResultSet = true;
          duplicateOfPartitionIndex = Number(partitionIndex);
          break;
        }
      }
      fingerprints[String(idx)] = fingerprint;
      checkpoint.resultFingerprints = fingerprints;
      checkpoint.aresDiagnostics = appendDiagnostic(checkpoint.aresDiagnostics ?? [], {
        at: new Date().toISOString(),
        kind: 'FETCH',
        partitionIndex: idx,
        partitionKey,
        partitionLabel,
        endpoint: ARES_SEARCH_ENDPOINT,
        requestBody: sanitizeAresRequestBody({ ...activeFilter, start, pocet }),
        httpStatus: 200,
        pocetCelkem: subTotal,
        returnedCount: subjects.length,
        firstIco,
        lastIco: responseLastIco,
        offset: start,
        durationMs: fetchDurationMs,
        createdInBatch: batchCreated,
        updatedInBatch: batchUpdated,
        existingInBatch: existingIcoSet.size,
        skippedInBatch: batchSkipped,
        duplicateResultSet,
        duplicateOfPartitionIndex,
      });
      if (duplicateResultSet) {
        this.log.warn(
          `[ARES-IMPORT] DUPLICATE_RESULT_SET job=${jobId} partition=${idx} duplicateOf=${duplicateOfPartitionIndex}`,
        );
        await this.appendAudit(
          jobId,
          `DUPLICATE_RESULT_SET: partition ${idx} stejné IČO jako partition ${duplicateOfPartitionIndex}`,
        );
      }
      this.log.log(
        `[ARES-IMPORT] FETCH job=${jobId} partition=${idx + 1}/${checkpoint.subQueries.length} offset=${start} total=${subTotal ?? '—'} returned=${subjects.length} first=${firstIco ?? '—'} last=${responseLastIco ?? '—'} new=${batchCreated} updated=${batchUpdated} existing=${existingIcoSet.size} ${fetchDurationMs}ms`,
      );

      const partitionTotal = subTotal ?? checkpoint.subQueryTotals[idx] ?? null;
      const nextStart = start + subjects.length;
      const subQueryExhausted =
        subjects.length === 0 ||
        subjects.length < pocet ||
        (partitionTotal != null && nextStart >= Math.min(partitionTotal, 1000));

      let nextSubQueryIndex = checkpoint.subQueryIndex;
      let nextSubQueryStart = nextStart;

      if (subQueryExhausted && checkpoint.subQueries.length > 0) {
        nextSubQueryIndex += 1;
        nextSubQueryStart = 0;
        if (dbPart) {
          await this.importPartitions.completePartition(dbPart.id, {
            cursor: nextStart,
            processedCount: nextStart,
          });
        }
        const nextRegionProgress = computeRegionProgress(
          checkpoint.subQueryLabels,
          nextSubQueryIndex,
        );
        checkpoint.regionsCompleted = nextRegionProgress.regionsCompleted;
        checkpoint.currentRegion = nextRegionProgress.currentRegion;
        checkpoint.currentRegionOrder = nextRegionProgress.regionOrder;
      }

      const allSubQueriesDone =
        checkpoint.subQueries.length === 0
          ? subQueryExhausted
          : nextSubQueryIndex >= checkpoint.subQueries.length;

      const limitReached = importLimit != null && processed >= importLimit;

      checkpoint = {
        ...checkpoint,
        subQueryIndex: nextSubQueryIndex,
        subQueryStart: nextSubQueryStart,
        currentCompanyName,
        rawResults,
        duplicatesSkipped,
        currentBatchFrom: processed > 0 ? processed - subjects.length + 1 : null,
        currentBatchTo: processed > 0 ? processed : null,
        aggregateTotal: totalExpected,
      };

      const noMore = allSubQueriesDone || limitReached;

      await this.prisma.companyImportJob.update({
        where: { id: jobId },
        data: {
          processed,
          created,
          updated,
          failed,
          skipped,
          lastCursor: nextSubQueryStart,
          lastIco,
          totalExpected,
          requestsCount: { increment: requests },
          lastActivityAt: new Date(),
          heartbeatAt: new Date(),
          checkpoint: checkpoint as unknown as Prisma.InputJsonValue,
          status: noMore ? CompanyImportJobStatus.COMPLETED : CompanyImportJobStatus.PENDING,
          finishedAt: noMore ? new Date() : null,
          error: null,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (isAresTooManyResultsError(err)) {
        const failedJob = await this.prisma.companyImportJob.findUnique({ where: { id: jobId } });
        const checkpoint = parseSearchCheckpoint(failedJob?.checkpoint);
        if (failedJob && checkpoint?.subQueries.length) {
          const idx = Math.min(
            checkpoint.subQueryIndex,
            Math.max(0, checkpoint.subQueries.length - 1),
          );
          const partitionCtx = this.partitionService.buildContext(failedJob);
          partitionCtx.wholeCountry = isWholeCountryRegion(failedJob.region);
          const splitOk = await this.attemptAutoSplit(
            jobId,
            checkpoint.subQueries[idx] ?? (failedJob.searchFilter as AresSearchFilter),
            partitionCtx,
            checkpoint.subQueryDepths[idx] ?? 0,
            checkpoint.subQueryLabels[idx] ?? `partition-${idx + 1}`,
            checkpoint,
            idx,
          );
          if (splitOk) return;
        }
        await this.prisma.companyImportJob.update({
          where: { id: jobId },
          data: {
            status: CompanyImportJobStatus.PENDING,
            error: null,
            checkpoint: this.mergeCheckpoint(failedJob?.checkpoint, {
              needsResplit: true,
              phase: 'PARTITIONING',
            }),
            lastActivityAt: new Date(),
          },
        });
        this.log.warn(`Import ${jobId}: TOO_MANY_RESULTS — čeká na další rozdělení partitionu`);
        return;
      }

      const pauseOnRateLimit =
        err instanceof AresApiException && (err.statusCode === 429 || err.statusCode >= 500);

      await this.prisma.companyImportJob.update({
        where: { id: jobId },
        data: {
          status: pauseOnRateLimit
            ? CompanyImportJobStatus.PAUSED
            : CompanyImportJobStatus.FAILED,
          error: message,
          finishedAt: pauseOnRateLimit ? null : new Date(),
        },
      });
      this.log.error(`Import job ${jobId} failed: ${message}`);
    }
  }

  private async upsertIco(
    ico: string,
    hintCategory: CompanyDirectoryCategory | null,
    jobId?: string,
  ) {
    const subject = await this.ares.getCompanyByIco(ico);
    return this.upsertFromSubject(subject, hintCategory, jobId);
  }

  private async upsertFromSubject(
    subject: AresEconomicSubject,
    hintCategory: CompanyDirectoryCategory | null,
    _jobId?: string,
  ): Promise<{
    action: 'created' | 'updated' | 'skipped';
    companyId?: string;
    name?: string;
    city?: string | null;
    skipReason?: string;
  }> {
    const skipReason = getAresImportSkipReason(subject);
    if (skipReason) {
      return {
        action: 'skipped',
        name: subject.obchodniJmeno ?? undefined,
        city: subject.sidlo?.nazevObce ?? null,
        skipReason,
      };
    }

    const full =
      subject.obchodniJmeno && subject.sidlo
        ? subject
        : await this.ares.getCompanyByIco(subject.ico);

    const normalized = normalizeAresCompanyForDb(full, hintCategory);
    const now = new Date();

    const existing = await this.prisma.companyDirectoryEntry.findUnique({
      where: { ico: normalized.ico },
    });

    const inLiquidation = /\bv\s+likvidaci\b/i.test(normalized.name);
    const inactive = normalized.companyStatus !== 'AKTIVNI';
    const data = {
      dic: normalized.dic,
      name: normalized.name,
      slug: existing?.slug ?? normalized.slug,
      legalForm: normalized.legalForm,
      companyStatus: normalized.companyStatus,
      inLiquidation,
      inactive,
      dissolved: inactive && /ZANIK|VYMAZ/i.test(normalized.companyStatus ?? ''),
      street: normalized.street,
      city: normalized.city,
      postalCode: normalized.postalCode,
      district: normalized.district,
      region: normalized.region,
      country: normalized.country,
      registeredAddress: normalized.registeredAddress,
      categories: normalized.categories,
      businessActivities: normalized.businessActivities,
      aresSource: true,
      aresLastSyncAt: now,
      aresRawUpdatedAt: normalized.aresRawUpdatedAt,
      publicProfile: true,
    };

    if (existing) {
      const row = await this.prisma.companyDirectoryEntry.update({
        where: { id: existing.id },
        data,
      });
      return {
        action: 'updated',
        companyId: row.id,
        name: row.name,
        city: row.city,
      };
    }

    const row = await this.prisma.companyDirectoryEntry.create({
      data: {
        ico: normalized.ico,
        ...data,
      },
    });
    await this.events.emitCompanyCreated(row.id);
    return {
      action: 'created',
      companyId: row.id,
      name: row.name,
      city: row.city,
    };
  }

  private async logImportItem(input: {
    jobId: string;
    ico: string;
    result: CompanyImportItemResult;
    companyId?: string;
    name?: string;
    city?: string | null;
    category?: CompanyDirectoryCategory | null;
    errorMessage?: string;
  }) {
    await this.prisma.companyImportItem.create({
      data: {
        jobId: input.jobId,
        ico: input.ico.replace(/\D/g, '').padStart(8, '0'),
        companyId: input.companyId ?? null,
        name: input.name ?? null,
        city: input.city ?? null,
        category: input.category ?? null,
        result: input.result,
        errorMessage: input.errorMessage ?? null,
      },
    });
  }

  private buildSearchFilter(input: {
    category?: CompanyDirectoryCategory | null;
    region?: string | null;
    district?: string | null;
    city?: string | null;
  }) {
    return buildAresSearchFilter(input);
  }

  private mergeCheckpoint(
    raw: Prisma.JsonValue | null | undefined,
    patch: Partial<AresSearchCheckpoint>,
  ): Prisma.InputJsonValue {
    const current = parseSearchCheckpoint(raw) ?? createEmptySearchCheckpoint(null);
    return { ...current, ...patch } as unknown as Prisma.InputJsonValue;
  }

  private async completeJob(jobId: string) {
    await this.prisma.companyImportJob.update({
      where: { id: jobId },
      data: {
        status: CompanyImportJobStatus.COMPLETED,
        finishedAt: new Date(),
      },
    });
  }

  private async recoverStaleJobs() {
    const staleMs = 10 * 60 * 1000;
    const cutoff = new Date(Date.now() - staleMs);
    const stale = await this.prisma.companyImportJob.findMany({
      where: {
        status: CompanyImportJobStatus.RUNNING,
        OR: [
          { lastActivityAt: { lt: cutoff } },
          { heartbeatAt: { lt: cutoff } },
          { lastActivityAt: null, startedAt: { lt: cutoff } },
        ],
      },
    });
    for (const job of stale) {
      await this.prisma.companyImportJob.update({
        where: { id: job.id },
        data: {
          status: CompanyImportJobStatus.PENDING,
          error: 'Úloha obnovena po neaktivním workeru.',
        },
      });
      this.log.warn(`[ARES-IMPORT] recovered stale import job ${job.id}`);
    }
    if (stale.length) void this.tick();
  }

  private async getJobOrThrow(jobId: string) {
    const job = await this.prisma.companyImportJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Import job nenalezen.');
    return job;
  }

  private async serializeJob(job: {
    id: string;
    source: string;
    category: CompanyDirectoryCategory | null;
    region: string | null;
    district: string | null;
    city: string | null;
    status: CompanyImportJobStatus;
    processed: number;
    created: number;
    updated: number;
    failed: number;
    skipped: number;
    lastCursor: number;
    lastIco: string | null;
    totalExpected: number | null;
    batchSize: number | null;
    delayMs: number | null;
    importMode: string;
    startedAt: Date | null;
    finishedAt: Date | null;
    error: string | null;
    createdAt: Date;
    updatedAt: Date;
    requestsCount?: number;
    lastActivityAt?: Date | null;
    heartbeatAt?: Date | null;
    searchFilter?: Prisma.JsonValue;
    checkpoint?: Prisma.JsonValue | null;
    auditLog?: Prisma.JsonValue | null;
    pauseRequested?: boolean;
    cancelRequested?: boolean;
  }) {
    const checkpoint = parseSearchCheckpoint(job.checkpoint);
    const isComplete = job.status === CompanyImportJobStatus.COMPLETED;
    const partitionStats = await this.importPartitions.getProgressStats(job.id);
    const uniqueIcoGroups = await this.prisma.companyImportItem.groupBy({
      by: ['ico'],
      where: { jobId: job.id },
    });
    const uniqueIcoCount = uniqueIcoGroups.length;

    const totalPartitions =
      partitionStats.total > 0
        ? partitionStats.total
        : checkpoint?.subQueries?.length ?? 0;
    const completedPartitions =
      partitionStats.total > 0
        ? partitionStats.completed
        : checkpoint?.subQueryIndex ?? 0;
    const currentIdx = checkpoint?.subQueryIndex ?? 0;
    const currentPartitionTotal = checkpoint?.subQueryTotals?.[currentIdx] ?? null;

    const partitionProgress = computePartitionBasedProgress({
      completedPartitions,
      totalPartitions,
      currentPartitionCursor: checkpoint?.subQueryStart ?? 0,
      currentPartitionTotal,
      overallProcessed: job.processed,
      jobStatus: job.status,
      isComplete,
    });

    const progress = computeJobProgress(job.processed, job.totalExpected, job.startedAt);
    const progressPercent = isComplete ? 100 : partitionProgress.overallPercent;
    const displayStatus =
      job.status === CompanyImportJobStatus.CANCELLED
        ? 'CANCELLED'
        : checkpoint?.stopped && job.status === CompanyImportJobStatus.PAUSED
          ? 'STOPPED'
          : job.status;
    return {
      id: job.id,
      source: job.source,
      category: job.category,
      region: job.region,
      district: job.district,
      city: job.city,
      status: displayStatus,
      processed: job.processed,
      created: job.created,
      updated: job.updated,
      failed: job.failed,
      skipped: job.skipped,
      lastCursor: job.lastCursor,
      lastIco: job.lastIco,
      totalExpected: job.totalExpected,
      totalFound: job.totalExpected,
      progress,
      progressLabel: partitionProgress.overallLabel,
      progressPercent,
      partitionProgress,
      currentPartitionProcessed: partitionProgress.currentPartitionProcessed,
      currentPartitionTotal: partitionProgress.currentPartitionTotal,
      currentPartitionPercent: partitionProgress.partitionPercent,
      completedPartitions,
      totalPartitions,
      partitionStats,
      auditLog: Array.isArray(job.auditLog) ? job.auditLog : [],
      pauseRequested: job.pauseRequested ?? false,
      cancelRequested: job.cancelRequested ?? false,
      etaSeconds: progress.etaSeconds,
      requestsCount: job.requestsCount ?? 0,
      lastActivityAt: job.lastActivityAt?.toISOString() ?? null,
      heartbeatAt: job.heartbeatAt?.toISOString() ?? null,
      searchFilter: job.searchFilter ?? null,
      batchSize: job.batchSize,
      delayMs: job.delayMs,
      importMode: job.importMode,
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
      error: job.error,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      currentCompanyName: checkpoint?.currentCompanyName ?? null,
      currentPartitionLabel: checkpoint?.currentPartitionLabel ?? null,
      currentBatchFrom: checkpoint?.currentBatchFrom ?? null,
      currentBatchTo: checkpoint?.currentBatchTo ?? null,
      subQueryIndex: checkpoint?.subQueryIndex ?? null,
      subQueryCount: checkpoint?.subQueries?.length ?? null,
      regionsCompleted: checkpoint?.regionsCompleted ?? null,
      regionsTotal: checkpoint?.regionsTotal ?? null,
      currentRegion: checkpoint?.currentRegion ?? null,
      currentRegionOrder: checkpoint?.currentRegionOrder ?? null,
      uniqueIcoCount,
      aresDiagnostics: checkpoint?.aresDiagnostics ?? [],
      rawResults: checkpoint?.rawResults ?? null,
      duplicatesSkipped: checkpoint?.duplicatesSkipped ?? null,
      importPhase: checkpoint?.phase ?? null,
      importLimit: checkpoint?.importLimit ?? null,
      needsResplit: checkpoint?.needsResplit ?? false,
    };
  }

  private async replacePartitionAtIndex(
    jobId: string,
    checkpoint: AresSearchCheckpoint,
    index: number,
    children: Array<{ filter: AresSearchFilter; label: string; depth: number; partitionKey?: string }>,
    partitionCtx: ReturnType<AresQueryPartitionService['buildContext']>,
  ) {
    const before = checkpoint.subQueries.slice(0, index);
    const beforeLabels = checkpoint.subQueryLabels.slice(0, index);
    const beforeDepths = checkpoint.subQueryDepths.slice(0, index);
    const beforeTotals = checkpoint.subQueryTotals.slice(0, index);
    const after = checkpoint.subQueries.slice(index + 1);
    const afterLabels = checkpoint.subQueryLabels.slice(index + 1);
    const afterDepths = checkpoint.subQueryDepths.slice(index + 1);
    const afterTotals = checkpoint.subQueryTotals.slice(index + 1);

    checkpoint.subQueries = [
      ...before,
      ...children.map((c) => c.filter),
      ...after,
    ];
    checkpoint.subQueryLabels = [
      ...beforeLabels,
      ...children.map((c) => c.label),
      ...afterLabels,
    ];
    checkpoint.subQueryDepths = [
      ...beforeDepths,
      ...children.map((c) => c.depth),
      ...afterDepths,
    ];
    checkpoint.subQueryTotals = [
      ...beforeTotals,
      ...children.map(() => null as number | null),
      ...afterTotals,
    ];
    checkpoint.subQueryStart = 0;
    checkpoint.phase = 'PARTITIONING';
    checkpoint.needsResplit = false;

    await this.prisma.companyImportJob.update({
      where: { id: jobId },
      data: {
        checkpoint: checkpoint as unknown as Prisma.InputJsonValue,
        error: null,
        lastActivityAt: new Date(),
        status: CompanyImportJobStatus.PENDING,
      },
    });

    const dbParts = await this.prisma.companyImportPartition.findMany({
      where: { jobId },
      orderBy: { sortOrder: 'asc' },
    });
    const parentPart = dbParts[index];
    if (parentPart) {
      await this.importPartitions.splitPartition(parentPart.id, children, partitionCtx);
    }

    this.log.warn(
      `Import ${jobId}: partition ${index + 1} rozdělen na ${children.length} poddotazů (celkem ${checkpoint.subQueries.length}).`,
    );
  }

  private async persistCheckpoint(
    jobId: string,
    job: { requestsCount?: number },
    checkpoint: AresSearchCheckpoint,
  ) {
    await this.prisma.companyImportJob.update({
      where: { id: jobId },
      data: {
        checkpoint: checkpoint as unknown as Prisma.InputJsonValue,
        lastActivityAt: new Date(),
        heartbeatAt: new Date(),
        status: CompanyImportJobStatus.PENDING,
      },
    });
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  private async appendAudit(jobId: string, message: string) {
    const job = await this.prisma.companyImportJob.findUnique({
      where: { id: jobId },
      select: { auditLog: true },
    });
    const existing = Array.isArray(job?.auditLog) ? (job!.auditLog as unknown[]) : [];
    const entry = {
      at: new Date().toISOString(),
      message,
    };
    await this.prisma.companyImportJob.update({
      where: { id: jobId },
      data: {
        auditLog: [...existing.slice(-49), entry] as Prisma.InputJsonValue,
      },
    });
  }

  private async attemptAutoSplit(
    jobId: string,
    activeFilter: AresSearchFilter,
    partitionCtx: ReturnType<AresQueryPartitionService['buildContext']>,
    partitionDepth: number,
    partitionLabel: string,
    checkpoint: AresSearchCheckpoint,
    idx: number,
  ): Promise<boolean> {
    let children = this.partitionService.furtherPartitions(
      activeFilter,
      partitionCtx,
      partitionDepth,
    );

    if (children.length === 0 && activeFilter.czNace?.length === 1) {
      const subs = subdivideNaceCode(activeFilter.czNace[0]);
      if (subs.length > 1) {
        children = subs.map((nace) => ({
          filter: { ...activeFilter, czNace: [nace], start: 0 },
          label: `${partitionLabel} · nace=${nace}`,
          depth: partitionDepth + 1,
          partitionKey: buildPartitionKeyWithoutPage(
            { ...activeFilter, czNace: [nace] },
            partitionCtx,
          ),
        }));
      }
    }

    if (children.length === 0) return false;

    await this.replacePartitionAtIndex(jobId, checkpoint, idx, children, partitionCtx);

    await this.appendAudit(
      jobId,
      `Auto-split partition ${partitionLabel} → ${children.length} children (>1000 výsledků)`,
    );
    return true;
  }
}
