import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  DEFAULT_COMPANY_DIRECTORY_AUTOMATION_SETTINGS,
  FACEBOOK_POSTS_PER_DAY_MAX,
  FACEBOOK_POSTS_PER_DAY_MIN,
  type CompanyDirectoryAutomationSettings,
  type CompanyDirectoryAresImportSettings,
  type CompanyDirectoryFacebookSettings,
  type CompanyDirectoryEmailCampaignSettings,
  type CompanyDirectorySeoSettings,
} from './company-directory-settings.types';
import {
  ARES_IMPORT_BATCH_SIZE_OPTIONS,
} from './company-directory.constants';

const SETTINGS_KEY = 'company_directory_automation_settings';

@Injectable()
export class CompanyDirectorySettingsService implements OnModuleInit {
  private readonly log = new Logger(CompanyDirectorySettingsService.name);
  private cached: CompanyDirectoryAutomationSettings = {
    ...DEFAULT_COMPANY_DIRECTORY_AUTOMATION_SETTINGS,
  };

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.reload();
  }

  async reload() {
    this.cached = await this.getSettings();
  }

  getCached(): CompanyDirectoryAutomationSettings {
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

  private numArray(v: unknown, fallback: number[]): number[] {
    if (!Array.isArray(v)) return fallback;
    const nums = v
      .map((x) => (typeof x === 'number' ? x : Number.parseInt(String(x), 10)))
      .filter((n) => Number.isFinite(n));
    return nums.length ? nums : fallback;
  }

  normalize(raw: unknown): CompanyDirectoryAutomationSettings {
    const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const d = DEFAULT_COMPANY_DIRECTORY_AUTOMATION_SETTINGS;
    const seoRaw = o.seo && typeof o.seo === 'object' ? (o.seo as Record<string, unknown>) : {};
    const fbRaw = o.facebook && typeof o.facebook === 'object' ? (o.facebook as Record<string, unknown>) : {};
    const emailRaw = o.email && typeof o.email === 'object' ? (o.email as Record<string, unknown>) : {};
    const aresRaw =
      o.aresImport && typeof o.aresImport === 'object' ? (o.aresImport as Record<string, unknown>) : {};

    const seo: CompanyDirectorySeoSettings = {
      aiEnrichmentEnabled: this.bool(seoRaw.aiEnrichmentEnabled, d.seo.aiEnrichmentEnabled),
      enrichAfterWebsiteFound: this.bool(seoRaw.enrichAfterWebsiteFound, d.seo.enrichAfterWebsiteFound),
      minScoreForIndex: this.num(seoRaw.minScoreForIndex, d.seo.minScoreForIndex, 0, 100),
      refreshDays: this.num(seoRaw.refreshDays, d.seo.refreshDays, 7, 365),
      addSeoReadyToSitemap: this.bool(seoRaw.addSeoReadyToSitemap, d.seo.addSeoReadyToSitemap),
      noindexWeakProfiles: this.bool(seoRaw.noindexWeakProfiles, d.seo.noindexWeakProfiles),
      generateJsonLd: this.bool(seoRaw.generateJsonLd, d.seo.generateJsonLd),
    };

    const facebook: CompanyDirectoryFacebookSettings = {
      autoPublishNewCompanies: this.bool(fbRaw.autoPublishNewCompanies, d.facebook.autoPublishNewCompanies),
      postsPerDay: this.num(
        fbRaw.postsPerDay,
        d.facebook.postsPerDay,
        FACEBOOK_POSTS_PER_DAY_MIN,
        FACEBOOK_POSTS_PER_DAY_MAX,
      ),
      publishFromHour: this.num(fbRaw.publishFromHour, d.facebook.publishFromHour, 0, 23),
      publishToHour: this.num(fbRaw.publishToHour, d.facebook.publishToHour, 0, 23),
      onlyEnrichedCompanies: this.bool(fbRaw.onlyEnrichedCompanies, d.facebook.onlyEnrichedCompanies),
      useProfileAsCta: this.bool(fbRaw.useProfileAsCta, d.facebook.useProfileAsCta),
      headlineTemplate: this.str(fbRaw.headlineTemplate, d.facebook.headlineTemplate),
      textTemplate: this.str(fbRaw.textTemplate, d.facebook.textTemplate),
      ctaLabel: this.str(fbRaw.ctaLabel, d.facebook.ctaLabel),
    };

    const email: CompanyDirectoryEmailCampaignSettings = {
      enrollOnContactFound: this.bool(emailRaw.enrollOnContactFound, d.email.enrollOnContactFound),
      notifyOnNewReview: this.bool(emailRaw.notifyOnNewReview, d.email.notifyOnNewReview),
      notifyReviewAuthor: this.bool(emailRaw.notifyReviewAuthor, d.email.notifyReviewAuthor),
      notifyOnProfileInterest: this.bool(emailRaw.notifyOnProfileInterest, d.email.notifyOnProfileInterest),
      profileViewThrottleDays: this.num(emailRaw.profileViewThrottleDays, d.email.profileViewThrottleDays, 1, 30),
      sequenceDelaysDays: this.numArray(emailRaw.sequenceDelaysDays, d.email.sequenceDelaysDays),
      monthlyAfterSequence: this.bool(emailRaw.monthlyAfterSequence, d.email.monthlyAfterSequence),
    };

    const batchRaw = this.num(aresRaw.batchSize, d.aresImport.batchSize, 100, 1000);
    const batchSize = (ARES_IMPORT_BATCH_SIZE_OPTIONS as readonly number[]).includes(batchRaw)
      ? batchRaw
      : d.aresImport.batchSize;

    const maintainIntervalRaw = this.str(aresRaw.maintainInterval, d.aresImport.maintainInterval);
    const maintainInterval: CompanyDirectoryAresImportSettings['maintainInterval'] =
      maintainIntervalRaw === 'daily' || maintainIntervalRaw === 'weekly' || maintainIntervalRaw === 'manual'
        ? maintainIntervalRaw
        : d.aresImport.maintainInterval;

    const aresImport: CompanyDirectoryAresImportSettings = {
      batchSize,
      delayMs: this.num(aresRaw.delayMs, d.aresImport.delayMs, 0, 60_000),
      maxRetries: this.num(aresRaw.maxRetries, d.aresImport.maxRetries, 1, 10),
      concurrency: this.num(aresRaw.concurrency, d.aresImport.concurrency, 1, 3),
      autoContinue: this.bool(aresRaw.autoContinue, d.aresImport.autoContinue),
      saveCheckpoint: this.bool(aresRaw.saveCheckpoint, d.aresImport.saveCheckpoint),
      autoRecoverOnRestart: this.bool(aresRaw.autoRecoverOnRestart, d.aresImport.autoRecoverOnRestart),
      maintainRegistry: this.bool(aresRaw.maintainRegistry, d.aresImport.maintainRegistry),
      maintainInterval,
    };

    return { seo, facebook, email, aresImport };
  }

  async getSettings(): Promise<CompanyDirectoryAutomationSettings> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: SETTINGS_KEY } });
    if (!row?.valueJson) return { ...DEFAULT_COMPANY_DIRECTORY_AUTOMATION_SETTINGS };
    return this.normalize(row.valueJson);
  }

  async updateSettings(patch: Partial<CompanyDirectoryAutomationSettings>) {
    const current = await this.getSettings();
    const merged = this.normalize({
      seo: { ...current.seo, ...patch.seo },
      facebook: { ...current.facebook, ...patch.facebook },
      email: { ...current.email, ...patch.email },
      aresImport: { ...current.aresImport, ...patch.aresImport },
    });

    if (merged.facebook.publishFromHour >= merged.facebook.publishToHour) {
      throw new Error('Čas publikování „od“ musí být dříve než „do“.');
    }

    await this.prisma.appSetting.upsert({
      where: { key: SETTINGS_KEY },
      create: { key: SETTINGS_KEY, valueJson: merged as object },
      update: { valueJson: merged as object },
    });
    this.cached = merged;
    this.log.log('Company directory automation settings updated');
    return merged;
  }

  async getSeoStats() {
    const [
      total,
      withWebsite,
      enriched,
      seoReady,
      noindex,
      avgScore,
      webFound,
      aiProfile,
    ] = await Promise.all([
      this.prisma.companyDirectoryEntry.count(),
      this.prisma.companyDirectoryEntry.count({ where: { website: { not: null } } }),
      this.prisma.companyDirectoryEntry.count({
        where: { enrichmentStatus: { in: ['ENRICHED', 'VERIFIED'] } },
      }),
      this.prisma.companyDirectoryEntry.count({ where: { seoStatus: 'SEO_READY' } }),
      this.prisma.companyDirectoryEntry.count({ where: { seoStatus: 'SEO_NOT_READY' } }),
      this.prisma.companyDirectoryEntry.aggregate({ _avg: { seoQualityScore: true } }),
      this.prisma.companyDirectoryEntry.count({
        where: { website: { not: null }, websiteSource: { not: null } },
      }),
      this.prisma.companyDirectoryEntry.count({ where: { contentEnrichedAt: { not: null } } }),
    ]);

    return {
      total,
      websiteFound: webFound || withWebsite,
      aiProfileCreated: aiProfile,
      seoReady,
      noindex,
      averageSeoScore: Math.round(avgScore._avg.seoQualityScore ?? 0),
      enriched,
    };
  }

  async getFacebookStats() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [queued, publishedToday, publishedTotal, failed, skipped, waiting] = await Promise.all([
      this.prisma.companySocialPublishQueueItem.count({
        where: { status: { in: ['WAITING', 'SCHEDULED'] } },
      }),
      this.prisma.companySocialPublishQueueItem.count({
        where: { status: 'PUBLISHED', publishedAt: { gte: todayStart } },
      }),
      this.prisma.companySocialPublishQueueItem.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.companySocialPublishQueueItem.count({ where: { status: 'FAILED' } }),
      this.prisma.companySocialPublishQueueItem.count({ where: { status: 'SKIPPED' } }),
      this.prisma.companySocialPublishQueueItem.count({ where: { status: 'WAITING' } }),
    ]);
    const settings = this.getCached();
    return {
      queued,
      publishedToday,
      publishedTotal,
      failed,
      skipped,
      waiting,
      dailyLimit: settings.facebook.postsPerDay,
    };
  }
}
