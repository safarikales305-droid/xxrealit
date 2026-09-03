import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AI_INFLUENCER_SETTINGS_KEY } from './ai-influencer.constants';
import {
  DEFAULT_AI_INFLUENCER_SETTINGS,
  type AiInfluencerAutomationSettings,
} from './ai-influencer.types';

@Injectable()
export class AiInfluencerSettingsService implements OnModuleInit {
  private cached: AiInfluencerAutomationSettings = { ...DEFAULT_AI_INFLUENCER_SETTINGS };

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.reload();
  }

  getCached(): AiInfluencerAutomationSettings {
    return this.cached;
  }

  async reload() {
    this.cached = await this.getSettings();
  }

  async getSettings(): Promise<AiInfluencerAutomationSettings> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: AI_INFLUENCER_SETTINGS_KEY },
    });
    if (!row?.valueJson) return { ...DEFAULT_AI_INFLUENCER_SETTINGS };
    return this.normalize(row.valueJson);
  }

  async updateSettings(patch: Partial<AiInfluencerAutomationSettings>) {
    const current = await this.getSettings();
    const next = { ...current, ...patch };
    await this.prisma.appSetting.upsert({
      where: { key: AI_INFLUENCER_SETTINGS_KEY },
      create: { key: AI_INFLUENCER_SETTINGS_KEY, valueJson: next as object },
      update: { valueJson: next as object },
    });
    this.cached = next;
    return next;
  }

  private normalize(raw: unknown): AiInfluencerAutomationSettings {
    const d = DEFAULT_AI_INFLUENCER_SETTINGS;
    const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const num = (v: unknown, fallback: number, min: number, max: number) => {
      const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? ''));
      if (!Number.isFinite(n)) return fallback;
      return Math.min(max, Math.max(min, n));
    };
    const approvalMode =
      o.approvalMode === 'MANUAL' || o.approvalMode === 'SEMI_AUTO' || o.approvalMode === 'FULL_AUTO'
        ? o.approvalMode
        : d.approvalMode;
    const qualityMode =
      o.qualityMode === 'ECONOMY' || o.qualityMode === 'STANDARD' || o.qualityMode === 'PREMIUM'
        ? o.qualityMode
        : d.qualityMode;
    const publishWindows = Array.isArray(o.publishWindows)
      ? o.publishWindows.map((x) => String(x).trim()).filter(Boolean)
      : d.publishWindows;
    return {
      enabled: typeof o.enabled === 'boolean' ? o.enabled : d.enabled,
      minScore: num(o.minScore, d.minScore, 0, 100),
      maxPerDay: num(o.maxPerDay, d.maxPerDay, 0, 50),
      maxPerWeek: num(o.maxPerWeek, d.maxPerWeek, 0, 200),
      minIntervalHours: num(o.minIntervalHours, d.minIntervalHours, 0, 72),
      breakingThreshold: num(o.breakingThreshold, d.breakingThreshold, 0, 100),
      approvalMode,
      dailyBudgetCzk: num(o.dailyBudgetCzk, d.dailyBudgetCzk, 0, 100_000),
      qualityMode,
      targetDurationSec: num(o.targetDurationSec, d.targetDurationSec, 15, 90),
      minDurationSec: num(o.minDurationSec, d.minDurationSec, 10, 90),
      maxDurationSec: num(o.maxDurationSec, d.maxDurationSec, 15, 120),
      defaultMusicTrackId:
        typeof o.defaultMusicTrackId === 'string' ? o.defaultMusicTrackId : d.defaultMusicTrackId,
      publishWindows,
      autoPublishFacebook:
        typeof o.autoPublishFacebook === 'boolean' ? o.autoPublishFacebook : d.autoPublishFacebook,
      autoPublishYoutube:
        typeof o.autoPublishYoutube === 'boolean' ? o.autoPublishYoutube : d.autoPublishYoutube,
      youtubePrivacyStatus:
        o.youtubePrivacyStatus === 'public' ||
        o.youtubePrivacyStatus === 'unlisted' ||
        o.youtubePrivacyStatus === 'private'
          ? o.youtubePrivacyStatus
          : d.youtubePrivacyStatus,
      voiceCostPer1kCharsCzk: num(o.voiceCostPer1kCharsCzk, d.voiceCostPer1kCharsCzk, 0, 100),
      avatarCostPerSecCzk: num(o.avatarCostPerSecCzk, d.avatarCostPerSecCzk, 0, 100),
    };
  }
}
