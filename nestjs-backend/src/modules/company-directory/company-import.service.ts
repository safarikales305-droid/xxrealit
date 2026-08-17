import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
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
  type AresSearchCheckpoint,
} from './ares-import-split.util';
import { AresQueryPartitionService } from './ares-query-partition.service';
import { normalizeAresCompanyForDb } from './company-directory.serializer';
import { getAresImportSkipReason } from './ares-company-importability.util';
import { computeJobProgress } from './company-job-progress.util';

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

    const running = await this.prisma.companyImportJob.findFirst({
      where: { status: CompanyImportJobStatus.RUNNING },
    });
    if (running) {
      throw new BadRequestException('Již běží jiný import. Nejprve ho pozastavte nebo dokončete.');
    }

    const importMode = input.importMode ?? (input.icoList?.length ? 'ICO_LIST' : 'SEARCH');
    const wholeCountry = isWholeCountryRegion(input.region);
    if (
      importMode === 'SEARCH' &&
      !wholeCountry &&
      !input.city?.trim() &&
      !input.region?.trim() &&
      !input.district?.trim()
    ) {
      throw new BadRequestException(
        'Pro vyhledávací import zadejte Celá ČR, kraj, okres nebo město.',
      );
    }
    const searchFilter = this.buildSearchFilter(input);
    const importLimit =
      input.limit != null && Number.isFinite(input.limit) && input.limit > 0
        ? Math.floor(input.limit)
        : null;

    const baseFilter = searchFilter as AresSearchFilter;
    const partitionCtx = {
      category: input.category ?? null,
      region: wholeCountry ? 'Celá ČR' : input.region ?? null,
      district: input.district ?? null,
      city: input.city ?? null,
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
    }

    return this.prisma.companyImportJob.create({
      data: {
        category: input.category ?? null,
        region: wholeCountry ? 'Celá ČR' : input.region?.trim() || null,
        district: input.district?.trim() || null,
        city: input.city?.trim() || null,
        batchSize: input.batchSize ?? undefined,
        delayMs: input.delayMs ?? undefined,
        importMode,
        icoList: (input.icoList ?? []).map((ico) => ico.replace(/\D/g, '').padStart(8, '0')),
        searchFilter: searchFilter as Prisma.InputJsonValue,
        checkpoint: initialCheckpoint,
        status: CompanyImportJobStatus.PENDING,
        totalExpected:
          importMode === 'ICO_LIST'
            ? (input.icoList ?? []).length
            : null,
      },
    });
  }

  async pauseJob(jobId: string) {
    const job = await this.getJobOrThrow(jobId);
    if (job.status !== CompanyImportJobStatus.RUNNING) {
      throw new BadRequestException('Import neběží.');
    }
    return this.prisma.companyImportJob.update({
      where: { id: jobId },
      data: { status: CompanyImportJobStatus.PAUSED },
    });
  }

  async resumeJob(jobId: string) {
    const job = await this.getJobOrThrow(jobId);
    if (job.status !== CompanyImportJobStatus.PAUSED) {
      throw new BadRequestException('Import není pozastavený.');
    }
    return this.prisma.companyImportJob.update({
      where: { id: jobId },
      data: { status: CompanyImportJobStatus.PENDING, error: null },
    });
  }

  /** Obnoví failed job s automatickým re-partition (TOO_MANY_RESULTS). */
  async resumeWithResplit(jobId: string) {
    const job = await this.getJobOrThrow(jobId);
    if (job.status !== CompanyImportJobStatus.FAILED) {
      throw new BadRequestException('Re-partition je dostupný jen pro FAILED job.');
    }
    const checkpoint = parseSearchCheckpoint(job.checkpoint) ?? createEmptySearchCheckpoint(null);
    const baseFilter = (job.searchFilter ?? this.buildSearchFilter(job)) as AresSearchFilter;
    const wholeCountry = isWholeCountryRegion(job.region);
    const parts = buildInitialPartitions(baseFilter, {
      category: job.category,
      region: job.region,
      district: job.district,
      city: job.city,
      wholeCountry,
    });
    checkpoint.subQueries = parts.map((p) => p.filter);
    checkpoint.subQueryLabels = parts.map((p) => p.label);
    checkpoint.subQueryDepths = parts.map((p) => p.depth);
    checkpoint.subQueryIndex = 0;
    checkpoint.subQueryStart = 0;
    checkpoint.needsResplit = false;
    checkpoint.phase = 'PARTITIONING';
    checkpoint.stopped = false;

    return this.prisma.companyImportJob.update({
      where: { id: jobId },
      data: {
        status: CompanyImportJobStatus.PENDING,
        error: null,
        finishedAt: null,
        checkpoint: checkpoint as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async stopJob(jobId: string) {
    const job = await this.getJobOrThrow(jobId);
    if (
      job.status === CompanyImportJobStatus.COMPLETED ||
      job.status === CompanyImportJobStatus.FAILED
    ) {
      return job;
    }
    const checkpoint = this.mergeCheckpoint(job.checkpoint, { stopped: true });
    return this.prisma.companyImportJob.update({
      where: { id: jobId },
      data: {
        status: CompanyImportJobStatus.PAUSED,
        error: 'Zastaveno administrátorem.',
        checkpoint,
      },
    });
  }

  async getJob(jobId: string) {
    const job = await this.getJobOrThrow(jobId);
    return this.serializeJob(job);
  }

  async getJobItems(jobId: string, limit = 100) {
    return this.prisma.companyImportItem.findMany({
      where: { jobId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async listJobs(limit = 20) {
    const rows = await this.prisma.companyImportJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => this.serializeJob(row));
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
        status: { in: [CompanyImportJobStatus.PENDING, CompanyImportJobStatus.RUNNING] },
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

  private async processJobBatch(jobId: string) {
    const job = await this.prisma.companyImportJob.findUnique({ where: { id: jobId } });
    if (!job) return;
    if (
      job.status !== CompanyImportJobStatus.PENDING &&
      job.status !== CompanyImportJobStatus.RUNNING
    ) {
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
      checkpoint.subQueryStart = checkpoint.subQueryStart || job.lastCursor;

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

      if (checkpoint.subQueryTotals[idx] == null && requests < maxRequests) {
        requests += 1;
        try {
          const countResult = await this.partitionService.countPartition(activeFilter, partitionCtx, {
            partitionId: `${jobId}:${idx}`,
            partitionLabel,
          });
          checkpoint.subQueryTotals[idx] = countResult.total ?? 0;
          if (this.partitionService.needsFurtherSplit(countResult.total)) {
            const children = this.partitionService.furtherPartitions(
              activeFilter,
              partitionCtx,
              partitionDepth,
            );
            if (children.length > 0) {
              await this.replacePartitionAtIndex(jobId, checkpoint, idx, children);
              return;
            }
            this.log.warn(
              `Import ${jobId}: partition ${partitionLabel} NEEDS_FURTHER_SPLIT (total=${countResult.total})`,
            );
          }
        } catch (err) {
          if (isAresTooManyResultsError(err)) {
            const children = this.partitionService.furtherPartitions(
              activeFilter,
              partitionCtx,
              partitionDepth,
            );
            if (children.length > 0) {
              await this.replacePartitionAtIndex(jobId, checkpoint, idx, children);
              return;
            }
          }
          throw err;
        }
      }

      if (requests >= maxRequests) {
        await this.persistCheckpoint(jobId, job, checkpoint);
        return;
      }

      requests += 1;
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
          const children = this.partitionService.furtherPartitions(
            activeFilter,
            partitionCtx,
            partitionDepth,
          );
          if (children.length > 0) {
            await this.replacePartitionAtIndex(jobId, checkpoint, idx, children);
            return;
          }
        }
        throw err;
      }

      const subjects = response.ekonomickeSubjekty ?? [];
      const subTotal = response.pocetCelkem ?? checkpoint.subQueryTotals[idx] ?? null;

      if (subTotal != null && subTotal > 1000) {
        const children = this.partitionService.furtherPartitions(
          activeFilter,
          partitionCtx,
          partitionDepth,
        );
        if (children.length > 0) {
          await this.replacePartitionAtIndex(jobId, checkpoint, idx, children);
          return;
        }
        checkpoint.needsResplit = true;
        checkpoint.phase = 'DISCOVERING';
        await this.persistCheckpoint(jobId, job, checkpoint);
        throw new Error(
          `Partition ${partitionLabel} vrací ${subTotal} výsledků (>1000) a nelze ji dále rozdělit.`,
        );
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
          continue;
        }

        try {
          const result = await this.upsertFromSubject(subject, job.category, jobId);
          if (result.action === 'created') created += 1;
          if (result.action === 'updated') updated += 1;
          if (result.action === 'skipped') skipped += 1;
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
        if (partitionCtx.wholeCountry) {
          checkpoint.regionsCompleted = Math.min(
            checkpoint.regionsTotal ?? 14,
            checkpoint.regionsCompleted + 1,
          );
        }
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
          lastCursor: checkpoint.subQueries.length > 0 ? nextSubQueryStart : nextStart,
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

    const data = {
      dic: normalized.dic,
      name: normalized.name,
      slug: existing?.slug ?? normalized.slug,
      legalForm: normalized.legalForm,
      companyStatus: normalized.companyStatus,
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
    const stale = await this.prisma.companyImportJob.findMany({
      where: { status: CompanyImportJobStatus.RUNNING },
    });
    for (const job of stale) {
      await this.prisma.companyImportJob.update({
        where: { id: job.id },
        data: { status: CompanyImportJobStatus.PENDING },
      });
      this.log.warn(`Recovered stale import job ${job.id}`);
    }
  }

  private async getJobOrThrow(jobId: string) {
    const job = await this.prisma.companyImportJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Import job nenalezen.');
    return job;
  }

  private serializeJob(job: {
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
  }) {
    const checkpoint = parseSearchCheckpoint(job.checkpoint);
    const isComplete = job.status === CompanyImportJobStatus.COMPLETED;
    const progress = computeJobProgress(job.processed, job.totalExpected, job.startedAt);
    const progressPercent = isComplete
      ? progress.percentage
      : Math.min(99, progress.percentage);
    const displayStatus =
      checkpoint?.stopped && job.status === CompanyImportJobStatus.PAUSED
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
      progressLabel: progress.label,
      progressPercent,
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
    children: Array<{ filter: AresSearchFilter; label: string; depth: number }>,
  ) {
    const before = checkpoint.subQueries.slice(0, index);
    const beforeLabels = checkpoint.subQueryLabels.slice(0, index);
    const beforeDepths = checkpoint.subQueryDepths.slice(0, index);
    const after = checkpoint.subQueries.slice(index + 1);
    const afterLabels = checkpoint.subQueryLabels.slice(index + 1);
    const afterDepths = checkpoint.subQueryDepths.slice(index + 1);

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
    checkpoint.subQueryStart = 0;
    checkpoint.phase = 'PARTITIONING';

    await this.prisma.companyImportJob.update({
      where: { id: jobId },
      data: {
        checkpoint: checkpoint as unknown as Prisma.InputJsonValue,
        error: null,
        lastActivityAt: new Date(),
      },
    });
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
}
