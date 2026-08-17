import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, SeoAiGenerationItemStatus, SeoAiGenerationJobStatus, SeoContentStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { getProgrammaticSeoIntent, PROGRAMMATIC_SEO_INTENT_SLUGS } from './programmatic-seo-intents';
import type { SeoAiGenerateInput } from './seo-ai-layout.types';
import { SeoAiGenerationService } from './seo-ai-generation.service';
import { SeoAiQualityService } from './seo-ai-quality.service';
import { buildLocationWhere } from './seo-generation.util';
import { extractSeoAiJobError, isRetryableSeoAiError } from './seo-ai-job-errors.util';

const TICK_MS = 4000;
const MAX_DAILY_AI_PAGES = 100;
const MAX_BATCH_WITHOUT_CONFIRM = 10;
const MAX_ITEM_ATTEMPTS = 2;
const AUTO_PAUSE_CONSECUTIVE = 3;
const AUTO_PAUSE_ERROR_RATE = 0.7;
const AUTO_PAUSE_MIN_PROCESSED = 5;

export type SeoAiJobSettings = SeoAiGenerateInput & {
  count?: number;
  pageIds?: string[];
  improveNoindex?: boolean;
  onExisting?: 'update' | 'skip' | 'fail';
};

@Injectable()
export class SeoAiGenerationJobService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(SeoAiGenerationJobService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly generation: SeoAiGenerationService,
    private readonly quality: SeoAiQualityService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async estimateJob(settings: SeoAiJobSettings) {
    const count = settings.count ?? 1;
    const { estimatedTokens, estimatedCostCzk } = this.quality.estimateBatchCostCzk(count);
    const todayCount = await this.countAiPagesToday();
    return {
      pageCount: count,
      estimatedRequests: count,
      estimatedTokens,
      estimatedCostCzk,
      dailyLimit: MAX_DAILY_AI_PAGES,
      dailyUsed: todayCount,
      dailyRemaining: Math.max(0, MAX_DAILY_AI_PAGES - todayCount),
      requiresConfirmation: count > MAX_BATCH_WITHOUT_CONFIRM,
    };
  }

  async createJob(settings: SeoAiJobSettings, userId?: string) {
    const count = settings.count ?? 1;
    if (count > MAX_DAILY_AI_PAGES) {
      throw new BadRequestException(`Maximálně ${MAX_DAILY_AI_PAGES} AI stránek na dávku.`);
    }
    const todayCount = await this.countAiPagesToday();
    if (todayCount + count > MAX_DAILY_AI_PAGES) {
      throw new BadRequestException('Denní limit AI stránek byl dosažen.');
    }

    const preflight = await this.generation.validatePreflight();
    if (!preflight.ok) {
      throw new BadRequestException(preflight.message);
    }

    const estimate = await this.estimateJob(settings);
    const items = await this.buildJobItems(settings, count);

    const job = await this.prisma.seoAiGenerationJob.create({
      data: {
        status: SeoAiGenerationJobStatus.PENDING,
        requestedCount: items.length,
        estimatedCostCzk: estimate.estimatedCostCzk,
        settingsJson: settings as Prisma.InputJsonValue,
        createdById: userId,
        items: {
          create: items.map((item) => ({
            locationId: item.locationId,
            intentSlug: item.intentSlug,
            seoPageId: item.seoPageId,
            localityName: item.localityName,
            localitySlug: item.localitySlug,
            offerType: item.offerType,
            propertyType: item.propertyType,
            inputJson: item.inputJson as Prisma.InputJsonValue,
          })),
        },
      },
      include: { items: true },
    });

    return { success: true, jobId: job.id, estimate, itemCount: job.items.length };
  }

  async getJob(jobId: string) {
    const job = await this.prisma.seoAiGenerationJob.findUnique({
      where: { id: jobId },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
          include: {
            seoPage: { select: { id: true, title: true, status: true, h1: true } },
          },
        },
      },
    });
    if (!job) throw new BadRequestException('Úloha nenalezena.');
    return this.serializeJob({
      ...job,
      items: job.items.map((item, index) => this.serializeItem(item, index)),
    });
  }

  async getJobItems(jobId: string) {
    const items = await this.prisma.seoAiGenerationItem.findMany({
      where: { jobId },
      orderBy: { createdAt: 'asc' },
      include: {
        seoPage: { select: { id: true, title: true, status: true } },
      },
    });
    return items.map((item, index) => this.serializeItem(item, index));
  }

  async getJobErrors(jobId: string) {
    const items = await this.prisma.seoAiGenerationItem.findMany({
      where: { jobId, status: SeoAiGenerationItemStatus.FAILED },
      orderBy: { finishedAt: 'desc' },
    });
    return items.map((item, index) => ({
      index: index + 1,
      itemId: item.id,
      localityName: item.localityName,
      localitySlug: item.localitySlug,
      intentSlug: item.intentSlug,
      offerType: item.offerType,
      propertyType: item.propertyType,
      phase: item.phase,
      code: item.errorCode,
      message: item.errorMessage,
      httpStatus: item.httpStatus,
      attempt: item.attempt,
      durationMs: item.durationMs,
    }));
  }

  async listJobs(limit = 20) {
    const rows = await this.prisma.seoAiGenerationJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((j) => this.serializeJob(j));
  }

  async getActiveJob() {
    const job = await this.prisma.seoAiGenerationJob.findFirst({
      where: {
        status: { in: [SeoAiGenerationJobStatus.PENDING, SeoAiGenerationJobStatus.RUNNING, SeoAiGenerationJobStatus.PAUSED] },
      },
      orderBy: { createdAt: 'desc' },
    });
    return job ? this.serializeJob(job) : null;
  }

  async pauseJob(jobId: string, reason?: string) {
    await this.prisma.seoAiGenerationJob.updateMany({
      where: {
        id: jobId,
        status: { in: [SeoAiGenerationJobStatus.RUNNING, SeoAiGenerationJobStatus.PENDING] },
      },
      data: {
        status: SeoAiGenerationJobStatus.PAUSED,
        pausedAt: new Date(),
        pauseReason: reason ?? 'MANUAL_PAUSE',
      },
    });
    return { success: true };
  }

  async resumeJob(jobId: string) {
    const preflight = await this.generation.validatePreflight();
    if (!preflight.ok) {
      throw new BadRequestException(preflight.message);
    }
    await this.prisma.seoAiGenerationJob.updateMany({
      where: { id: jobId, status: SeoAiGenerationJobStatus.PAUSED },
      data: { status: SeoAiGenerationJobStatus.RUNNING, pausedAt: null, pauseReason: null },
    });
    return { success: true };
  }

  async cancelJob(jobId: string) {
    await this.prisma.seoAiGenerationJob.updateMany({
      where: {
        id: jobId,
        status: { in: [SeoAiGenerationJobStatus.PENDING, SeoAiGenerationJobStatus.RUNNING, SeoAiGenerationJobStatus.PAUSED] },
      },
      data: { status: SeoAiGenerationJobStatus.CANCELLED, finishedAt: new Date() },
    });
    return { success: true };
  }

  async retryFailedItems(jobId: string) {
    const updated = await this.prisma.seoAiGenerationItem.updateMany({
      where: { jobId, status: SeoAiGenerationItemStatus.FAILED },
      data: { status: SeoAiGenerationItemStatus.PENDING, errorCode: null, errorMessage: null },
    });
    await this.prisma.seoAiGenerationJob.update({
      where: { id: jobId },
      data: {
        status: SeoAiGenerationJobStatus.RUNNING,
        finishedAt: null,
        pauseReason: null,
        retriedCount: { increment: updated.count },
      },
    });
    return { success: true, retried: updated.count };
  }

  async retryItem(jobId: string, itemId: string) {
    const item = await this.prisma.seoAiGenerationItem.findFirst({
      where: { id: itemId, jobId },
    });
    if (!item) throw new BadRequestException('Položka nenalezena.');
    await this.prisma.seoAiGenerationItem.update({
      where: { id: itemId },
      data: {
        status: SeoAiGenerationItemStatus.PENDING,
        errorCode: null,
        errorMessage: null,
      },
    });
    await this.prisma.seoAiGenerationJob.update({
      where: { id: jobId },
      data: { status: SeoAiGenerationJobStatus.RUNNING, finishedAt: null, pauseReason: null },
    });
    return { success: true };
  }

  private serializeItem(
    item: {
      id: string;
      status: SeoAiGenerationItemStatus;
      localityName: string | null;
      localitySlug: string | null;
      intentSlug: string | null;
      offerType: string | null;
      propertyType: string | null;
      phase: string | null;
      attempt: number;
      qualityScore: number | null;
      uniquenessScore: number | null;
      errorCode: string | null;
      errorMessage: string | null;
      httpStatus: number | null;
      durationMs: number | null;
      seoPageId: string | null;
      inputTokens: number;
      outputTokens: number;
      costCzk: number;
      warningsJson?: unknown;
      outputPreviewJson?: unknown;
      inputJson?: unknown;
      seoPage?: { id: string; title: string | null; status: string } | null;
    },
    index: number,
  ) {
    return {
      order: index + 1,
      id: item.id,
      status: item.status,
      localityName: item.localityName,
      localitySlug: item.localitySlug,
      intentSlug: item.intentSlug,
      offerType: item.offerType,
      propertyType: item.propertyType,
      phase: item.phase,
      attempt: item.attempt,
      qualityScore: item.qualityScore,
      uniquenessScore: item.uniquenessScore,
      errorCode: item.errorCode,
      errorMessage: item.errorMessage,
      httpStatus: item.httpStatus,
      durationMs: item.durationMs,
      seoPageId: item.seoPageId,
      inputTokens: item.inputTokens,
      outputTokens: item.outputTokens,
      costCzk: item.costCzk,
      warningsJson: item.warningsJson,
      outputPreviewJson: item.outputPreviewJson,
      inputJson: item.inputJson,
      seoPage: item.seoPage,
    };
  }

  private serializeJob(job: {
    id: string;
    status: SeoAiGenerationJobStatus;
    requestedCount: number;
    processedCount: number;
    createdCount: number;
    updatedCount: number;
    reviewCount: number;
    regeneratedCount: number;
    errorCount: number;
    skippedCount?: number;
    retriedCount?: number;
    requestCount?: number;
    successfulRequestCount?: number;
    failedRequestCount?: number;
    totalInputTokens?: number;
    totalOutputTokens?: number;
    estimatedCostCzk: number;
    actualCostCzk: number;
    currentItem: string | null;
    lastError?: string | null;
    pauseReason?: string | null;
    items?: unknown[];
  }) {
    const progressPct = job.requestedCount
      ? Math.round((job.processedCount / job.requestedCount) * 1000) / 10
      : 0;
    return {
      ...job,
      progressPct,
      skippedCount: job.skippedCount ?? 0,
      retriedCount: job.retriedCount ?? 0,
      requestCount: job.requestCount ?? 0,
      successfulRequestCount: job.successfulRequestCount ?? 0,
      failedRequestCount: job.failedRequestCount ?? 0,
      totalInputTokens: job.totalInputTokens ?? 0,
      totalOutputTokens: job.totalOutputTokens ?? 0,
    };
  }

  private async tick() {
    if (this.processing) return;
    this.processing = true;
    try {
      const job = await this.prisma.seoAiGenerationJob.findFirst({
        where: { status: { in: [SeoAiGenerationJobStatus.PENDING, SeoAiGenerationJobStatus.RUNNING] } },
        orderBy: { createdAt: 'asc' },
      });
      if (!job) return;

      if (job.status === SeoAiGenerationJobStatus.PENDING) {
        const preflight = await this.generation.validatePreflight();
        if (!preflight.ok) {
          await this.prisma.seoAiGenerationJob.update({
            where: { id: job.id },
            data: {
              status: SeoAiGenerationJobStatus.FAILED,
              lastError: preflight.message,
              pauseReason: preflight.code,
              finishedAt: new Date(),
            },
          });
          return;
        }
        await this.prisma.seoAiGenerationJob.update({
          where: { id: job.id },
          data: { status: SeoAiGenerationJobStatus.RUNNING, startedAt: new Date() },
        });
      }

      const item = await this.prisma.seoAiGenerationItem.findFirst({
        where: { jobId: job.id, status: SeoAiGenerationItemStatus.PENDING },
        orderBy: { createdAt: 'asc' },
      });

      if (!item) {
        await this.prisma.seoAiGenerationJob.update({
          where: { id: job.id },
          data: {
            status: job.errorCount > 0 ? SeoAiGenerationJobStatus.PARTIAL : SeoAiGenerationJobStatus.COMPLETED,
            finishedAt: new Date(),
            currentItem: null,
          },
        });
        return;
      }

      await this.processItem(job.id, item.id);
    } finally {
      this.processing = false;
    }
  }

  private async processItem(jobId: string, itemId: string) {
    const job = await this.prisma.seoAiGenerationJob.findUniqueOrThrow({ where: { id: jobId } });
    const item = await this.prisma.seoAiGenerationItem.findUniqueOrThrow({ where: { id: itemId } });
    const settings = (job.settingsJson ?? {}) as SeoAiJobSettings;
    const rawInput = (item.inputJson ?? settings) as SeoAiGenerateInput;
    const input = this.generation.normalizeBatchInput(rawInput, {
      locationId: item.locationId,
      intentSlug: item.intentSlug,
    });

    const locality = item.locationId
      ? await this.prisma.seoLocation.findUnique({
          where: { id: item.locationId },
          select: { id: true, name: true, slug: true, officialCode: true },
        })
      : null;

    const label = locality
      ? `${locality.name} (${locality.slug}) / ${item.intentSlug ?? '—'}`
      : `${item.localityName ?? item.localitySlug ?? input.localitySlug ?? '—'} / ${item.intentSlug ?? '—'}`;

    const startedAt = Date.now();
    await this.prisma.seoAiGenerationItem.update({
      where: { id: itemId },
      data: {
        status: SeoAiGenerationItemStatus.RUNNING,
        startedAt: new Date(),
        attempt: { increment: 1 },
        phase: 'PREFLIGHT',
        localityName: locality?.name ?? item.localityName,
        localitySlug: locality?.slug ?? item.localitySlug,
      },
    });
    await this.prisma.seoAiGenerationJob.update({
      where: { id: jobId },
      data: { currentItem: label },
    });

    this.log.log(`SEO AI job item start: job=${jobId} item=${itemId} ${label}`);

    try {
      const result = await this.generation.generateSeoAiPage(input, job.createdById ?? undefined, {
        batch: true,
        existingPageId: item.seoPageId ?? undefined,
        onExisting: settings.onExisting ?? 'update',
      });

      const durationMs = Date.now() - startedAt;
      const inputTokens = Number(result.inputTokens ?? 0);
      const outputTokens = Number(result.outputTokens ?? 0);
      const costCzk = Number(result.estimatedCostCzk ?? 0);

      if (result.skipped) {
        await this.prisma.seoAiGenerationItem.update({
          where: { id: itemId },
          data: {
            status: SeoAiGenerationItemStatus.SKIPPED,
            seoPageId: result.pageId,
            errorCode: result.skipReason ?? 'SKIPPED_ALREADY_EXISTS',
            errorMessage: 'Stránka již existuje — přeskočeno.',
            phase: 'DUPLICATE_CHECK',
            durationMs,
            finishedAt: new Date(),
            warningsJson: result.warnings as Prisma.InputJsonValue,
          },
        });
        await this.prisma.seoAiGenerationJob.update({
          where: { id: jobId },
          data: {
            processedCount: { increment: 1 },
            skippedCount: { increment: 1 },
            requestCount: { increment: 1 },
            successfulRequestCount: { increment: 1 },
          },
        });
        return;
      }

      const itemStatus =
        result.uniquenessScore != null && result.uniquenessScore < 65
          ? SeoAiGenerationItemStatus.REGENERATED
          : result.status === SeoContentStatus.AI_REVIEW
            ? SeoAiGenerationItemStatus.REVIEW
            : SeoAiGenerationItemStatus.COMPLETED;

      await this.prisma.seoAiGenerationItem.update({
        where: { id: itemId },
        data: {
          status: itemStatus,
          seoPageId: result.pageId,
          qualityScore: result.qualityScore,
          uniquenessScore: result.uniquenessScore,
          inputTokens,
          outputTokens,
          costCzk,
          phase: 'COMPLETED',
          httpStatus: 200,
          durationMs,
          finishedAt: new Date(),
          outputPreviewJson: {
            title: result.title,
            h1: result.h1,
            metaTitle: result.metaTitle,
            blockCount: Array.isArray((result as { buildLog?: { finalBlockCount?: number } }).buildLog)
              ? undefined
              : (result as { buildLog?: { finalBlockCount?: number } }).buildLog?.finalBlockCount,
          } as Prisma.InputJsonValue,
        },
      });

      await this.prisma.seoAiGenerationJob.update({
        where: { id: jobId },
        data: {
          processedCount: { increment: 1 },
          createdCount: { increment: result.action === 'created' ? 1 : 0 },
          updatedCount: { increment: result.action === 'updated' ? 1 : 0 },
          reviewCount: { increment: itemStatus === SeoAiGenerationItemStatus.REVIEW ? 1 : 0 },
          regeneratedCount: { increment: itemStatus === SeoAiGenerationItemStatus.REGENERATED ? 1 : 0 },
          requestCount: { increment: 1 },
          successfulRequestCount: { increment: 1 },
          totalInputTokens: { increment: inputTokens },
          totalOutputTokens: { increment: outputTokens },
          actualCostCzk: { increment: costCzk },
        },
      });

      this.log.log(
        `SEO AI job item OK: ${label} pageId=${result.pageId} action=${result.action} ${durationMs}ms`,
      );
    } catch (err) {
      const parsed = extractSeoAiJobError(err);
      const durationMs = Date.now() - startedAt;
      this.log.warn(
        `SEO AI job item FAILED: job=${jobId} item=${itemId} code=${parsed.code} phase=${parsed.phase} ${parsed.message}`,
      );

      const canRetry =
        isRetryableSeoAiError(parsed.code) && item.attempt + 1 < MAX_ITEM_ATTEMPTS;

      await this.prisma.seoAiGenerationItem.update({
        where: { id: itemId },
        data: {
          status: canRetry ? SeoAiGenerationItemStatus.PENDING : SeoAiGenerationItemStatus.FAILED,
          errorCode: parsed.code,
          errorMessage: parsed.message.slice(0, 2000),
          phase: parsed.phase,
          httpStatus: parsed.httpStatus,
          durationMs,
          finishedAt: canRetry ? null : new Date(),
          outputPreviewJson: parsed.technicalContext as Prisma.InputJsonValue,
        },
      });

      const jobUpdate: Prisma.SeoAiGenerationJobUpdateInput = {
        processedCount: canRetry ? undefined : { increment: 1 },
        errorCount: canRetry ? undefined : { increment: 1 },
        failedRequestCount: { increment: 1 },
        requestCount: { increment: 1 },
        lastError: canRetry
          ? `Retry pending: ${parsed.code}`
          : `${parsed.code}: ${parsed.message}`.slice(0, 2000),
        retriedCount: canRetry ? { increment: 1 } : undefined,
      };
      await this.prisma.seoAiGenerationJob.update({ where: { id: jobId }, data: jobUpdate });
      if (!canRetry) {
        await this.maybeAutoPause(jobId, parsed.code);
      }
    }
  }

  private async maybeAutoPause(jobId: string, latestCode: string) {
    const job = await this.prisma.seoAiGenerationJob.findUnique({
      where: { id: jobId },
      include: {
        items: {
          where: { status: SeoAiGenerationItemStatus.FAILED },
          orderBy: { finishedAt: 'desc' },
          take: AUTO_PAUSE_CONSECUTIVE,
        },
      },
    });
    if (!job || job.status !== SeoAiGenerationJobStatus.RUNNING) return;

    const recentFailed = job.items;
    const consecutiveSame =
      recentFailed.length >= AUTO_PAUSE_CONSECUTIVE &&
      recentFailed.every((i) => i.errorCode === latestCode);

    const errorRate =
      job.processedCount > 0 ? job.errorCount / job.processedCount : 0;
    const highErrorRate =
      job.processedCount >= AUTO_PAUSE_MIN_PROCESSED && errorRate >= AUTO_PAUSE_ERROR_RATE;

    if (consecutiveSame || highErrorRate) {
      const reason = consecutiveSame
        ? `AUTO_PAUSED_REPEATED_ERRORS (${latestCode})`
        : `AUTO_PAUSED_HIGH_ERROR_RATE (${Math.round(errorRate * 100)}%)`;
      await this.pauseJob(jobId, reason);
      this.log.warn(`SEO AI job ${jobId} auto-paused: ${reason}`);
    }
  }

  private async buildJobItems(settings: SeoAiJobSettings, count: number) {
    if (settings.pageIds?.length) {
      const pages = await this.prisma.seoPageContent.findMany({
        where: { id: { in: settings.pageIds } },
        include: { location: { select: { slug: true, name: true, id: true } } },
        take: count,
      });
      return pages.map((p) => {
        const intent = p.intentSlug ? getProgrammaticSeoIntent(p.intentSlug as never) : null;
        const inputJson = this.generation.normalizeBatchInput(
          {
            ...settings,
            locationSlug: p.location?.slug ?? settings.locationSlug,
            intentSlug: p.intentSlug ?? undefined,
          },
          { locationId: p.locationId, intentSlug: p.intentSlug },
        );
        return {
          locationId: p.locationId,
          intentSlug: p.intentSlug,
          seoPageId: p.id,
          localityName: p.location?.name,
          localitySlug: p.location?.slug,
          offerType: inputJson.offerType,
          propertyType: inputJson.propertyType,
          inputJson,
        };
      });
    }

    const locationWhere: Prisma.SeoLocationWhereInput = { ...buildLocationWhere() };
    const filterSlug = settings.locationSlug ?? settings.localitySlug;
    if (filterSlug) {
      const loc = await this.prisma.seoLocation.findFirst({
        where: { ...locationWhere, slug: filterSlug },
      });
      if (loc) locationWhere.id = loc.id;
    }

    const locations = await this.prisma.seoLocation.findMany({
      where: locationWhere,
      orderBy: [{ population: 'desc' }, { name: 'asc' }],
      take: Math.max(count, 1),
    });

    const intents = PROGRAMMATIC_SEO_INTENT_SLUGS;
    const items: Array<{
      locationId: string | null;
      intentSlug: string;
      seoPageId?: string;
      localityName?: string;
      localitySlug?: string;
      offerType?: string;
      propertyType?: string;
      inputJson: SeoAiGenerateInput;
    }> = [];

    for (const loc of locations) {
      if (/^\d+$/.test(loc.name.trim())) continue;
      for (const intentSlug of intents) {
        if (items.length >= count) break;
        const inputJson = this.generation.normalizeBatchInput(
          { ...settings, locationSlug: loc.slug, localitySlug: loc.slug, intentSlug },
          { locationId: loc.id, intentSlug },
        );
        items.push({
          locationId: loc.id,
          intentSlug,
          localityName: loc.name,
          localitySlug: loc.slug,
          offerType: inputJson.offerType,
          propertyType: inputJson.propertyType,
          inputJson,
        });
      }
      if (items.length >= count) break;
    }

    return items.slice(0, count);
  }

  private async countAiPagesToday() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return this.prisma.seoPageContent.count({
      where: { aiGenerated: true, aiGeneratedAt: { gte: start } },
    });
  }
}
