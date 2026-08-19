import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import {
  CompanyDirectoryCategory,
  CompanyImportItemResult,
  CompanyImportJobStatus,
  CompanyImportSyncType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AresApiException, AresService } from './ares.service';
import type { AresEconomicSubject, AresSearchFilter } from './ares.types';
import {
  ARES_IMPORT_BATCH_SIZE,
  ARES_IMPORT_BATCH_SIZE_OPTIONS,
  ARES_IMPORT_DELAY_MS,
  ARES_IMPORT_ENABLED,
  ARES_IMPORT_MAX_REQUESTS_PER_RUN,
  ARES_IMPORT_MAX_RETRIES,
  ARES_IMPORT_RETRY_DELAYS_MS,
  ARES_PAGE_SIZE,
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
import { aresRequestHash, fingerprintOverlapRatio, responseIcoFingerprint } from './ares-request-hash.util';
import { ARES_API_VERSION, ARES_PAGINATION } from './ares-api.constants';
import { AresQueryPartitionService } from './ares-query-partition.service';
import { normalizeAresCompanyForDb } from './company-directory.serializer';
import { getAresImportSkipReason } from './ares-company-importability.util';
import { CompanyEventsService } from './company-events.service';
import { CompanyImportPartitionService } from './company-import-partition.service';
import { AresImportWorkerService } from './ares-import-worker.service';
import { computeJobProgress, computePartitionBasedProgress } from './company-job-progress.util';
import { CompanyDirectorySettingsService } from './company-directory-settings.service';
import type { CompanyImportPartition } from '@prisma/client';

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
  syncType?: CompanyImportSyncType;
  masterSync?: boolean;
  partitionLimit?: number;
};

@Injectable()
export class CompanyImportService {
  private readonly log = new Logger(CompanyImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ares: AresService,
    private readonly partitionService: AresQueryPartitionService,
    private readonly importPartitions: CompanyImportPartitionService,
    @Inject(forwardRef(() => CompanyEventsService))
    private readonly events: CompanyEventsService,
    @Inject(forwardRef(() => AresImportWorkerService))
    private readonly aresWorker: AresImportWorkerService,
    private readonly automationSettings: CompanyDirectorySettingsService,
  ) {}

  private wakeWorker(): void {
    void this.aresWorker.pulse();
  }

  async startMasterSync(input?: {
    batchSize?: number;
    delayMs?: number;
    limit?: number;
    partitionLimit?: number;
  }) {
    const aresSettings = this.automationSettings.getCached().aresImport;
    return this.startImport({
      region: 'Celá ČR',
      batchSize: input?.batchSize ?? aresSettings.batchSize,
      delayMs: input?.delayMs ?? aresSettings.delayMs,
      importMode: 'SEARCH',
      syncType: 'ARES_CZ_MASTER_SYNC',
      masterSync: true,
      limit: input?.limit,
      partitionLimit: input?.partitionLimit,
    });
  }

  async startMiniMasterSync() {
    const aresSettings = this.automationSettings.getCached().aresImport;
    return this.startMasterSync({
      partitionLimit: 5,
      batchSize: aresSettings.batchSize,
      delayMs: aresSettings.delayMs,
    });
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
    const partitionCtx = {
      category: sanitized.category ?? null,
      region: wholeCountry ? 'Celá ČR' : sanitized.region ?? null,
      district: sanitized.district ?? null,
      city: sanitized.city ?? null,
      wholeCountry,
      masterSync:
        sanitized.masterSync ||
        sanitized.syncType === 'ARES_CZ_MASTER_SYNC' ||
        sanitized.syncType === 'ALL_CZECH_COMPANIES',
    };

    if (
      importMode === 'SEARCH' &&
      !partitionCtx.masterSync &&
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
    const syncType =
      sanitized.syncType ??
      (partitionCtx.masterSync ? CompanyImportSyncType.ARES_CZ_MASTER_SYNC : CompanyImportSyncType.TARGETED);

    let initialCheckpoint: Prisma.InputJsonValue | undefined;
    if (importMode === 'SEARCH') {
      let parts = buildInitialPartitions(baseFilter, partitionCtx);
      if (partitionCtx.masterSync && sanitized.partitionLimit) {
        parts = parts.slice(0, Math.max(1, sanitized.partitionLimit));
      }
      const checkpoint = createEmptySearchCheckpoint(importLimit);
      checkpoint.phase = parts.length > 1 ? 'PARTITIONING' : 'RUNNING';
      checkpoint.subQueries = parts.map((p) => p.filter);
      checkpoint.subQueryLabels = parts.map((p) => p.label);
      checkpoint.subQueryDepths = parts.map((p) => p.depth);
      checkpoint.regionsTotal = partitionCtx.masterSync ? null : wholeCountry ? 14 : null;
      initialCheckpoint = checkpoint as unknown as Prisma.InputJsonValue;
      this.log.log(
        `[ARES-IMPORT] created partitions count=${parts.length} wholeCountry=${wholeCountry}`,
      );
    }

    try {
      const job = await this.prisma.companyImportJob.create({
        data: {
          syncType,
          category: partitionCtx.masterSync ? null : sanitized.category ?? null,
          region: wholeCountry ? 'Celá ČR' : sanitized.region?.trim() || null,
          district: sanitized.district?.trim() || null,
          city: sanitized.city?.trim() || null,
          batchSize: sanitized.batchSize,
          delayMs: sanitized.delayMs,
          importMode,
          icoList: importMode === 'ICO_LIST' ? (sanitized.icoList ?? []) : [],
          searchFilter: searchFilter as Prisma.InputJsonValue,
          checkpoint: initialCheckpoint,
          status: CompanyImportJobStatus.QUEUED,
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

      this.wakeWorker();

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
        ? (() => {
            const v = Math.floor(input.batchSize);
            if ((ARES_IMPORT_BATCH_SIZE_OPTIONS as readonly number[]).includes(v)) return v;
            return Math.min(1000, Math.max(100, v));
          })()
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
            CompanyImportJobStatus.QUEUED,
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
          job.status === CompanyImportJobStatus.QUEUED ||
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
        status: CompanyImportJobStatus.QUEUED,
        pauseRequested: false,
        cancelRequested: false,
        error: null,
        finishedAt: null,
      },
    });
    this.wakeWorker();
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
        status: CompanyImportJobStatus.QUEUED,
        error: null,
        finishedAt: null,
        pauseRequested: false,
        cancelRequested: false,
        checkpoint: checkpoint as unknown as Prisma.InputJsonValue,
      },
    });
    this.wakeWorker();
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
    this.wakeWorker();
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

