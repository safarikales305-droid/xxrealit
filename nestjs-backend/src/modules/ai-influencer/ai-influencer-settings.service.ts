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
    const str = (v: unknown, fallback: string) =>
      typeof v === 'string' && v.trim() ? v.trim() : fallback;
    const approvalMode =
      o.approvalMode === 'MANUAL' || o.approvalMode === 'SEMI_AUTO' || o.approvalMode === 'FULL_AUTO'
        ? o.approvalMode
        : d.approvalMode;
    const qualityMode =
      o.qualityMode === 'ECONOMY' || o.qualityMode === 'STANDARD' || o.qualityMode === 'PREMIUM'
        ? o.qualityMode
        : d.qualityMode;
    const publishMode = (v: unknown, fallback: typeof d.facebookPublishMode) =>
      v === 'MANUAL' || v === 'AUTO_AFTER_GENERATION' || v === 'SCHEDULED' ? v : fallback;
    const spokenMode = (v: unknown) =>
      v === 'AUTO' || v === 'INTRO' || v === 'OUTRO' || v === 'INTRO_AND_OUTRO' || v === 'OFF'
        ? v
        : d.spokenBrandingMode;
    const logoPos = (v: unknown) =>
      v === 'top_left' || v === 'top_right' || v === 'bottom_left' || v === 'bottom_right'
        ? v
        : d.logoPosition;
    const brandingFreq = (v: unknown) =>
      v === 'EVERY' ||
      v === 'EVERY_OTHER' ||
      v === 'OUTRO_ONLY' ||
      v === 'INTRO_ONLY' ||
      v === 'OFF'
        ? v
        : d.brandingFrequency;
    const publishWindows = Array.isArray(o.publishWindows)
      ? o.publishWindows.map((x) => String(x).trim()).filter(Boolean)
      : d.publishWindows;
    const strArr = (v: unknown, fallback: string[]) =>
      Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : fallback;
    return {
      enabled: typeof o.enabled === 'boolean' ? o.enabled : d.enabled,
      minScore: num(o.minScore, d.minScore, 0, 100),
      maxPerDay: num(o.maxPerDay, d.maxPerDay, 0, 50),
      maxPerWeek: num(o.maxPerWeek, d.maxPerWeek, 0, 200),
      minIntervalHours: num(o.minIntervalHours, d.minIntervalHours, 0, 72),
      breakingThreshold: num(o.breakingThreshold, d.breakingThreshold, 0, 100),
      approvalMode,
      dailyBudgetCzk: num(o.dailyBudgetCzk ?? o.dailyCostLimitCzk, d.dailyBudgetCzk, 0, 100_000),
      qualityMode,
      targetDurationSec: num(o.targetDurationSec, d.targetDurationSec, 15, 90),
      minDurationSec: num(o.minDurationSec, d.minDurationSec, 10, 90),
      maxDurationSec: num(o.maxDurationSec, d.maxDurationSec, 15, 120),
      defaultMusicTrackId:
        typeof o.defaultMusicTrackId === 'string' ? o.defaultMusicTrackId : d.defaultMusicTrackId,
      publishWindows,
      autoPublishFacebook:
        typeof o.autoPublishFacebook === 'boolean' ? o.autoPublishFacebook : d.autoPublishFacebook,
      autoPublishInstagram:
        typeof o.autoPublishInstagram === 'boolean' ? o.autoPublishInstagram : d.autoPublishInstagram,
      autoPublishYoutube:
        typeof o.autoPublishYoutube === 'boolean' ? o.autoPublishYoutube : d.autoPublishYoutube,
      autoPublishPortal:
        typeof o.autoPublishPortal === 'boolean' ? o.autoPublishPortal : d.autoPublishPortal,
      youtubePrivacyStatus:
        o.youtubePrivacyStatus === 'public' ||
        o.youtubePrivacyStatus === 'unlisted' ||
        o.youtubePrivacyStatus === 'private'
          ? o.youtubePrivacyStatus
          : d.youtubePrivacyStatus,
      voiceCostPer1kCharsCzk: num(o.voiceCostPer1kCharsCzk, d.voiceCostPer1kCharsCzk, 0, 100),
      avatarCostPerSecCzk: num(o.avatarCostPerSecCzk, d.avatarCostPerSecCzk, 0, 100),
      generationStartTime: str(o.generationStartTime, d.generationStartTime),
      generationEndTime: str(o.generationEndTime, d.generationEndTime),
      checkIntervalMinutes: num(o.checkIntervalMinutes, d.checkIntervalMinutes, 5, 240),
      preferredCategories: strArr(o.preferredCategories, d.preferredCategories),
      blockedCategories: strArr(o.blockedCategories, d.blockedCategories),
      sourceBlacklist: strArr(o.sourceBlacklist, d.sourceBlacklist),
      facebookPublishMode: publishMode(o.facebookPublishMode, d.facebookPublishMode),
      instagramPublishMode: publishMode(o.instagramPublishMode, d.instagramPublishMode),
      youtubePublishMode: publishMode(o.youtubePublishMode, d.youtubePublishMode),
      portalPublishMode: publishMode(o.portalPublishMode, d.portalPublishMode),
      publishWindowStart: str(o.publishWindowStart, d.publishWindowStart),
      publishWindowEnd: str(o.publishWindowEnd, d.publishWindowEnd),
      minPublishSpacingMinutes: num(o.minPublishSpacingMinutes, d.minPublishSpacingMinutes, 15, 720),
      maxFacebookPerDay: num(o.maxFacebookPerDay, d.maxFacebookPerDay, 0, 50),
      maxInstagramPerDay: num(o.maxInstagramPerDay, d.maxInstagramPerDay, 0, 50),
      maxYoutubePerDay: num(o.maxYoutubePerDay, d.maxYoutubePerDay, 0, 50),
      maxPortalPerDay: num(o.maxPortalPerDay, d.maxPortalPerDay, 0, 50),
      brandingEnabled: typeof o.brandingEnabled === 'boolean' ? o.brandingEnabled : d.brandingEnabled,
      logoEnabled: typeof o.logoEnabled === 'boolean' ? o.logoEnabled : d.logoEnabled,
      logoPosition: logoPos(o.logoPosition),
      logoScalePercent: num(o.logoScalePercent, d.logoScalePercent, 5, 30),
      logoOpacity: num(o.logoOpacity, d.logoOpacity, 0.1, 1),
      logoPaddingPx: num(o.logoPaddingPx, d.logoPaddingPx, 0, 200),
      websiteWatermarkEnabled:
        typeof o.websiteWatermarkEnabled === 'boolean'
          ? o.websiteWatermarkEnabled
          : d.websiteWatermarkEnabled,
      websiteText: str(o.websiteText, d.websiteText),
      websiteWatermarkOpacity: num(o.websiteWatermarkOpacity, d.websiteWatermarkOpacity, 0.1, 1),
      websiteWatermarkFontSize: num(o.websiteWatermarkFontSize, d.websiteWatermarkFontSize, 20, 60),
      spokenBrandingEnabled:
        typeof o.spokenBrandingEnabled === 'boolean' ? o.spokenBrandingEnabled : d.spokenBrandingEnabled,
      spokenBrandingMode: spokenMode(o.spokenBrandingMode),
      brandDisplayName: str(o.brandDisplayName, d.brandDisplayName),
      brandTtsPronunciation: str(o.brandTtsPronunciation, d.brandTtsPronunciation),
      introTemplate: str(o.introTemplate, d.introTemplate),
      outroTemplate: str(o.outroTemplate, d.outroTemplate),
      brandingFrequency: brandingFreq(o.brandingFrequency),
      jobsConcurrency: num(o.jobsConcurrency, d.jobsConcurrency, 1, 5),
      heygenConcurrency: num(o.heygenConcurrency, d.heygenConcurrency, 1, 3),
      automationPaused:
        typeof o.automationPaused === 'boolean' ? o.automationPaused : d.automationPaused,
      automationPauseReason:
        typeof o.automationPauseReason === 'string' ? o.automationPauseReason : d.automationPauseReason,
      videoFormat: 'VERTICAL_SHORT_9_16',
      durationPreset:
        o.durationPreset === '35_45' || o.durationPreset === '45_60' ? o.durationPreset : d.durationPreset,
      scenePacing: o.scenePacing === 'calm' ? 'calm' : d.scenePacing,
      useArticleImages:
        typeof o.useArticleImages === 'boolean' ? o.useArticleImages : d.useArticleImages,
      usePortalMedia:
        typeof o.usePortalMedia === 'boolean' ? o.usePortalMedia : d.usePortalMedia,
      useBroll: typeof o.useBroll === 'boolean' ? o.useBroll : d.useBroll,
      useMusic: typeof o.useMusic === 'boolean' ? o.useMusic : d.useMusic,
      useSubtitles: typeof o.useSubtitles === 'boolean' ? o.useSubtitles : d.useSubtitles,
      useLogo: typeof o.useLogo === 'boolean' ? o.useLogo : d.useLogo,
      useCta: typeof o.useCta === 'boolean' ? o.useCta : d.useCta,
      mentionBrandInScript:
        typeof o.mentionBrandInScript === 'boolean' ? o.mentionBrandInScript : d.mentionBrandInScript,
      videoGoal:
        o.videoGoal === 'website_traffic' ||
        o.videoGoal === 'youtube_subscribe' ||
        o.videoGoal === 'facebook_follow' ||
        o.videoGoal === 'instagram_follow' ||
        o.videoGoal === 'auto'
          ? o.videoGoal
          : d.videoGoal,
    };
  }
}
