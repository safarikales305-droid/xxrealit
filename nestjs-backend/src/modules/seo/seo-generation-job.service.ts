import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, SeoContentStatus, SeoGenerationJobStatus, SeoGenerationJobType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PROGRAMMATIC_SEO_INTENT_SLUGS } from './programmatic-seo-intents';
import { buildProgrammaticSeoPath } from './programmatic-seo.util';
import { SeoContentService } from './seo-content.service';
import {
  SEO_GENERATION_DEFAULT_BATCH_SIZE,
  SEO_GENERATION_HEARTBEAT_MS,
  SEO_GENERATION_JOB_STATUS,
  SEO_GENERATION_JOB_TYPE,
  SEO_GENERATION_STALE_JOB_MS,
  SEO_GENERATION_WORKER_TICK_MS,
  type SeoGenerationFilters,
  type SeoGenerationLogEntry,
} from './seo-generation-job.constants';
import { buildProgrammaticSeoPageKey } from './seo-location.util';
import {
  buildLocationWhere,
  clampBatchSize,
  cursorToPair,
  filterIntents,
  getLocationQualityTier,
  pairLabel,
} from './seo-generation.util';

function progressPct(processed: number, total: number): number {
  if (!total) return 0;
  return Math.round((processed / total) * 1000) / 10;
}

