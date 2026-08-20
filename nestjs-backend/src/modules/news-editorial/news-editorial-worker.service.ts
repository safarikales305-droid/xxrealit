import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NewsEditorialDecision, NewsSourceItemStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NEWS_EDITORIAL_ENABLED, NEWS_WORKER_TICK_MS } from './news-editorial.constants';
import { NewsEditorialSettingsService } from './news-editorial-settings.service';
import { NewsFetchService } from './news-fetch.service';
import { NewsAiService } from './news-ai.service';
import { NewsPublishService } from './news-publish.service';

let workerHeartbeat: Date | null = null;
let workerLastError: string | null = null;
let workerProcessing = false;

export function getNewsWorkerHeartbeat() {
  return workerHeartbeat;
}

@Injectable()
export class NewsEditorialWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(NewsEditorialWorkerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: NewsEditorialSettingsService,
    private readonly fetchService: NewsFetchService,
    private readonly ai: NewsAiService,
    private readonly publish: NewsPublishService,
  ) {}

  onModuleInit(): void {
    if (!NEWS_EDITORIAL_ENABLED) {
      this.log.warn('News editorial worker disabled (NEWS_EDITORIAL_ENABLED=false)');
      return;
    }
    this.log.log(`News editorial worker started tickMs=${NEWS_WORKER_TICK_MS}`);
    this.timer = setInterval(() => void this.tick(), NEWS_WORKER_TICK_MS);
    void this.tick();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  pulse() {
    void this.tick();
  }

  getStatus() {
    return {
      enabled: NEWS_EDITORIAL_ENABLED,
      online: workerHeartbeat != null && Date.now() - workerHeartbeat.getTime() < NEWS_WORKER_TICK_MS * 3,
      lastHeartbeatAt: workerHeartbeat?.toISOString() ?? null,
      lastError: workerLastError,
      processing: workerProcessing,
      settings: this.settings.getCached(),
    };
  }

  private async tick() {
    if (!NEWS_EDITORIAL_ENABLED || workerProcessing) return;
    workerProcessing = true;
    workerHeartbeat = new Date();

    try {
      const cfg = this.settings.getCached();
      if (!cfg.enabled) return;

      await this.fetchService.fetchDueSources(3);
      await this.ai.analyzeNewItems(15);
      await this.generateDraftsWithinDailyLimit(cfg.maxArticlesPerDay);
      await this.publish.publishScheduledDue(3);
    } catch (err) {
      workerLastError = err instanceof Error ? err.message : String(err);
      this.log.error(`Worker tick failed: ${workerLastError}`);
    } finally {
      workerProcessing = false;
    }
  }

  private async generateDraftsWithinDailyLimit(maxPerDay: number) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const createdToday = await this.prisma.newsArticle.count({
      where: { createdAt: { gte: todayStart } },
    });
    const remaining = Math.max(0, maxPerDay - createdToday);
    if (remaining <= 0) return;

    const items = await this.prisma.newsSourceItem.findMany({
      where: {
        status: NewsSourceItemStatus.ANALYZED,
        editorialDecision: {
          in: [NewsEditorialDecision.CREATE_DRAFT, NewsEditorialDecision.HIGH_PRIORITY],
        },
        articleSources: { none: {} },
      },
      orderBy: [{ editorialDecision: 'desc' }, { trendScore: 'desc' }],
      take: remaining,
    });

    for (const item of items) {
      await this.ai.generateDraftFromItem(item.id);
    }
  }
}
