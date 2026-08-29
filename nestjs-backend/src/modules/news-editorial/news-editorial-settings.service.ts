import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { NewsPublishMode } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NEWS_SETTINGS_KEY } from './news-editorial.constants';
import {
  DEFAULT_NEWS_AUTOMATION_SETTINGS,
  NEWS_ARTICLES_PER_DAY_MAX,
  NEWS_ARTICLES_PER_DAY_MIN,
  type NewsAutomationSettings,
} from './news-editorial-settings.types';
import { parsePublishTimeSlot } from './news-editorial.util';

@Injectable()
export class NewsEditorialSettingsService implements OnModuleInit {
  private readonly log = new Logger(NewsEditorialSettingsService.name);
  private cached: NewsAutomationSettings = { ...DEFAULT_NEWS_AUTOMATION_SETTINGS };

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.reload();
  }

  async reload() {
    this.cached = await this.getSettings();
  }

  getCached(): NewsAutomationSettings {
    return this.cached;
  }

  private bool(v: unknown, fallback: boolean): boolean {
    return typeof v === 'boolean' ? v : fallback;
  }

  private num(v: unknown, fallback: number, min: number, max: number): number {
    const n = typeof v === 'number' ? v : Number.parseInt(String(v ?? ''), 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(n)));
  }

  private str(v: unknown, fallback: string): string {
    return typeof v === 'string' && v.trim() ? v.trim() : fallback;
  }

  private linkTarget(
    v: unknown,
    fallback: NewsAutomationSettings['facebookLinkTargetPortalPost'],
  ): NewsAutomationSettings['facebookLinkTargetPortalPost'] {
    const allowed = [
      'PORTAL_DETAIL',
      'SOURCE',
      'YOUTUBE_ORIGINAL',
      'ARTICLE_DETAIL',
      'SHORTS_FEED',
    ] as const;
    return (
      typeof v === 'string' && (allowed as readonly string[]).includes(v) ? v : fallback
    ) as NewsAutomationSettings['facebookLinkTargetPortalPost'];
  }

  private strArray(v: unknown, fallback: string[]): string[] {
    if (!Array.isArray(v)) return fallback;
    const items = v
      .map((x) => (typeof x === 'string' ? x.trim() : ''))
      .filter(Boolean);
    return items.length ? items : fallback;
  }

  normalize(raw: unknown): NewsAutomationSettings {
    const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const d = DEFAULT_NEWS_AUTOMATION_SETTINGS;

    const publishModeRaw = this.str(o.publishMode, d.publishMode);
    const publishMode: NewsPublishMode =
      publishModeRaw === NewsPublishMode.MANUAL ||
      publishModeRaw === NewsPublishMode.AFTER_APPROVAL ||
      publishModeRaw === NewsPublishMode.AUTOMATIC
        ? publishModeRaw
        : d.publishMode;

    const autoPublishArticles =
      publishMode === NewsPublishMode.AUTOMATIC
        ? true
        : this.bool(o.autoPublishArticles, d.autoPublishArticles);

    const minArticlesPerDay = this.num(
      o.minArticlesPerDay,
      d.minArticlesPerDay,
      NEWS_ARTICLES_PER_DAY_MIN,
      NEWS_ARTICLES_PER_DAY_MAX,
    );
    const maxArticlesPerDay = this.num(
      o.maxArticlesPerDay,
      d.maxArticlesPerDay,
      NEWS_ARTICLES_PER_DAY_MIN,
      NEWS_ARTICLES_PER_DAY_MAX,
    );

    const publishTimes = this.strArray(o.publishTimes, d.publishTimes).filter(
      (slot) => parsePublishTimeSlot(slot) != null,
    );

    const settings: NewsAutomationSettings = {
      enabled: this.bool(o.enabled, d.enabled),
      autoFetchSources: this.bool(o.autoFetchSources, d.autoFetchSources),
      autoAiProcessing: this.bool(o.autoAiProcessing, d.autoAiProcessing),
      autoPublishArticles,
      fetchIntervalMinutes: this.num(o.fetchIntervalMinutes, d.fetchIntervalMinutes, 5, 720),
      publishMode,
      minArticlesPerDay: Math.min(minArticlesPerDay, maxArticlesPerDay),
      maxArticlesPerDay: Math.max(minArticlesPerDay, maxArticlesPerDay),
      maxArticlesPerSourcePerDay: this.num(
        o.maxArticlesPerSourcePerDay,
        d.maxArticlesPerSourcePerDay,
        1,
        20,
      ),
      minRelevanceScore: this.num(o.minRelevanceScore, d.minRelevanceScore, 0, 100),
      publishTimes: publishTimes.length ? publishTimes : d.publishTimes,
      minMinutesBetweenArticles: this.num(
        o.minMinutesBetweenArticles,
        d.minMinutesBetweenArticles,
        15,
        24 * 60,
      ),
      autoPublishMinQuality: this.num(o.autoPublishMinQuality, d.autoPublishMinQuality, 0, 100),
      minLanguageQuality: this.num(o.minLanguageQuality, d.minLanguageQuality, 0, 100),
      createPortalPost: this.bool(o.createPortalPost, d.createPortalPost),
      createFacebookPost: this.bool(o.createFacebookPost, d.createFacebookPost),
      portalPostAuthorLabel: this.str(o.portalPostAuthorLabel, d.portalPostAuthorLabel),
      addHashtags: this.bool(o.addHashtags, d.addHashtags),
      maxTeaserLength: this.num(o.maxTeaserLength, d.maxTeaserLength, 120, 500),
      defaultOgImageUrl: this.str(o.defaultOgImageUrl ?? '', d.defaultOgImageUrl ?? ''),
      youtubeMonitoringEnabled: this.bool(o.youtubeMonitoringEnabled, d.youtubeMonitoringEnabled),
      youtubeCheckIntervalMinutes: this.num(
        o.youtubeCheckIntervalMinutes,
        d.youtubeCheckIntervalMinutes,
        5,
        240,
      ),
      youtubeMaxPostsPerDay: this.num(o.youtubeMaxPostsPerDay, d.youtubeMaxPostsPerDay, 1, 200),
      youtubeMinRelevance: this.num(o.youtubeMinRelevance, d.youtubeMinRelevance, 0, 100),
      youtubeCreatePortalPost: this.bool(o.youtubeCreatePortalPost, d.youtubeCreatePortalPost),
      youtubeCreateFacebookPost: this.bool(o.youtubeCreateFacebookPost, d.youtubeCreateFacebookPost),
      youtubeUseAiTeaser: this.bool(o.youtubeUseAiTeaser, d.youtubeUseAiTeaser),
      youtubeInitialSyncVideos: this.num(o.youtubeInitialSyncVideos, d.youtubeInitialSyncVideos, 1, 50),
      youtubeInitialSyncIgnoreRelevance: this.bool(
        o.youtubeInitialSyncIgnoreRelevance,
        d.youtubeInitialSyncIgnoreRelevance,
      ),
      facebookLinkTargetPortalPost: this.linkTarget(
        o.facebookLinkTargetPortalPost,
        d.facebookLinkTargetPortalPost,
      ),
      facebookLinkTargetNewsArticle: this.linkTarget(
        o.facebookLinkTargetNewsArticle,
        d.facebookLinkTargetNewsArticle,
      ),
      facebookLinkTargetYoutube: this.linkTarget(o.facebookLinkTargetYoutube, d.facebookLinkTargetYoutube),
      facebookPostTemplate: this.str(o.facebookPostTemplate, d.facebookPostTemplate),
      facebookYoutubePostTemplate: this.str(o.facebookYoutubePostTemplate, d.facebookYoutubePostTemplate),
      facebookHashtags: this.str(o.facebookHashtags, d.facebookHashtags),
    };

    return settings;
  }

  async getSettings(): Promise<NewsAutomationSettings> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: NEWS_SETTINGS_KEY } });
    if (!row?.valueJson) return { ...DEFAULT_NEWS_AUTOMATION_SETTINGS };
    return this.normalize(row.valueJson);
  }

  async updateSettings(patch: Partial<NewsAutomationSettings>) {
    const current = await this.getSettings();
    const merged = this.normalize({ ...current, ...patch });

    if (merged.minArticlesPerDay > merged.maxArticlesPerDay) {
      throw new Error('Minimální počet článků za den nemůže být vyšší než maximum.');
    }

    await this.prisma.appSetting.upsert({
      where: { key: NEWS_SETTINGS_KEY },
      create: { key: NEWS_SETTINGS_KEY, valueJson: merged as object },
      update: { valueJson: merged as object },
    });
    this.cached = merged;
    this.log.log('News automation settings updated');
    return merged;
  }
}