@Injectable()
export class SeoGenerationJobService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(SeoGenerationJobService.name);
  private workerTimer: ReturnType<typeof setInterval> | null = null;
  private processing = false;
  private cancelRequested = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly content: SeoContentService,
  ) {}

  onModuleInit(): void {
    this.workerTimer = setInterval(() => void this.tick(), SEO_GENERATION_WORKER_TICK_MS);
    void this.recoverStaleJobs();
  }

  onModuleDestroy(): void {
    if (this.workerTimer) clearInterval(this.workerTimer);
  }

  async getStats() {
    const [possibleLocations, contentByStatus, indexable, noindex, activeJob] = await Promise.all([
      this.prisma.seoLocation.count({ where: buildLocationWhere() }),
      this.prisma.seoPageContent.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.seoPageContent.count({ where: { noindex: false, status: SeoContentStatus.PUBLISHED } }),
      this.prisma.seoPageContent.count({ where: { noindex: true } }),
      this.getActiveJob(),
    ]);

    const intents = PROGRAMMATIC_SEO_INTENT_SLUGS.length;
    const statusMap = Object.fromEntries(contentByStatus.map((r) => [r.status, r._count._all]));

    return {
      possibleCombinations: possibleLocations * intents,
      createdRecords: Object.values(statusMap).reduce((s, n) => s + n, 0),
      draft: statusMap.DRAFT ?? 0,
      review: statusMap.REVIEW ?? 0,
      approved: statusMap.APPROVED ?? 0,
      published: (statusMap.PUBLISHED ?? 0) + (statusMap.LOCKED ?? 0),
      indexable,
      noindex,
      errors: await this.prisma.seoPageContent.count({ where: { lastError: { not: null } } }),
      activeJob: activeJob ? this.serializeJob(activeJob) : null,
      searchConsoleConnected: false,
      searchConsoleNote: 'Data Search Console nejsou připojena.',
    };
  }

  async listJobs(limit = 20) {
    const rows = await this.prisma.seoGenerationJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(50, Math.max(1, limit)),
    });
    return rows.map((r) => this.serializeJob(r));
  }

  async getProgress() {
    const job = await this.getActiveJob();
    if (!job) {
      const last = await this.prisma.seoGenerationJob.findFirst({
        orderBy: { createdAt: 'desc' },
      });
      return {
        active: false,
        job: last ? this.serializeJob(last) : null,
      };
    }
    return { active: true, job: this.serializeJob(job) };
  }

  async generateTest(createdById?: string) {
    const location =
      (await this.prisma.seoLocation.findFirst({
        where: { isActive: true, slug: 'pardubice' },
      })) ??
      (await this.prisma.seoLocation.findFirst({
        where: buildLocationWhere(),
        orderBy: [{ population: 'desc' }, { name: 'asc' }],
      }));

    if (!location) {
      throw new BadRequestException('V databázi nejsou žádné lokality. Nejprve importujte RÚIAN data.');
    }

    const result = await this.content.upsertFromTemplate({
      intentSlug: 'prodej-bytu',
      locationSlug: location.slug,
      publish: true,
      createdBy: createdById,
    });

    const publicPath = buildProgrammaticSeoPath('prodej-bytu', location.slug);

    return {
      success: true,
      action: result.action,
      pageId: result.page.id,
      pageKey: result.page.pageKey,
      publicPath,
      publicUrl: publicPath,
      status: result.page.status,
      indexable: !result.page.noindex,
      title: result.page.title,
      metaTitle: result.page.title,
      metaDescription: result.page.description,
      canonical: result.page.canonical,
      h1: result.page.h1,
    };
  }

  async enqueueBatch(
    type: SeoGenerationJobType,
    opts: {
      limit?: number;
      batchSize?: number;
      filters?: SeoGenerationFilters;
      createdById?: string;
    },
  ) {
    const active = await this.getActiveJob();
    if (active) {
      return {
        success: false as const,
        error: 'Generování již běží.',
        jobId: active.id,
      };
    }

    const filters = opts.filters ?? {};
    const intents = filterIntents(filters);
    const locationCount = await this.prisma.seoLocation.count({ where: buildLocationWhere(filters) });
    let totalItems = locationCount * intents.length;

    if (type === SEO_GENERATION_JOB_TYPE.REGENERATE_DRAFTS) {
      totalItems = await this.prisma.seoPageContent.count({ where: { status: SeoContentStatus.DRAFT } });
    } else if (type === SEO_GENERATION_JOB_TYPE.REGENERATE_ERRORS) {
      totalItems = await this.prisma.seoPageContent.count({
        where: { OR: [{ lastError: { not: null } }, { qualityScore: { lt: 30 } }] },
      });
    } else if (type === SEO_GENERATION_JOB_TYPE.REGENERATE_STALE) {
      totalItems = await this.prisma.seoPageContent.count({
        where: { generationVersion: { lt: 1 } },
      });
    }

    if (opts.limit && opts.limit > 0) {
      totalItems = Math.min(totalItems, opts.limit);
    }

    if (totalItems === 0) {
      return { success: false as const, error: 'Žádné položky k zpracování.' };
    }

    const batchSize = clampBatchSize(opts.batchSize ?? SEO_GENERATION_DEFAULT_BATCH_SIZE);

    const job = await this.prisma.seoGenerationJob.create({
      data: {
        type,
        status: SeoGenerationJobStatus.PENDING,
        totalItems,
        batchSize,
        filtersJson: { ...filters, limit: opts.limit ?? null } as Prisma.InputJsonValue,
        jobMeta: { logs: [] } as Prisma.InputJsonValue,
        createdById: opts.createdById ?? null,
      },
    });

    this.log.log(`SEO generation job enqueued: ${job.id} type=${type} total=${totalItems}`);
    void this.tick();

    return { success: true as const, jobId: job.id, totalItems, batchSize };
  }

  async pauseJob(jobId?: string) {
    const job = jobId
      ? await this.prisma.seoGenerationJob.findUnique({ where: { id: jobId } })
      : await this.getActiveJob();
    if (!job) return { success: false, error: 'Úloha nenalezena.' };
    if (job.status !== SeoGenerationJobStatus.RUNNING) {
      return { success: false, error: 'Úlohu nelze pozastavit.' };
    }
    await this.prisma.seoGenerationJob.update({
      where: { id: job.id },
      data: { status: SeoGenerationJobStatus.PAUSED, pausedAt: new Date() },
    });
    return { success: true, jobId: job.id };
  }

  async resumeJob(jobId?: string) {
    const job = jobId
      ? await this.prisma.seoGenerationJob.findUnique({ where: { id: jobId } })
      : await this.prisma.seoGenerationJob.findFirst({
          where: { status: SeoGenerationJobStatus.PAUSED },
          orderBy: { createdAt: 'desc' },
        });
    if (!job) return { success: false, error: 'Pozastavená úloha nenalezena.' };
    await this.prisma.seoGenerationJob.update({
      where: { id: job.id },
      data: { status: SeoGenerationJobStatus.RUNNING, pausedAt: null, startedAt: job.startedAt ?? new Date() },
    });
    void this.tick();
    return { success: true, jobId: job.id };
  }

  async cancelJob(jobId?: string) {
    const job = jobId
      ? await this.prisma.seoGenerationJob.findUnique({ where: { id: jobId } })
      : await this.getActiveJob();
    if (!job) return { success: false, error: 'Úloha nenalezena.' };
    if (
      job.status === SeoGenerationJobStatus.COMPLETED ||
      job.status === SeoGenerationJobStatus.CANCELLED
    ) {
      return { success: false, error: 'Úloha již skončila.' };
    }
    this.cancelRequested = true;
    await this.prisma.seoGenerationJob.update({
      where: { id: job.id },
      data: {
        status: SeoGenerationJobStatus.CANCELLED,
        finishedAt: new Date(),
        currentItem: null,
      },
    });
    return { success: true, jobId: job.id };
  }

  private async getActiveJob() {
    return this.prisma.seoGenerationJob.findFirst({
      where: {
        status: {
          in: [SeoGenerationJobStatus.PENDING, SeoGenerationJobStatus.RUNNING, SeoGenerationJobStatus.PAUSED],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private serializeJob(job: {
    id: string;
    type: SeoGenerationJobType;
    status: SeoGenerationJobStatus;
    totalItems: number;
    processedItems: number;
    createdItems: number;
    updatedItems: number;
    skippedItems: number;
    failedItems: number;
    batchSize: number;
    currentCursor: number;
    currentItem: string | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    pausedAt: Date | null;
    lastError: string | null;
    createdAt: Date;
    updatedAt: Date;
    jobMeta?: unknown;
  }) {
    const meta = (job.jobMeta ?? {}) as { logs?: SeoGenerationLogEntry[] };
    const pct = progressPct(job.processedItems, job.totalItems);
    const remaining = Math.max(0, job.totalItems - job.processedItems);
    const elapsedMs = job.startedAt ? Date.now() - job.startedAt.getTime() : 0;
    const rate = job.processedItems > 0 && elapsedMs > 0 ? job.processedItems / (elapsedMs / 1000) : 0;
    const etaSeconds = rate > 0 ? Math.round(remaining / rate) : null;

    return {
      jobId: job.id,
      type: job.type,
      status: job.status,
      totalItems: job.totalItems,
      processedItems: job.processedItems,
      createdItems: job.createdItems,
      updatedItems: job.updatedItems,
      skippedItems: job.skippedItems,
      failedItems: job.failedItems,
      batchSize: job.batchSize,
      currentCursor: job.currentCursor,
      currentItem: job.currentItem,
      progressPct: pct,
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
      pausedAt: job.pausedAt?.toISOString() ?? null,
      lastError: job.lastError,
      lastActivityAt: job.updatedAt.toISOString(),
      etaSeconds,
      logs: (meta.logs ?? []).slice(-50),
    };
  }

  private async recoverStaleJobs() {
    const cutoff = new Date(Date.now() - SEO_GENERATION_STALE_JOB_MS);
    const stale = await this.prisma.seoGenerationJob.findMany({
      where: {
        status: SeoGenerationJobStatus.RUNNING,
        updatedAt: { lt: cutoff },
      },
    });
    for (const job of stale) {
      await this.appendLog(job.id, 'warn', 'Úloha označena jako zaseknutá — obnovuji.');
      await this.prisma.seoGenerationJob.update({
        where: { id: job.id },
        data: { status: SeoGenerationJobStatus.RUNNING },
      });
    }
    if (stale.length) void this.tick();
  }

  private async tick() {
    if (this.processing) return;
    this.processing = true;
    try {
      const job = await this.prisma.seoGenerationJob.findFirst({
        where: {
          status: { in: [SeoGenerationJobStatus.PENDING, SeoGenerationJobStatus.RUNNING] },
        },
        orderBy: { createdAt: 'asc' },
      });
      if (!job) return;

      if (job.status === SeoGenerationJobStatus.PENDING) {
        await this.prisma.seoGenerationJob.update({
          where: { id: job.id },
          data: { status: SeoGenerationJobStatus.RUNNING, startedAt: new Date() },
        });
        await this.appendLog(job.id, 'info', 'Generování spuštěno.');
      }

      this.cancelRequested = false;
      await this.processBatch(job.id);
    } finally {
      this.processing = false;
    }
  }

  private async processBatch(jobId: string) {
    const job = await this.prisma.seoGenerationJob.findUnique({ where: { id: jobId } });
    if (!job || job.status === SeoGenerationJobStatus.PAUSED || job.status === SeoGenerationJobStatus.CANCELLED) {
      return;
    }

    const filters = (job.filtersJson ?? {}) as SeoGenerationFilters;
    const limit = filters.limit ?? job.totalItems;
    let cursor = job.currentCursor;
    let processed = job.processedItems;
    let created = job.createdItems;
    let updated = job.updatedItems;
    let skipped = job.skippedItems;
    let failed = job.failedItems;

    const batchEnd = Math.min(cursor + job.batchSize, limit);

    if (job.type === SEO_GENERATION_JOB_TYPE.REGENERATE_DRAFTS) {
      await this.processDraftBatch(job, cursor, batchEnd, {
        processed,
        created,
        updated,
        skipped,
        failed,
      });
      return;
    }

    if (
      job.type === SEO_GENERATION_JOB_TYPE.REGENERATE_ERRORS ||
      job.type === SEO_GENERATION_JOB_TYPE.REGENERATE_STALE
    ) {
      await this.processErrorBatch(job, cursor, batchEnd, {
        processed,
        created,
        updated,
        skipped,
        failed,
      });
      return;
    }

    const intents = filterIntents(filters);

    for (; cursor < batchEnd; cursor++) {
      if (this.cancelRequested) break;

      const { locationOffset, intentIndex } = cursorToPair(cursor, intents);
      const locations = await this.prisma.seoLocation.findMany({
        where: buildLocationWhere(filters),
        orderBy: [{ population: 'desc' }, { slug: 'asc' }],
        skip: locationOffset,
        take: 1,
      });
      const location = locations[0];
      if (!location) break;

      const intentSlug = intents[intentIndex];
      const tier = getLocationQualityTier(location);
      const allowedTiers = filters.qualityTiers ?? ['HIGH', 'MEDIUM'];
      if (!allowedTiers.includes(tier) && job.type !== SEO_GENERATION_JOB_TYPE.TEST) {
        skipped++;
        processed++;
        continue;
      }

      const itemLabel = pairLabel(intentSlug, location.slug, location.name);

      if (filters.onlyMissing) {
        const pageKey = buildProgrammaticSeoPageKey(intentSlug, location.slug);
        const exists = await this.prisma.seoPageContent.findUnique({ where: { pageKey } });
        if (exists) {
          skipped++;
          processed++;
          continue;
        }
      }

      await this.prisma.seoGenerationJob.update({
        where: { id: jobId },
        data: { currentItem: itemLabel, currentCursor: cursor, updatedAt: new Date() },
      });

      try {
        const result = await this.content.upsertFromTemplate({
          intentSlug,
          locationSlug: location.slug,
          publish: true,
          createdBy: job.createdById ?? undefined,
        });
        if (result.action === 'created') created++;
        else if (result.action === 'updated') updated++;
        else skipped++;
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        this.log.warn(`SEO gen failed ${itemLabel}: ${msg}`);
        await this.appendLog(jobId, 'error', `${itemLabel}: ${msg}`);
        await this.prisma.seoPageContent.updateMany({
          where: { pageKey: `${intentSlug}:${location.slug}` },
          data: { lastError: msg },
        });
      }

      processed++;
    }

    const done = processed >= job.totalItems || cursor >= limit;
    await this.prisma.seoGenerationJob.update({
      where: { id: jobId },
      data: {
        currentCursor: cursor,
        processedItems: processed,
        createdItems: created,
        updatedItems: updated,
        skippedItems: skipped,
        failedItems: failed,
        currentItem: done ? null : job.currentItem,
        status: this.cancelRequested
          ? SeoGenerationJobStatus.CANCELLED
          : done
            ? SeoGenerationJobStatus.COMPLETED
            : SeoGenerationJobStatus.RUNNING,
        finishedAt: done || this.cancelRequested ? new Date() : null,
        updatedAt: new Date(),
      },
    });

    if (!done && !this.cancelRequested) {
      setTimeout(() => void this.tick(), SEO_GENERATION_HEARTBEAT_MS / 3);
    } else if (done) {
      await this.appendLog(jobId, 'info', `Generování dokončeno. Vytvořeno ${created}, aktualizováno ${updated}, chyby ${failed}.`);
    }
  }

  private async processDraftBatch(
    job: { id: string; totalItems: number; batchSize: number; createdById: string | null },
    cursor: number,
    batchEnd: number,
    counters: { processed: number; created: number; updated: number; skipped: number; failed: number },
  ) {
    const rows = await this.prisma.seoPageContent.findMany({
      where: { status: SeoContentStatus.DRAFT },
      orderBy: { updatedAt: 'asc' },
      skip: cursor,
      take: batchEnd - cursor,
      include: { location: { select: { slug: true, name: true } } },
    });

    let idx = cursor;
    for (const row of rows) {
      if (this.cancelRequested) break;
      if (!row.intentSlug || !row.location?.slug) {
        counters.skipped++;
        counters.processed++;
        idx++;
        continue;
      }
      const itemLabel = pairLabel(row.intentSlug, row.location.slug, row.location.name);
      await this.prisma.seoGenerationJob.update({
        where: { id: job.id },
        data: { currentItem: itemLabel, currentCursor: idx },
      });
      try {
        const result = await this.content.upsertFromTemplate({
          intentSlug: row.intentSlug,
          locationSlug: row.location.slug,
          publish: true,
          createdBy: job.createdById ?? undefined,
        });
        if (result.action === 'created') counters.created++;
        else if (result.action === 'updated') counters.updated++;
        else counters.skipped++;
      } catch (err) {
        counters.failed++;
        await this.appendLog(job.id, 'error', `${itemLabel}: ${err instanceof Error ? err.message : String(err)}`);
      }
      counters.processed++;
      idx++;
    }

    const done = counters.processed >= job.totalItems || rows.length === 0;
    await this.finishBatch(job.id, idx, counters, done);
  }

  private async processErrorBatch(
    job: { id: string; totalItems: number; type: SeoGenerationJobType; createdById: string | null },
    cursor: number,
    batchEnd: number,
    counters: { processed: number; created: number; updated: number; skipped: number; failed: number },
  ) {
    const where =
      job.type === SEO_GENERATION_JOB_TYPE.REGENERATE_STALE
        ? { generationVersion: { lt: 1 } }
        : { OR: [{ lastError: { not: null } }, { qualityScore: { lt: 30 } }] };

    const rows = await this.prisma.seoPageContent.findMany({
      where,
      orderBy: { updatedAt: 'asc' },
      skip: cursor,
      take: batchEnd - cursor,
      include: { location: { select: { slug: true, name: true } } },
    });

    let idx = cursor;
    for (const row of rows) {
      if (this.cancelRequested) break;
      if (!row.intentSlug || !row.location?.slug) {
        counters.skipped++;
        counters.processed++;
        idx++;
        continue;
      }
      const itemLabel = pairLabel(row.intentSlug, row.location.slug, row.location.name);
      try {
        const result = await this.content.upsertFromTemplate({
          intentSlug: row.intentSlug,
          locationSlug: row.location.slug,
          publish: true,
          createdBy: job.createdById ?? undefined,
        });
        if (result.action === 'created') counters.created++;
        else if (result.action === 'updated') counters.updated++;
        else counters.skipped++;
      } catch (err) {
        counters.failed++;
        await this.appendLog(job.id, 'error', `${itemLabel}: ${err instanceof Error ? err.message : String(err)}`);
      }
      counters.processed++;
      idx++;
    }

    const done = counters.processed >= job.totalItems || rows.length === 0;
    await this.finishBatch(job.id, idx, counters, done);
  }

  private async finishBatch(
    jobId: string,
    cursor: number,
    counters: { processed: number; created: number; updated: number; skipped: number; failed: number },
    done: boolean,
  ) {
    await this.prisma.seoGenerationJob.update({
      where: { id: jobId },
      data: {
        currentCursor: cursor,
        processedItems: counters.processed,
        createdItems: counters.created,
        updatedItems: counters.updated,
        skippedItems: counters.skipped,
        failedItems: counters.failed,
        currentItem: done ? null : undefined,
        status: this.cancelRequested
          ? SeoGenerationJobStatus.CANCELLED
          : done
            ? SeoGenerationJobStatus.COMPLETED
            : SeoGenerationJobStatus.RUNNING,
        finishedAt: done || this.cancelRequested ? new Date() : null,
      },
    });
    if (!done && !this.cancelRequested) {
      setTimeout(() => void this.tick(), SEO_GENERATION_HEARTBEAT_MS / 3);
    }
  }

  private async appendLog(jobId: string, level: SeoGenerationLogEntry['level'], message: string) {
    const job = await this.prisma.seoGenerationJob.findUnique({ where: { id: jobId } });
    if (!job) return;
    const meta = (job.jobMeta ?? {}) as { logs?: SeoGenerationLogEntry[] };
    const logs = [...(meta.logs ?? []), { at: new Date().toISOString(), level, message }].slice(-100);
    await this.prisma.seoGenerationJob.update({
      where: { id: jobId },
      data: { jobMeta: { ...meta, logs } as Prisma.InputJsonValue },
    });
  }
}
