import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  NewsArticleStatus,
  NewsEditorialDecision,
  NewsPublishMode,
  NewsSourceItemStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NEWS_EDITORIAL_ENABLED, NEWS_WORKER_TICK_MS } from './news-editorial.constants';
import { NewsEditorialSettingsService } from './news-editorial-settings.service';
import { NewsFetchService } from './news-fetch.service';
import { NewsAiService } from './news-ai.service';
import { NewsPublishService } from './news-publish.service';
import { NewsYoutubeService } from './news-youtube.service';
import { NewsYoutubeDiscoveryService } from './news-youtube-discovery.service';
import { isWithinPublishWindow, pragueDayKey } from './news-publish-scheduler.util';
import {
  getNewsWorkerHeartbeat,
  getNewsWorkerLastError,
  isNewsWorkerPaused,
  isNewsWorkerProcessing,
  setNewsWorkerHeartbeat,
  setNewsWorkerLastError,
  setNewsWorkerPaused,
  setNewsWorkerProcessing,
} from './news-editorial-worker.state';

const publishedSlotsToday = new Set<string>();

export { getNewsWorkerHeartbeat } from './news-editorial-worker.state';

@Injectable()
export class NewsEditorialWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(NewsEditorialWorkerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastPragueDay = pragueDayKey();

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: NewsEditorialSettingsService,
    private readonly fetchService: NewsFetchService,
    private readonly ai: NewsAiService,
    private readonly publish: NewsPublishService,
    private readonly youtube: NewsYoutubeService,
    private readonly youtubeDiscovery: NewsYoutubeDiscoveryService,
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
    const heartbeat = getNewsWorkerHeartbeat();
    return {
      enabled: NEWS_EDITORIAL_ENABLED,
      paused: isNewsWorkerPaused(),
      online: heartbeat != null && Date.now() - heartbeat.getTime() < NEWS_WORKER_TICK_MS * 3,
      lastHeartbeatAt: heartbeat?.toISOString() ?? null,
      lastError: getNewsWorkerLastError(),
      processing: isNewsWorkerProcessing(),
      settings: this.settings.getCached(),
    };
  }

  pause() {
    setNewsWorkerPaused(true);
    return { paused: true };
  }

  resume() {
    setNewsWorkerPaused(false);
    void this.tick();
    return { paused: false };
  }

  private async tick() {
    if (!NEWS_EDITORIAL_ENABLED || isNewsWorkerProcessing() || isNewsWorkerPaused()) return;
    setNewsWorkerProcessing(true);
    setNewsWorkerHeartbeat(new Date());

    const today = pragueDayKey();
    if (today !== this.lastPragueDay) {
      publishedSlotsToday.clear();
      this.lastPragueDay = today;
    }

    try {
      const cfg = this.settings.getCached();
      if (!cfg.enabled) return;

      if (cfg.autoFetchSources) {
        await this.fetchService.fetchDueSources(3);
      }
      if (cfg.youtubeMonitoringEnabled) {
        await this.youtube.pollDueSources(15);
      }
      await this.youtubeDiscovery.runDiscoveryIfDue();
      if (cfg.autoAiProcessing) {
        await this.ai.analyzeNewItems(15);
        await this.generateDraftsWithinDailyLimit(cfg);
      }

      const autoEnabled =
        cfg.publishMode === NewsPublishMode.AUTOMATIC || cfg.autoPublishArticles;
      if (autoEnabled) {
        await this.autoPublishReadyDrafts(cfg);
      }
      await this.publish.publishScheduledDue(3);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setNewsWorkerLastError(msg);
      this.log.error(`Worker tick failed: ${msg}`);
    } finally {
      setNewsWorkerProcessing(false);
    }
  }

  private async generateDraftsWithinDailyLimit(cfg: ReturnType<NewsEditorialSettingsService['getCached']>) {
    const maxPerDay = cfg.maxArticlesPerDay;
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
        relevanceScore: { gte: cfg.minRelevanceScore },
        articleSources: { none: {} },
      },
      orderBy: [{ editorialDecision: 'desc' }, { trendScore: 'desc' }],
      take: remaining,
    });

    for (const item of items) {
      await this.ai.generateDraftFromItem(item.id);
    }
  }

  private async autoPublishReadyDrafts(cfg: ReturnType<NewsEditorialSettingsService['getCached']>) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const publishedToday = await this.prisma.newsArticle.count({
      where: { status: NewsArticleStatus.PUBLISHED, publishedAt: { gte: todayStart } },
    });
    if (publishedToday >= cfg.maxArticlesPerDay) return;

    const schedule = isWithinPublishWindow(cfg.publishTimes);
    if (!schedule.due) return;

    const slotKey = `${pragueDayKey()}:${schedule.slot?.label ?? 'any'}`;
    if (publishedSlotsToday.has(slotKey)) return;

    const candidates = await this.prisma.newsArticle.findMany({
      where: {
        status: { in: [NewsArticleStatus.DRAFT, NewsArticleStatus.REVIEW] },
        OR: [{ waitReason: 'AUTO_READY' }, { waitReason: null }],
      },
      orderBy: [{ languageQualityScore: 'desc' }, { qualityScore: 'desc' }, { createdAt: 'asc' }],
      take: Math.max(0, cfg.maxArticlesPerDay - publishedToday),
    });

    let publishedInSlot = 0;
    for (const draft of candidates) {
      if (publishedToday + publishedInSlot >= cfg.maxArticlesPerDay) break;
      const result = await this.publish.tryAutoPublish(draft.id);
      if (result.published) {
        publishedInSlot += 1;
        publishedSlotsToday.add(slotKey);
      }
    }
  }
}
