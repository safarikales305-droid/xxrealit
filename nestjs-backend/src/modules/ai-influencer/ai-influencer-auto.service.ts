import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AiInfluencerReelJobStatus, NewsArticleStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AI_INFLUENCER_AUTO_TICK_MS } from './ai-influencer.constants';
import { AiInfluencerJobService } from './ai-influencer-job.service';
import { AiInfluencerSettingsService } from './ai-influencer-settings.service';
import { decodeHtmlEntities, isWithinPragueWindow } from './ai-influencer-text.util';

@Injectable()
export class AiInfluencerAutoService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(AiInfluencerAutoService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastPickAt = 0;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: AiInfluencerJobService,
    private readonly settings: AiInfluencerSettingsService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), AI_INFLUENCER_AUTO_TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const cfg = await this.settings.getSettings();
      if (!cfg.enabled || cfg.automationPaused) return;

      const intervalMs = cfg.checkIntervalMinutes * 60 * 1000;
      if (Date.now() - this.lastPickAt < intervalMs) return;

      if (!isWithinPragueWindow(cfg.generationStartTime, cfg.generationEndTime)) {
        return;
      }

      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const [todayCount, costToday, recentFails] = await Promise.all([
        this.prisma.aiInfluencerReelJob.count({
          where: {
            createdAt: { gte: dayStart },
            status: {
              notIn: [
                AiInfluencerReelJobStatus.SKIPPED_QUALITY,
                AiInfluencerReelJobStatus.SKIPPED_DUPLICATE,
                AiInfluencerReelJobStatus.CANCELLED,
              ],
            },
          },
        }),
        this.prisma.aiInfluencerReelJob.aggregate({
          where: { createdAt: { gte: dayStart } },
          _sum: { totalExternalCost: true },
        }),
        this.prisma.aiInfluencerReelJob.count({
          where: {
            status: AiInfluencerReelJobStatus.FAILED,
            updatedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
          },
        }),
      ]);

      if (todayCount >= cfg.maxPerDay) return;
      if ((costToday._sum.totalExternalCost ?? 0) >= cfg.dailyBudgetCzk) return;

      if (recentFails >= 3) {
        await this.settings.updateSettings({
          automationPaused: true,
          automationPauseReason: `${recentFails} technických chyb za poslední hodinu`,
        });
        this.log.warn('AI Influencer automatika pozastavena — opakované chyby');
        return;
      }

      const inFlight = await this.prisma.aiInfluencerReelJob.count({
        where: {
          status: {
            in: [
              AiInfluencerReelJobStatus.EVALUATING,
              AiInfluencerReelJobStatus.CANDIDATE,
              AiInfluencerReelJobStatus.SCRIPT_GENERATING,
              AiInfluencerReelJobStatus.VOICE_GENERATING,
              AiInfluencerReelJobStatus.AVATAR_GENERATING,
              AiInfluencerReelJobStatus.RENDERING,
            ],
          },
        },
      });
      if (inFlight >= cfg.jobsConcurrency) return;

      const articles = await this.prisma.newsArticle.findMany({
        where: { status: NewsArticleStatus.PUBLISHED },
        orderBy: { publishedAt: 'desc' },
        take: 30,
        select: {
          id: true,
          title: true,
          category: true,
          aiInfluencerReelJobs: {
            where: {
              createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
            },
            select: { id: true, status: true },
            take: 1,
          },
        },
      });

      for (const article of articles) {
        if (todayCount >= cfg.maxPerDay) break;
        if (article.aiInfluencerReelJobs.length > 0) continue;

        const category = decodeHtmlEntities(article.category ?? '');
        if (cfg.blockedCategories.some((c) => category.toLowerCase().includes(c.toLowerCase()))) {
          continue;
        }
        if (
          cfg.preferredCategories.length > 0 &&
          !cfg.preferredCategories.some((c) => category.toLowerCase().includes(c.toLowerCase()))
        ) {
          continue;
        }

        this.lastPickAt = Date.now();
        try {
          await this.jobs.createJobFromArticle(article.id);
          this.log.log(`Auto-picked article ${article.id} for AI Reel`);
        } catch (err) {
          this.log.warn(`Auto pick failed for ${article.id}: ${err}`);
        }
        break;
      }
    } finally {
      this.running = false;
    }
  }

  getNextCheckInMinutes(): number {
    const cfg = this.settings.getCached();
    const elapsed = Date.now() - this.lastPickAt;
    const remaining = cfg.checkIntervalMinutes * 60 * 1000 - elapsed;
    return Math.max(0, Math.ceil(remaining / 60_000));
  }
}
