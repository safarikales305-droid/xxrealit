import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  DEFAULT_SHORTS_FEED_SETTINGS,
  SHORTS_FEED_SETTINGS_KEY,
  type ShortsFeedPropertyPriority,
  type ShortsFeedSettings,
} from './shorts-feed-settings.types';

@Injectable()
export class ShortsFeedSettingsService {
  private readonly log = new Logger(ShortsFeedSettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private num(v: unknown, fallback: number, min: number, max: number): number {
    const n = typeof v === 'number' ? v : Number.parseInt(String(v ?? ''), 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(n)));
  }

  private priority(v: unknown): ShortsFeedPropertyPriority {
    const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
    if (s === 'medium' || s === 'low') return s;
    return 'high';
  }

  normalize(raw: unknown): ShortsFeedSettings {
    const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const d = DEFAULT_SHORTS_FEED_SETTINGS;
    return {
      showProperties: o.showProperties !== false,
      showYoutube: o.showYoutube !== false,
      showArticles: o.showArticles !== false,
      showNews: o.showNews !== false,
      showEditorial: o.showEditorial !== false,
      showUserPosts: o.showUserPosts !== false,
      showFinanceNews: o.showFinanceNews !== false,
      propertyPriority: this.priority(o.propertyPriority),
      contentEveryNItems: this.num(o.contentEveryNItems, d.contentEveryNItems, 2, 12),
      minPropertyRatioPercent: this.num(o.minPropertyRatioPercent, d.minPropertyRatioPercent, 0, 100),
      propertyRatioTierLow: this.num(o.propertyRatioTierLow, d.propertyRatioTierLow, 0, 100),
      propertyRatioTierMid: this.num(o.propertyRatioTierMid, d.propertyRatioTierMid, 0, 100),
      propertyRatioTierHigh: this.num(o.propertyRatioTierHigh, d.propertyRatioTierHigh, 0, 100),
    };
  }

  async getSettings(): Promise<ShortsFeedSettings> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: SHORTS_FEED_SETTINGS_KEY },
    });
    if (!row) return { ...DEFAULT_SHORTS_FEED_SETTINGS };
    return this.normalize(row.valueJson);
  }

  async updateSettings(patch: Partial<ShortsFeedSettings>): Promise<ShortsFeedSettings> {
    const current = await this.getSettings();
    const next = this.normalize({ ...current, ...patch });
    await this.prisma.appSetting.upsert({
      where: { key: SHORTS_FEED_SETTINGS_KEY },
      create: { key: SHORTS_FEED_SETTINGS_KEY, valueJson: next as unknown as Prisma.InputJsonValue },
      update: { valueJson: next as unknown as Prisma.InputJsonValue },
    });
    this.log.log(`[shorts-feed-settings] updated ${JSON.stringify(next)}`);
    return next;
  }
}