  async listRequestLogs(jobId?: string, limit = 50) {
    return this.prisma.aresImportRequestLog.findMany({
      where: jobId ? { jobId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Math.max(1, limit)),
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

  async processWorkerBatch(jobId: string, workerId: string) {
    const dbPartitionCount = await this.prisma.companyImportPartition.count({ where: { jobId } });
    if (dbPartitionCount > 0) {
      await this.processDbPartitionBatch(jobId, workerId);
      return;
    }
    await this.processJobBatch(jobId, workerId);
  }

  async processOnePartitionNow(jobId?: string) {
    const targetJob =
      jobId != null
        ? await this.getJobOrThrow(jobId)
        : await this.prisma.companyImportJob.findFirst({
            where: {
              status: {
                in: [
                  CompanyImportJobStatus.QUEUED,
                  CompanyImportJobStatus.PENDING,
                  CompanyImportJobStatus.RUNNING,
                ],
              },
            },
            orderBy: { createdAt: 'asc' },
          });
    if (!targetJob) {
      throw new NotFoundException('Žádná aktivní importní úloha.');
    }

    const workerId = `diagnostic:${process.pid}`;
    const partition = await this.importPartitions.claimNextPartition(targetJob.id, workerId);
    if (!partition) {
      throw new BadRequestException('Úloha nemá žádný PENDING partition.');
    }

    const activeFilter = partition.filtersJson as AresSearchFilter;
    const pocet = Math.min(20, targetJob.batchSize ?? 100);
    const started = Date.now();
    this.log.log(
      `[ARES-WORKER] sending ARES request partition=${partition.label ?? partition.id}`,
    );
    const response = await this.ares.searchCompanies({
      ...activeFilter,
      start: partition.cursor,
      pocet,
    });
    const subjects = response.ekonomickeSubjekty ?? [];
    const { icos } = icosFromSubjects(subjects);
    const existingRows = icos.length
      ? await this.prisma.companyDirectoryEntry.findMany({
          where: { ico: { in: icos } },
          select: { ico: true },
        })
      : [];
    const existingSet = new Set(existingRows.map((r) => r.ico));
    let created = 0;
    let updated = 0;
    const partitionCtx = this.partitionService.buildContext(targetJob);
    partitionCtx.masterSync =
      targetJob.syncType === 'ARES_CZ_MASTER_SYNC' ||
      targetJob.syncType === 'ALL_CZECH_COMPANIES';
    const hintCategory = partitionCtx.masterSync ? null : targetJob.category;

    for (const subject of subjects.slice(0, 10)) {
      const result = await this.upsertFromSubject(subject, hintCategory, targetJob.id);
      if (result.action === 'created') created += 1;
      if (result.action === 'updated') updated += 1;
    }

    await this.prisma.companyImportJob.update({
      where: { id: targetJob.id },
      data: {
        status: CompanyImportJobStatus.RUNNING,
        requestsCount: { increment: 1 },
        lastWorkerActivityAt: new Date(),
        heartbeatAt: new Date(),
      },
    });

    return {
      jobId: targetJob.id,
      partitionId: partition.id,
      partitionLabel: partition.label,
      httpStatus: 200,
      aresTotal: response.pocetCelkem ?? null,
      returned: subjects.length,
      uniqueIco: new Set(icos).size,
      newCompany: created,
      existingCompany: existingSet.size,
      updated,
      durationMs: Date.now() - started,
      requestBody: sanitizeAresRequestBody({ ...activeFilter, start: partition.cursor, pocet }),
    };
  }

  async requeueJob(jobId: string) {
    await this.getJobOrThrow(jobId);
    await this.prisma.companyImportJob.update({
      where: { id: jobId },
      data: {
        status: CompanyImportJobStatus.QUEUED,
        error: null,
        pauseRequested: false,
        cancelRequested: false,
        finishedAt: null,
      },
    });
    await this.importPartitions.repairFailedJob(jobId);
    this.wakeWorker();
    return this.serializeJob(
      await this.prisma.companyImportJob.findUniqueOrThrow({ where: { id: jobId } }),
    );
  }

  private async acknowledgePauseIfRequested(jobId: string) {
    const job = await this.prisma.companyImportJob.findUnique({ where: { id: jobId } });
    if (!job?.pauseRequested) return false;
    if (
      job.status === CompanyImportJobStatus.PAUSE_REQUESTED ||
      job.status === CompanyImportJobStatus.RUNNING ||
      job.status === CompanyImportJobStatus.QUEUED ||
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

  private async processDbPartitionBatch(jobId: string, workerId: string) {
    const job = await this.prisma.companyImportJob.findUnique({ where: { id: jobId } });
    if (!job) return;
    const createdAtBatchStart = job.created;

    if (
      job.status !== CompanyImportJobStatus.QUEUED &&
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

    await this.prisma.companyImportJob.update({
      where: { id: jobId },
      data: {
        status: CompanyImportJobStatus.RUNNING,
        startedAt: job.startedAt ?? new Date(),
        error: null,
        heartbeatAt: new Date(),
      },
    });

    const companiesPerBatch = job.batchSize ?? ARES_IMPORT_BATCH_SIZE;
    const delayMs = job.delayMs ?? ARES_IMPORT_DELAY_MS;
    const maxRetries = ARES_IMPORT_MAX_RETRIES;
    const maxRequests = ARES_IMPORT_MAX_REQUESTS_PER_RUN;
    let requests = 0;
    let created = job.created;
    let updated = job.updated;
    let failed = job.failed;
    let skipped = job.skipped;
    let processed = job.processed;
    let alreadySeenSkipped = job.alreadySeenSkipped ?? 0;
    let inactiveSkipped = job.inactiveSkipped ?? 0;
    let companiesInWorkerBatch = 0;
    let lastIco: string | null = job.lastIco;
    const partitionCtx = this.partitionService.buildContext(job);
    partitionCtx.masterSync =
      job.syncType === 'ARES_CZ_MASTER_SYNC' || job.syncType === 'ALL_CZECH_COMPANIES';
    const hintCategory = partitionCtx.masterSync ? null : job.category;

    try {
      while (requests < maxRequests && companiesInWorkerBatch < companiesPerBatch) {
        if (await this.shouldAbortJob(jobId)) {
          await this.handleAbortSignals(jobId);
          return;
        }

        let partition = await this.prisma.companyImportPartition.findFirst({
          where: { jobId, status: 'RUNNING', lockedBy: workerId },
          orderBy: { sortOrder: 'asc' },
        });
        if (!partition) {
          partition = await this.importPartitions.claimNextPartition(jobId, workerId);
        }
        if (!partition) {
          const pending = await this.prisma.companyImportPartition.count({
            where: { jobId, status: 'PENDING' },
          });
          if (pending === 0) {
            await this.prisma.companyImportJob.update({
              where: { id: jobId },
              data: {
                status:
                  job.warningCode != null
                    ? CompanyImportJobStatus.COMPLETED_WITH_WARNINGS
                    : CompanyImportJobStatus.COMPLETED,
                finishedAt: new Date(),
                lastWorkerActivityAt: new Date(),
              },
            });
          } else {
            await this.releaseJobToQueue(jobId, requests);
          }
          return;
        }

        const partitionLabel = partition.label ?? partition.partitionKey ?? partition.id;
        this.log.log(
          `[ARES-WORKER] partition=${partitionLabel} cursor=${partition.cursor} batch=${companiesInWorkerBatch}/${companiesPerBatch}`,
        );
        await this.aresWorker.updateProcessingContext(jobId, partition.id, partition.label);

        const activeFilter = partition.filtersJson as AresSearchFilter;
        let start = partition.cursor;

        if (start === 0) {
          try {
            requests += 1;
            const countResult = await this.partitionService.countPartition(activeFilter, partitionCtx, {
              partitionId: partition.id,
              partitionLabel,
            });
            if (this.partitionService.needsFurtherSplit(countResult.total)) {
              this.log.warn(
                `[ARES-WORKER] SPLIT_REQUIRED partition=${partitionLabel} total=${countResult.total}`,
              );
              await this.appendAudit(
                jobId,
                `PARTITION_SPLIT: ${partitionLabel} — ${countResult.total} výsledků (>1000)`,
              );
              const splitOk = await this.attemptDbPartitionSplit(jobId, partition, partitionCtx);
              if (splitOk) continue;
              continue;
            }
          } catch (err) {
            if (isAresTooManyResultsError(err)) {
              this.log.warn(`[ARES-WORKER] TOO_MANY_RESULTS on count — splitting ${partitionLabel}`);
              await this.appendAudit(jobId, `PARTITION_SPLIT: ${partitionLabel} — TOO_MANY_RESULTS`);
              const splitOk = await this.attemptDbPartitionSplit(jobId, partition, partitionCtx);
              if (splitOk) continue;
              continue;
            }
            await this.markPartitionFailed(partition.id, err);
            continue;
          }
        }

        if (requests >= maxRequests || companiesInWorkerBatch >= companiesPerBatch) break;

        const fetchPocet = ARES_PAGE_SIZE;
        requests += 1;
        const fetchStarted = Date.now();
        this.log.log(
          `[ARES-WORKER] ARES_REQUEST partition=${partitionLabel} offset=${start} pocet=${fetchPocet}`,
        );

        let response;
        try {
          response = await this.fetchAresWithRetry(
            { ...activeFilter, start, pocet: fetchPocet },
            { jobId, partitionLabel, maxRetries },
          );
        } catch (err) {
          if (isAresTooManyResultsError(err)) {
            await this.appendAudit(jobId, `PARTITION_SPLIT: ${partitionLabel} — TOO_MANY_RESULTS při fetch`);
            const splitOk = await this.attemptDbPartitionSplit(jobId, partition, partitionCtx);
            if (splitOk) continue;
            continue;
          }
          await this.markPartitionFailed(partition.id, err);
          continue;
        }

        const subjects = response.ekonomickeSubjekty ?? [];
        const subTotal = response.pocetCelkem ?? null;
        const partitionKey = partition.partitionKey ?? partition.id;
        const { firstIco, lastIco: pageLastIco } = icosFromSubjects(subjects);

        if (subTotal != null && subTotal > 1000 && start === 0) {
          await this.appendAudit(
            jobId,
            `PARTITION_SPLIT: ${partitionLabel} — pocetCelkem=${subTotal}`,
          );
          const splitOk = await this.attemptDbPartitionSplit(jobId, partition, partitionCtx);
          if (splitOk) continue;
          continue;
        }

        for (const subject of subjects) {
          if (companiesInWorkerBatch >= companiesPerBatch) break;

          const normalizedIco = subject.ico.replace(/\D/g, '').padStart(8, '0');
          const seenInJob = await this.safeSeenLookup(jobId, normalizedIco);
          if (seenInJob) {
            skipped += 1;
            alreadySeenSkipped += 1;
            continue;
          }

          try {
            const result = await this.upsertFromSubject(subject, hintCategory, jobId);
            if (result.action === 'created') created += 1;
            if (result.action === 'updated') updated += 1;
            if (result.action === 'skipped') {
              skipped += 1;
              inactiveSkipped += 1;
            }
            await this.safeSeenUpsert(jobId, normalizedIco, partitionKey);
            processed += 1;
            companiesInWorkerBatch += 1;
            lastIco = normalizedIco;
          } catch {
            failed += 1;
            processed += 1;
            companiesInWorkerBatch += 1;
          }
        }

        const nextCursor = start + subjects.length;
        const maxFetchable = subTotal != null ? Math.min(subTotal, 1000) : nextCursor;
        const exhausted =
          subjects.length === 0 ||
          subjects.length < fetchPocet ||
          nextCursor >= maxFetchable;

        this.log.log(
          `[ARES-WORKER] partition=${partitionLabel} offset=${start} returned=${subjects.length} firstIco=${firstIco ?? '—'} lastIco=${pageLastIco ?? '—'} nextCursor=${nextCursor} exhausted=${exhausted}`,
        );

        await this.prisma.aresImportRequestLog.create({
          data: {
            jobId,
            endpoint: ARES_SEARCH_ENDPOINT,
            requestHash: aresRequestHash(sanitizeAresRequestBody({ ...activeFilter, start, pocet: fetchPocet })),
            requestBody: sanitizeAresRequestBody({ ...activeFilter, start, pocet: fetchPocet }) as Prisma.InputJsonValue,
            httpStatus: 200,
            returnedCount: subjects.length,
            pocetCelkem: subTotal,
            offset: start,
            durationMs: Date.now() - fetchStarted,
            responseFingerprint: responseIcoFingerprint(icosFromSubjects(subjects).icos),
          },
        });

        if (exhausted) {
          await this.importPartitions.completePartition(partition.id, {
            cursor: nextCursor,
            processedCount: nextCursor,
          });
          await this.appendAudit(jobId, `PARTITION_COMPLETED: ${partitionLabel}`);
        } else {
          await this.prisma.companyImportPartition.update({
            where: { id: partition.id },
            data: {
              cursor: nextCursor,
              processedCount: nextCursor,
              lockedBy: workerId,
              lockedAt: new Date(),
            },
          });
        }

        await this.prisma.companyImportJob.update({
          where: { id: jobId },
          data: {
            processed,
            created,
            updated,
            failed,
            skipped,
            alreadySeenSkipped,
            inactiveSkipped,
            lastIco,
            jobUniqueIcoCount: await this.safeSeenCount(jobId),
            requestsCount: { increment: 1 },
            lastWorkerActivityAt: new Date(),
            heartbeatAt: new Date(),
          },
        });

        if (delayMs > 0) {
          await this.sleep(delayMs);
        }
      }

      await this.releaseJobToQueue(jobId, requests, {
        processed,
        created,
        updated,
        failed,
        skipped,
        alreadySeenSkipped,
        inactiveSkipped,
        createdAtBatchStart,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.error(`[ARES-WORKER] batch failed job=${jobId}: ${message}`);
      await this.prisma.companyImportJob.update({
        where: { id: jobId },
        data: {
          status: CompanyImportJobStatus.QUEUED,
          error: message,
          requestsCount: requests > 0 ? { increment: requests } : undefined,
          lastWorkerActivityAt: new Date(),
        },
      });
    }
  }

  private async fetchAresWithRetry(
    filter: AresSearchFilter,
    meta: { jobId: string; partitionLabel?: string; maxRetries?: number },
  ) {
    const maxRetries = meta.maxRetries ?? ARES_IMPORT_MAX_RETRIES;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.ares.searchCompanies(filter);
      } catch (err) {
        lastErr = err;
        if (isAresTooManyResultsError(err)) throw err;
        const retryable =
          err instanceof AresApiException &&
          (err.statusCode === 429 || err.statusCode >= 500);
        const network =
          err instanceof Error &&
          (err.message.toLowerCase().includes('fetch') ||
            err.message.toLowerCase().includes('timeout') ||
            err.message.toLowerCase().includes('network'));
        if (!retryable && !network) throw err;
        if (attempt < maxRetries) {
          const delay = ARES_IMPORT_RETRY_DELAYS_MS[Math.min(attempt, ARES_IMPORT_RETRY_DELAYS_MS.length - 1)];
          await this.appendAudit(
            meta.jobId,
            `RETRY: ${meta.partitionLabel ?? 'partition'} attempt ${attempt + 1}/${maxRetries} za ${delay}ms`,
          );
          await this.sleep(delay);
        }
      }
    }
    throw lastErr;
  }

  private async attemptDbPartitionSplit(
    jobId: string,
    partition: CompanyImportPartition,
    partitionCtx: ReturnType<AresQueryPartitionService['buildContext']>,
  ): Promise<boolean> {
    const activeFilter = partition.filtersJson as AresSearchFilter;
    const depth = partition.depth ?? 0;
    let children = this.partitionService.furtherPartitions(activeFilter, partitionCtx, depth);

    if (children.length === 0 && activeFilter.czNace?.length === 1) {
      const subs = subdivideNaceCode(activeFilter.czNace[0]);
      if (subs.length > 1) {
        children = subs.map((nace) => ({
          filter: { ...activeFilter, czNace: [nace], start: 0, pocet: ARES_PAGE_SIZE },
          label: `${partition.label ?? 'partition'} · nace=${nace}`,
          depth: depth + 1,
        }));
      }
    }

    if (children.length === 0) {
      await this.prisma.companyImportPartition.update({
        where: { id: partition.id },
        data: {
          status: 'FAILED',
          error: 'UNRESOLVED_PARTITION — nelze dále bezpečně rozdělit',
          completedAt: new Date(),
          lockedBy: null,
          lockedAt: null,
        },
      });
      await this.appendAudit(
        jobId,
        `FAILED_PARTITION: ${partition.label ?? partition.id} — UNRESOLVED_PARTITION`,
      );
      return false;
    }

    await this.importPartitions.splitPartition(
      partition.id,
      children.map((c) => ({
        filter: c.filter,
        label: c.label,
        depth: c.depth,
        partitionKey: buildPartitionKeyWithoutPage(c.filter, partitionCtx),
      })),
      partitionCtx,
    );
    await this.appendAudit(
      jobId,
      `PARTITION_SPLIT: ${partition.label ?? partition.id} → ${children.length} children`,
    );
    return true;
  }

  private async markPartitionFailed(partitionId: string, err: unknown) {
    const message = err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500);
    await this.prisma.companyImportPartition.update({
      where: { id: partitionId },
      data: {
        status: 'FAILED',
        error: message,
        completedAt: new Date(),
        lockedBy: null,
        lockedAt: null,
      },
    });
  }

  private async releaseJobToQueue(
    jobId: string,
    requests: number,
    stats?: {
      processed: number;
      created: number;
      updated: number;
      failed: number;
      skipped: number;
      alreadySeenSkipped: number;
      inactiveSkipped: number;
      createdAtBatchStart: number;
    },
  ) {
    const warningCode =
      stats && (stats.created === stats.createdAtBatchStart) && requests > 10
        ? 'WARNING_NO_NEW_COMPANIES'
        : undefined;

    await this.prisma.companyImportJob.update({
      where: { id: jobId },
      data: {
        ...(stats
          ? {
              processed: stats.processed,
              created: stats.created,
              updated: stats.updated,
              failed: stats.failed,
              skipped: stats.skipped,
              alreadySeenSkipped: stats.alreadySeenSkipped,
              inactiveSkipped: stats.inactiveSkipped,
              jobUniqueIcoCount: await this.safeSeenCount(jobId),
            }
          : {}),
        requestsCount: requests > 0 ? { increment: requests } : undefined,
        lastWorkerActivityAt: requests > 0 ? new Date() : undefined,
        heartbeatAt: new Date(),
        status: CompanyImportJobStatus.QUEUED,
        warningCode,
      },
    });
  }

  private async safeSeenLookup(jobId: string, ico: string) {
    try {
      return await this.prisma.aresSyncSeenCompany.findUnique({
        where: { jobId_ico: { jobId, ico } },
      });
    } catch {
      return null;
    }
  }

  private async safeSeenUpsert(jobId: string, ico: string, partitionKey: string) {
    try {
      await this.prisma.aresSyncSeenCompany.upsert({
        where: { jobId_ico: { jobId, ico } },
        create: { jobId, ico, partitionKey },
        update: {},
      });
    } catch {
      // table may not exist before migration
    }
  }

  private async safeSeenCount(jobId: string) {
    try {
      return await this.prisma.aresSyncSeenCompany.count({ where: { jobId } });
    } catch {
      return 0;
    }
  }

  private async processJobBatch(jobId: string, workerId = 'legacy') {
    const job = await this.prisma.companyImportJob.findUnique({ where: { id: jobId } });
    if (!job) return;
    const createdAtBatchStart = job.created;
    if (
      job.status !== CompanyImportJobStatus.QUEUED &&
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
        lastWorkerActivityAt: new Date(),
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
            lastWorkerActivityAt: new Date(),
            heartbeatAt: new Date(),
            checkpoint: { mode: 'ICO_LIST', index: nextCursor } as Prisma.InputJsonValue,
            status: done ? CompanyImportJobStatus.COMPLETED : CompanyImportJobStatus.QUEUED,
            finishedAt: done ? new Date() : null,
          },
        });
        return;
      }

      const baseFilter = (job.searchFilter ?? this.buildSearchFilter(job)) as AresSearchFilter;
      const pocet = batchSize;
      const partitionCtx = this.partitionService.buildContext(job);
      partitionCtx.wholeCountry = isWholeCountryRegion(job.region);
      partitionCtx.masterSync =
        job.syncType === 'ARES_CZ_MASTER_SYNC' || job.syncType === 'ALL_CZECH_COMPANIES';

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
        await this.persistCheckpoint(jobId, checkpoint);
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
        await this.persistCheckpoint(jobId, checkpoint, requests, true);
        return;
      }

      if (await this.shouldAbortJob(jobId)) {
        await this.handleAbortSignals(jobId);
        return;
      }

      const requestBody = sanitizeAresRequestBody({ ...activeFilter, start, pocet });
      const reqHash = aresRequestHash(requestBody);
      const priorHashes = checkpoint.requestHashes ?? {};
      const duplicateQuery = Object.values(priorHashes).includes(reqHash);
      if (duplicateQuery) {
        this.log.warn(`[ARES-IMPORT] DUPLICATE_QUERY job=${jobId} partition=${idx} hash=${reqHash}`);
        await this.appendAudit(jobId, `DUPLICATE_QUERY: partition ${partitionLabel} — stejný ARES request`);
        await this.prisma.aresImportRequestLog.create({
          data: {
            jobId,
            endpoint: ARES_SEARCH_ENDPOINT,
            requestHash: reqHash,
            requestBody: requestBody as Prisma.InputJsonValue,
            httpStatus: 0,
            returnedCount: 0,
            offset: start,
            duplicateQuery: true,
            errorMessage: 'DUPLICATE_QUERY — request skipped',
          },
        });
        checkpoint.subQueryIndex = idx + 1;
        checkpoint.subQueryStart = 0;
        await this.prisma.companyImportJob.update({
          where: { id: jobId },
          data: {
            duplicateQueryCount: { increment: 1 },
            checkpoint: checkpoint as unknown as Prisma.InputJsonValue,
            status: CompanyImportJobStatus.QUEUED,
            lastWorkerActivityAt: new Date(),
          },
        });
        return;
      }
      priorHashes[String(idx)] = reqHash;
      checkpoint.requestHashes = priorHashes;

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

      let alreadySeenSkipped = job.alreadySeenSkipped ?? 0;
      let inactiveSkipped = job.inactiveSkipped ?? 0;

      const importLimit = checkpoint.importLimit;

      for (const subject of subjects) {
        if (importLimit != null && processed >= importLimit) break;
        if (await this.shouldAbortJob(jobId)) {
          await this.persistCheckpoint(jobId, checkpoint, requests, true);
          await this.handleAbortSignals(jobId);
          return;
        }

        rawResults += 1;
        const normalizedIco = subject.ico.replace(/\D/g, '').padStart(8, '0');
        const seenInJob = await this.prisma.aresSyncSeenCompany.findUnique({
          where: { jobId_ico: { jobId, ico: normalizedIco } },
        });
        if (seenInJob) {
          skipped += 1;
          duplicatesSkipped += 1;
          alreadySeenSkipped += 1;
          batchSkipped += 1;
          continue;
        }

        try {
          const hintCategory = partitionCtx.masterSync ? null : job.category;
          const result = await this.upsertFromSubject(subject, hintCategory, jobId);
          if (result.action === 'created') {
            created += 1;
            batchCreated += 1;
            checkpoint.newCompaniesSinceStart = (checkpoint.newCompaniesSinceStart ?? 0) + 1;
            checkpoint.lastNewCompanyAt = new Date().toISOString();
            checkpoint.requestsSinceLastCreate = 0;
          } else {
            checkpoint.requestsSinceLastCreate = (checkpoint.requestsSinceLastCreate ?? 0) + 1;
          }
          if (result.action === 'updated') {
            updated += 1;
            batchUpdated += 1;
          }
          if (result.action === 'skipped') {
            skipped += 1;
            batchSkipped += 1;
            inactiveSkipped += 1;
          }
          await this.prisma.aresSyncSeenCompany.upsert({
            where: { jobId_ico: { jobId, ico: normalizedIco } },
            create: { jobId, ico: normalizedIco, partitionKey },
            update: {},
          });
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
      const pageIcoFp = responseIcoFingerprint(responseIcos);
      const fingerprints = { ...(checkpoint.resultFingerprints ?? {}) };
      const responseIcoFps = { ...(checkpoint.responseIcoFingerprints ?? {}) };
      let duplicateResultSet = false;
      let suspiciousDuplicate = false;
      let duplicateOfPartitionIndex: number | null = null;
      for (const [partitionIndex, existingFingerprint] of Object.entries(fingerprints)) {
        if (existingFingerprint === fingerprint && partitionIndex !== String(idx)) {
          duplicateResultSet = true;
          duplicateOfPartitionIndex = Number(partitionIndex);
          break;
        }
      }
      for (const [partitionIndex, existingIcoFp] of Object.entries(responseIcoFps)) {
        if (
          partitionIndex !== String(idx) &&
          existingIcoFp === pageIcoFp &&
          responseIcos.length >= 5
        ) {
          suspiciousDuplicate = true;
          duplicateOfPartitionIndex = Number(partitionIndex);
          break;
        }
      }
      fingerprints[String(idx)] = fingerprint;
      responseIcoFps[String(idx)] = pageIcoFp;
      checkpoint.resultFingerprints = fingerprints;
      checkpoint.responseIcoFingerprints = responseIcoFps;
      checkpoint.currentRequestRows = subjects.length;
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
      await this.prisma.aresImportRequestLog.create({
        data: {
          jobId,
          endpoint: ARES_SEARCH_ENDPOINT,
          requestHash: reqHash,
          requestBody: requestBody as Prisma.InputJsonValue,
          httpStatus: 200,
          pocetCelkem: subTotal,
          returnedCount: subjects.length,
          uniqueIcoCount: new Set(responseIcos).size,
          createdCount: batchCreated,
          updatedCount: batchUpdated,
          seenInJobCount: batchSkipped,
          offset: start,
          durationMs: fetchDurationMs,
          responseFingerprint: pageIcoFp,
          duplicateQuery: false,
          suspiciousDuplicate,
        },
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
      if (suspiciousDuplicate) {
        this.log.warn(
          `[ARES-IMPORT] SUSPICIOUS_DUPLICATE_RESULT_SET job=${jobId} partition=${idx} duplicateOf=${duplicateOfPartitionIndex}`,
        );
        await this.appendAudit(
          jobId,
          `SUSPICIOUS_DUPLICATE_RESULT_SET: partition ${idx} shodná množina IČO jako partition ${duplicateOfPartitionIndex}`,
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
          alreadySeenSkipped,
          inactiveSkipped,
          jobUniqueIcoCount: await this.prisma.aresSyncSeenCompany.count({ where: { jobId } }),
          lastCursor: nextSubQueryStart,
          lastIco,
          totalExpected,
          requestsCount: { increment: requests },
          lastWorkerActivityAt: new Date(),
          heartbeatAt: new Date(),
          checkpoint: checkpoint as unknown as Prisma.InputJsonValue,
          status: noMore ? CompanyImportJobStatus.COMPLETED : CompanyImportJobStatus.QUEUED,
          finishedAt: noMore ? new Date() : null,
          error: null,
          warningCode:
            (checkpoint.requestsSinceLastCreate ?? 0) > 50 && created === createdAtBatchStart
              ? 'WARNING_NO_NEW_COMPANIES'
              : undefined,
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
            status: CompanyImportJobStatus.QUEUED,
            error: null,
            checkpoint: this.mergeCheckpoint(failedJob?.checkpoint, {
              needsResplit: true,
              phase: 'PARTITIONING',
            }),
            lastWorkerActivityAt: new Date(),
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
    masterSync?: boolean;
    syncType?: CompanyImportSyncType;
  }) {
    return buildAresSearchFilter({
      ...input,
      masterSync:
        input.masterSync ||
        input.syncType === 'ARES_CZ_MASTER_SYNC' ||
        input.syncType === 'ALL_CZECH_COMPANIES',
    });
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

  async recoverStaleJobs() {
    const staleMs = 10 * 60 * 1000;
    const cutoff = new Date(Date.now() - staleMs);
    const stale = await this.prisma.companyImportJob.findMany({
      where: {
        status: CompanyImportJobStatus.RUNNING,
        OR: [
          { lastWorkerActivityAt: { lt: cutoff } },
          { heartbeatAt: { lt: cutoff } },
          { lastWorkerActivityAt: null, startedAt: { lt: cutoff } },
        ],
      },
    });
    for (const job of stale) {
      await this.prisma.companyImportJob.update({
        where: { id: job.id },
        data: {
          status: CompanyImportJobStatus.QUEUED,
          error: 'Úloha obnovena po neaktivním workeru.',
        },
      });
      this.log.warn(`[ARES-IMPORT] recovered stale import job ${job.id}`);
    }
    if (stale.length) this.wakeWorker();
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
    lastWorkerActivityAt?: Date | null;
    heartbeatAt?: Date | null;
    searchFilter?: Prisma.JsonValue;
    checkpoint?: Prisma.JsonValue | null;
    auditLog?: Prisma.JsonValue | null;
    pauseRequested?: boolean;
    cancelRequested?: boolean;
    jobUniqueIcoCount?: number | null;
    alreadySeenSkipped?: number | null;
    inactiveSkipped?: number | null;
    duplicateQueryCount?: number | null;
    warningCode?: string | null;
    syncType?: string | null;
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
      lastWorkerActivityAt: job.lastWorkerActivityAt?.toISOString() ?? null,
      lastActivityAt: job.lastWorkerActivityAt?.toISOString() ?? null,
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
      jobUniqueIcoCount: job.jobUniqueIcoCount ?? uniqueIcoCount,
      alreadySeenSkipped: job.alreadySeenSkipped ?? null,
      inactiveSkipped: job.inactiveSkipped ?? null,
      duplicateQueryCount: job.duplicateQueryCount ?? null,
      warningCode: job.warningCode ?? null,
      syncType: job.syncType,
      currentRequestRows: checkpoint?.currentRequestRows ?? null,
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
        lastWorkerActivityAt: new Date(),
        status: CompanyImportJobStatus.QUEUED,
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
    checkpoint: AresSearchCheckpoint,
    requestsIncrement = 0,
    workerActivity = false,
  ) {
    await this.prisma.companyImportJob.update({
      where: { id: jobId },
      data: {
        checkpoint: checkpoint as unknown as Prisma.InputJsonValue,
        heartbeatAt: new Date(),
        status: CompanyImportJobStatus.QUEUED,
        ...(requestsIncrement > 0 ? { requestsCount: { increment: requestsIncrement } } : {}),
        ...(workerActivity ? { lastWorkerActivityAt: new Date() } : {}),
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
