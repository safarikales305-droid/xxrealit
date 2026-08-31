import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { EDITORIAL_REEL_SETTINGS_KEY } from './editorial-reel.constants';
import {
  DEFAULT_EDITORIAL_REEL_SETTINGS,
  type EditorialReelAutomationSettings,
} from './editorial-reel.types';

@Injectable()
export class EditorialReelSettingsService implements OnModuleInit {
  private cached: EditorialReelAutomationSettings = { ...DEFAULT_EDITORIAL_REEL_SETTINGS };

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.reload();
  }

  getCached(): EditorialReelAutomationSettings {
    return this.cached;
  }

  async reload() {
    this.cached = await this.getSettings();
  }

  async getSettings(): Promise<EditorialReelAutomationSettings> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: EDITORIAL_REEL_SETTINGS_KEY },
    });
    if (!row?.valueJson) return { ...DEFAULT_EDITORIAL_REEL_SETTINGS };
    return this.normalize(row.valueJson);
  }

  async updateSettings(patch: Partial<EditorialReelAutomationSettings>) {
    const current = await this.getSettings();
    const next = { ...current, ...patch };
    await this.prisma.appSetting.upsert({
      where: { key: EDITORIAL_REEL_SETTINGS_KEY },
      create: { key: EDITORIAL_REEL_SETTINGS_KEY, valueJson: next as object },
      update: { valueJson: next as object },
    });
    this.cached = next;
    return next;
  }

  private normalize(raw: unknown): EditorialReelAutomationSettings {
    const d = DEFAULT_EDITORIAL_REEL_SETTINGS;
    const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const num = (v: unknown, fallback: number, min: number, max: number) => {
      const n = typeof v === 'number' ? v : Number.parseInt(String(v ?? ''), 10);
      if (!Number.isFinite(n)) return fallback;
      return Math.min(max, Math.max(min, Math.trunc(n)));
    };
    const categorySlugs = Array.isArray(o.categorySlugs)
      ? o.categorySlugs.map((x) => String(x).trim()).filter(Boolean)
      : d.categorySlugs;
    return {
      enabled: typeof o.enabled === 'boolean' ? o.enabled : d.enabled,
      videosPerReel: num(o.videosPerReel, d.videosPerReel, 2, 10),
      maxWaitHours: num(o.maxWaitHours, d.maxWaitHours, 1, 168),
      minVideos: num(o.minVideos, d.minVideos, 1, 10),
      autoPublish: typeof o.autoPublish === 'boolean' ? o.autoPublish : d.autoPublish,
      autoPublishYoutube:
        typeof o.autoPublishYoutube === 'boolean' ? o.autoPublishYoutube : d.autoPublishYoutube,
      youtubePrivacyStatus:
        o.youtubePrivacyStatus === 'public' ||
        o.youtubePrivacyStatus === 'unlisted' ||
        o.youtubePrivacyStatus === 'private'
          ? o.youtubePrivacyStatus
          : d.youtubePrivacyStatus,
      categorySlugs,
      templateId: typeof o.templateId === 'string' ? o.templateId : d.templateId ?? null,
      musicTrackId: typeof o.musicTrackId === 'string' ? o.musicTrackId : d.musicTrackId ?? null,
      ctaUrl: typeof o.ctaUrl === 'string' && o.ctaUrl.trim() ? o.ctaUrl.trim() : d.ctaUrl,
      introText: typeof o.introText === 'string' ? o.introText : d.introText,
      outroText: typeof o.outroText === 'string' ? o.outroText : d.outroText,
    };
  }
}
