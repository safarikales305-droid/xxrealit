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
  CompanyImportJobStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { naceCodesForCategory } from './ares-activity.mapper';
import { AresApiException, AresService } from './ares.service';
import type { AresEconomicSubject } from './ares.types';
import {
  ARES_IMPORT_DELAY_MS,
  ARES_IMPORT_ENABLED,
  ARES_IMPORT_MAX_REQUESTS_PER_RUN,
  ARES_WORKER_TICK_MS,
} from './company-directory.constants';
import { normalizeAresCompanyForDb } from './company-directory.serializer';

type StartImportInput = {
  category?: CompanyDirectoryCategory;
  region?: string;
  district?: string;
  city?: string;
  batchSize?: number;
  delayMs?: number;
  importMode?: 'SEARCH' | 'ICO_LIST';
  icoList?: string[];
};

@Injectable()
export class CompanyImportService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(CompanyImportService.name);
  private workerTimer: ReturnType<typeof setInterval> | null = null;
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ares: AresService,
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
    if (importMode === 'SEARCH' && !input.city?.trim() && !input.region?.trim() && !input.district?.trim()) {
      throw new BadRequestException(
        'Pro vyhledávací import zadejte alespoň kraj, okres nebo město.',
      );
    }
    const searchFilter = this.buildSearchFilter(input);

    return this.prisma.companyImportJob.create({
      data: {
        category: input.category ?? null,
        region: input.region?.trim() || null,
        district: input.district?.trim() || null,
        city: input.city?.trim() || null,
        batchSize: input.batchSize ?? undefined,
        delayMs: input.delayMs ?? undefined,
        importMode,
        icoList: (input.icoList ?? []).map((ico) => ico.replace(/\D/g, '').padStart(8, '0')),
        searchFilter: searchFilter as Prisma.InputJsonValue,
        status: CompanyImportJobStatus.PENDING,
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
      data: { status: CompanyImportJobStatus.PENDING },
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
    return this.prisma.companyImportJob.update({
      where: { id: jobId },
      data: {
        status: CompanyImportJobStatus.PAUSED,
        error: 'Zastaveno administrátorem.',
      },
    });
  }

  async getJob(jobId: string) {
    const job = await this.getJobOrThrow(jobId);
    return this.serializeJob(job);
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
            const result = await this.upsertIco(ico, job.category);
            if (result.action === 'created') created += 1;
            if (result.action === 'updated') updated += 1;
            if (result.action === 'skipped') failed += 0;
            processed += 1;
            lastIco = ico;
          } catch {
            failed += 1;
            processed += 1;
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
            checkpoint: { mode: 'ICO_LIST', index: nextCursor } as Prisma.InputJsonValue,
            status: done ? CompanyImportJobStatus.COMPLETED : CompanyImportJobStatus.PENDING,
            finishedAt: done ? new Date() : null,
          },
        });
        return;
      }

      const filter = (job.searchFilter ?? this.buildSearchFilter(job)) as Record<string, unknown>;
      const start = job.lastCursor;
      const pocet = batchSize;
      if (requests >= maxRequests) return;

      requests += 1;
      const response = await this.ares.searchCompanies({
        ...(filter as object),
        start,
        pocet,
      });
      const subjects = response.ekonomickeSubjekty ?? [];
      const totalExpected = response.pocetCelkem ?? job.totalExpected ?? null;

      let created = job.created;
      let updated = job.updated;
      let failed = job.failed;
      let processed = job.processed;
      let lastIco = job.lastIco;

      for (const subject of subjects) {
        try {
          const result = await this.upsertFromSubject(subject, job.category);
          if (result.action === 'created') created += 1;
          if (result.action === 'updated') updated += 1;
          processed += 1;
          lastIco = subject.ico;
        } catch {
          failed += 1;
          processed += 1;
        }
        await this.sleep(Math.min(300, delayMs));
      }

      const nextCursor = start + subjects.length;
      const noMore =
        subjects.length === 0 ||
        (totalExpected != null && nextCursor >= totalExpected) ||
        subjects.length < pocet;

      await this.prisma.companyImportJob.update({
        where: { id: jobId },
        data: {
          processed,
          created,
          updated,
          failed,
          lastCursor: nextCursor,
          lastIco,
          totalExpected,
          checkpoint: { mode: 'SEARCH', start: nextCursor } as Prisma.InputJsonValue,
          status: noMore ? CompanyImportJobStatus.COMPLETED : CompanyImportJobStatus.PENDING,
          finishedAt: noMore ? new Date() : null,
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

  private async upsertIco(ico: string, hintCategory: CompanyDirectoryCategory | null) {
    const subject = await this.ares.getCompanyByIco(ico);
    return this.upsertFromSubject(subject, hintCategory);
  }

  private async upsertFromSubject(
    subject: AresEconomicSubject,
    hintCategory: CompanyDirectoryCategory | null,
  ): Promise<{ action: 'created' | 'updated' | 'skipped' }> {
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
      await this.prisma.companyDirectoryEntry.update({
        where: { id: existing.id },
        data,
      });
      return { action: 'updated' };
    }

    await this.prisma.companyDirectoryEntry.create({
      data: {
        ico: normalized.ico,
        ...data,
      },
    });
    return { action: 'created' };
  }

  private buildSearchFilter(input: {
    category?: CompanyDirectoryCategory | null;
    region?: string | null;
    district?: string | null;
    city?: string | null;
  }) {
    const locationText =
      input.city?.trim() ||
      input.district?.trim() ||
      input.region?.trim() ||
      undefined;

    const czNace = input.category ? naceCodesForCategory(input.category) : undefined;

    return {
      sidlo: locationText ? { textovaAdresa: locationText } : undefined,
      czNace: czNace && czNace.length > 0 ? czNace : undefined,
    };
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
  }) {
    return {
      id: job.id,
      source: job.source,
      category: job.category,
      region: job.region,
      district: job.district,
      city: job.city,
      status: job.status,
      processed: job.processed,
      created: job.created,
      updated: job.updated,
      failed: job.failed,
      skipped: job.skipped,
      lastCursor: job.lastCursor,
      lastIco: job.lastIco,
      totalExpected: job.totalExpected,
      progress:
        job.totalExpected && job.totalExpected > 0
          ? `${job.processed} / ${job.totalExpected}`
          : `${job.processed}`,
      batchSize: job.batchSize,
      delayMs: job.delayMs,
      importMode: job.importMode,
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
      error: job.error,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
