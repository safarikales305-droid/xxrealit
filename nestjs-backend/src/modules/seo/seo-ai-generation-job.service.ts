import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, SeoAiGenerationItemStatus, SeoAiGenerationJobStatus, SeoContentStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PROGRAMMATIC_SEO_INTENT_SLUGS } from './programmatic-seo-intents';
import type { SeoAiGenerateInput } from './seo-ai-layout.types';
import { SeoAiGenerationService } from './seo-ai-generation.service';
import { SeoAiQualityService } from './seo-ai-quality.service';
import { buildLocationWhere } from './seo-generation.util';

const TICK_MS = 4000;
const MAX_DAILY_AI_PAGES = 100;
const MAX_BATCH_WITHOUT_CONFIRM = 10;

export type SeoAiJobSettings = SeoAiGenerateInput & {
  count?: number;
  pageIds?: string[];
  improveNoindex?: boolean;
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
        items: { orderBy: { createdAt: 'asc' }, take: 50 },
      },
    });
    if (!job) throw new BadRequestException('Úloha nenalezena.');
    const progressPct = job.requestedCount
      ? Math.round((job.processedCount / job.requestedCount) * 1000) / 10
      : 0;
    return { ...job, progressPct };
  }

  async listJobs(limit = 20) {
    return this.prisma.seoAiGenerationJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getActiveJob() {
    return this.prisma.seoAiGenerationJob.findFirst({
      where: {
        status: { in: [SeoAiGenerationJobStatus.PENDING, SeoAiGenerationJobStatus.RUNNING, SeoAiGenerationJobStatus.PAUSED] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async pauseJob(jobId: string) {
    await this.prisma.seoAiGenerationJob.updateMany({
      where: { id: jobId, status: SeoAiGenerationJobStatus.RUNNING },
      data: { status: SeoAiGenerationJobStatus.PAUSED, pausedAt: new Date() },
    });
    return { success: true };
  }

  async resumeJob(jobId: string) {
    await this.prisma.seoAiGenerationJob.updateMany({
      where: { id: jobId, status: SeoAiGenerationJobStatus.PAUSED },
      data: { status: SeoAiGenerationJobStatus.RUNNING, pausedAt: null },
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

      const settings = (job.settingsJson ?? {}) as SeoAiJobSettings;
      const input = (item.inputJson ?? settings) as SeoAiGenerateInput;

      await this.prisma.seoAiGenerationItem.update({
        where: { id: item.id },
        data: { status: SeoAiGenerationItemStatus.RUNNING, startedAt: new Date(), attempt: { increment: 1 } },
      });
      await this.prisma.seoAiGenerationJob.update({
        where: { id: job.id },
        data: { currentItem: `${input.locationSlug} / ${item.intentSlug}` },
      });

      try {
        const result = await this.generation.generateAndSave(input, job.createdById ?? undefined, {
          existingPageId: item.seoPageId ?? undefined,
        });

        const itemStatus =
          result.uniquenessScore < 65
            ? SeoAiGenerationItemStatus.REGENERATED
            : result.status === SeoContentStatus.AI_REVIEW
              ? SeoAiGenerationItemStatus.REVIEW
              : SeoAiGenerationItemStatus.COMPLETED;

        await this.prisma.seoAiGenerationItem.update({
          where: { id: item.id },
          data: {
            status: itemStatus,
            seoPageId: result.pageId,
            qualityScore: result.qualityScore,
            uniquenessScore: result.uniquenessScore,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            costCzk: result.estimatedCostCzk,
            finishedAt: new Date(),
          },
        });

        await this.prisma.seoAiGenerationJob.update({
          where: { id: job.id },
          data: {
            processedCount: { increment: 1 },
            createdCount: { increment: result.action === 'created' ? 1 : 0 },
            updatedCount: { increment: result.action === 'updated' ? 1 : 0 },
            reviewCount: { increment: itemStatus === SeoAiGenerationItemStatus.REVIEW ? 1 : 0 },
            regeneratedCount: { increment: itemStatus === SeoAiGenerationItemStatus.REGENERATED ? 1 : 0 },
            actualCostCzk: { increment: result.estimatedCostCzk },
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log.warn(`AI job item failed: ${msg}`);
        await this.prisma.seoAiGenerationItem.update({
          where: { id: item.id },
          data: {
            status: SeoAiGenerationItemStatus.FAILED,
            errorCode: 'AI_GENERATION_FAILED',
            errorMessage: msg.slice(0, 2000),
            finishedAt: new Date(),
          },
        });
        await this.prisma.seoAiGenerationJob.update({
          where: { id: job.id },
          data: {
            processedCount: { increment: 1 },
            errorCount: { increment: 1 },
            lastError: msg.slice(0, 2000),
          },
        });
      }
    } finally {
      this.processing = false;
    }
  }

  private async buildJobItems(settings: SeoAiJobSettings, count: number) {
    if (settings.pageIds?.length) {
      const pages = await this.prisma.seoPageContent.findMany({
        where: { id: { in: settings.pageIds } },
        include: { location: { select: { slug: true } } },
        take: count,
      });
      return pages.map((p) => ({
        locationId: p.locationId,
        intentSlug: p.intentSlug,
        seoPageId: p.id,
        inputJson: {
          ...settings,
          locationSlug: p.location?.slug ?? settings.locationSlug,
          intentSlug: p.intentSlug ?? undefined,
        },
      }));
    }

    const locations = await this.prisma.seoLocation.findMany({
      where: buildLocationWhere(),
      orderBy: [{ population: 'desc' }, { name: 'asc' }],
      take: Math.max(count, 1),
    });

    const intents = PROGRAMMATIC_SEO_INTENT_SLUGS;
    const items: Array<{
      locationId: string | null;
      intentSlug: string;
      seoPageId?: string;
      inputJson: SeoAiGenerateInput;
    }> = [];

    for (const loc of locations) {
      for (const intentSlug of intents) {
        if (items.length >= count) break;
        items.push({
          locationId: loc.id,
          intentSlug,
          inputJson: {
            ...settings,
            locationSlug: loc.slug,
            intentSlug,
          },
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
