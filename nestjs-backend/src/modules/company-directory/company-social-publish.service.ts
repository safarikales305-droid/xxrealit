import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CompanySocialPublishQueueStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { resolveFrontendUrl } from '../../common/resolve-frontend-url';
import { SocialAutopostSettingsService } from '../social/autopost/social-autopost-settings.service';
import { SocialPublisherService } from '../social/autopost/social-publisher.service';
import { CompanyAuditService } from './company-audit.service';
import { CompanyDirectorySettingsService } from './company-directory-settings.service';
import { canEnqueueSocialIntro, isCompanyAutomationExcluded } from './company-eligibility.util';
import { ARES_WORKER_TICK_MS, CATEGORY_LABELS } from './company-directory.constants';
import type { CompanyEnrichmentPayload } from './company-sourced-field.types';
import { extractServicesFromEnrichment } from './company-seo.util';

const FB_VARIANTS = [
  'Na XXREALIT přibyla další firma 👋',
  'Představujeme další firmu v našem registru 📋',
  'Nově na XXREALIT najdete 🏢',
];

@Injectable()
export class CompanySocialPublishService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(CompanySocialPublishService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private processing = false;
  private automationPaused = false;
  private automationPauseReason: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: CompanyDirectorySettingsService,
    private readonly socialSettings: SocialAutopostSettingsService,
    private readonly publisher: SocialPublisherService,
    private readonly audit: CompanyAuditService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), ARES_WORKER_TICK_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async evaluateEligibility(companyId: string) {
    const cfg = this.settings.getCached();
    if (!cfg.facebook.autoPublishNewCompanies) return null;

    const company = await this.prisma.companyDirectoryEntry.findUnique({ where: { id: companyId } });
    if (!company) return null;
    if (cfg.facebook.onlyEnrichedCompanies && company.enrichmentStatus !== 'ENRICHED' && company.enrichmentStatus !== 'VERIFIED') {
      return null;
    }
    if (!canEnqueueSocialIntro(company)) return null;

    const existing = await this.prisma.companySocialPublishQueueItem.findUnique({
      where: { companyId },
    });
    if (existing) return existing;

    return this.prisma.companySocialPublishQueueItem.create({
      data: {
        companyId,
        status: CompanySocialPublishQueueStatus.WAITING,
      },
    });
  }

  async enqueueManual(companyId: string) {
    const company = await this.prisma.companyDirectoryEntry.findUnique({ where: { id: companyId } });
    if (!company) throw new Error('Firma nenalezena.');
    if (isCompanyAutomationExcluded(company)) throw new Error('Firma není způsobilá pro Facebook.');
    if (company.socialIntroPublishedAt) throw new Error('Intro příspěvek již byl publikován.');

    return this.prisma.companySocialPublishQueueItem.upsert({
      where: { companyId },
      create: { companyId, status: 'WAITING' },
      update: { status: 'WAITING', skippedReason: null, error: null },
    });
  }

  async skipQueueItem(itemId: string, reason: string) {
    return this.prisma.companySocialPublishQueueItem.update({
      where: { id: itemId },
      data: { status: 'SKIPPED', skippedReason: reason },
    });
  }

  async removeFromQueue(companyId: string) {
    return this.prisma.companySocialPublishQueueItem.deleteMany({ where: { companyId } });
  }

  buildPostText(
    company: {
      name: string;
      city: string | null;
      categories: string[];
      slug: string;
      website: string | null;
      shortDescription: string | null;
      enrichmentData: unknown;
    },
    variantIndex: number,
  ): { text: string; variant: string; profileUrl: string } {
    const cfg = this.settings.getCached();
    const category = company.categories[0] as keyof typeof CATEGORY_LABELS | undefined;
    const categoryLabel = category ? CATEGORY_LABELS[category] : 'Firma';
    const enrichment = (company.enrichmentData ?? null) as CompanyEnrichmentPayload | null;
    const services = extractServicesFromEnrichment(enrichment).slice(0, 4).join(', ');
    const base = resolveFrontendUrl().replace(/\/+$/, '');
    const profileUrl = `${base}/firmy/${company.slug}`;
    const variantIntro = FB_VARIANTS[variantIndex % FB_VARIANTS.length];

    const replacements: Record<string, string> = {
      '{{variantIntro}}': variantIntro,
      '{{companyName}}': company.name,
      '{{city}}': company.city ?? 'Česko',
      '{{category}}': categoryLabel,
      '{{profileUrl}}': profileUrl,
      '{{website}}': company.website ?? '',
      '{{shortDescription}}':
        company.shortDescription ??
        (services ? `Firma se zaměřuje na ${services}.` : 'Profil firmy na XXREALIT.'),
      '{{services}}': services,
    };

    let text = cfg.facebook.textTemplate;
    for (const [key, val] of Object.entries(replacements)) {
      text = text.split(key).join(val);
    }
    return { text, variant: String.fromCharCode(65 + (variantIndex % 3)), profileUrl };
  }

  async previewForCompany(companyId: string) {
    const company = await this.prisma.companyDirectoryEntry.findUnique({ where: { id: companyId } });
    if (!company) throw new Error('Firma nenalezena.');
    const idx = company.ico.charCodeAt(company.ico.length - 1) % FB_VARIANTS.length;
    const built = this.buildPostText(company, idx);
    const cfg = this.settings.getCached();
    return {
      headline: cfg.facebook.headlineTemplate,
      text: built.text,
      cta: cfg.facebook.ctaLabel,
      profileUrl: built.profileUrl,
      variant: built.variant,
    };
  }

  private async tick() {
    if (this.processing || this.automationPaused) return;
    const fb = this.socialSettings.getSettings().facebook;
    if (!fb.enabled) return;

    this.processing = true;
    try {
      await this.scheduleDueItems();
      await this.publishDueItems();
    } finally {
      this.processing = false;
    }
  }

  private async scheduleDueItems() {
    const cfg = this.settings.getCached();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const publishedToday = await this.prisma.companySocialPublishQueueItem.count({
      where: { status: 'PUBLISHED', publishedAt: { gte: todayStart } },
    });
    const remaining = Math.max(0, cfg.facebook.postsPerDay - publishedToday);
    if (remaining === 0) return;

    const waiting = await this.prisma.companySocialPublishQueueItem.findMany({
      where: { status: 'WAITING' },
      orderBy: { createdAt: 'asc' },
      take: remaining,
      include: { company: true },
    });

    const slots = this.distributeSlots(remaining, cfg.facebook.publishFromHour, cfg.facebook.publishToHour);
    for (let i = 0; i < waiting.length; i++) {
      const item = waiting[i];
      if (!item.company || isCompanyAutomationExcluded(item.company)) {
        await this.skipQueueItem(item.id, 'ineligible');
        continue;
      }
      const scheduledAt = slots[i] ?? this.nextSlot(cfg.facebook.publishFromHour, cfg.facebook.publishToHour);
      await this.prisma.companySocialPublishQueueItem.update({
        where: { id: item.id },
        data: { status: 'SCHEDULED', scheduledAt },
      });
    }
  }

  private distributeSlots(count: number, fromHour: number, toHour: number): Date[] {
    const now = new Date();
    const start = new Date(now);
    start.setHours(fromHour, 0, 0, 0);
    const end = new Date(now);
    end.setHours(toHour, 0, 0, 0);
    if (end <= start) end.setHours(toHour, 59, 0, 0);

    const windowMs = end.getTime() - start.getTime();
    const step = count > 1 ? windowMs / count : 0;
    const base = Math.max(start.getTime(), now.getTime());
    return Array.from({ length: count }, (_, i) => new Date(base + step * i));
  }

  private nextSlot(fromHour: number, toHour: number): Date {
    const d = new Date();
    const h = Math.min(toHour, Math.max(fromHour, d.getHours()));
    d.setHours(h, d.getMinutes() + 5, 0, 0);
    return d;
  }

  private async publishDueItems() {
    const due = await this.prisma.companySocialPublishQueueItem.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: { lte: new Date() },
      },
      take: 3,
      include: { company: true },
    });

    for (const item of due) {
      await this.publishItem(item.id);
    }
  }

  async publishItem(itemId: string) {
    const item = await this.prisma.companySocialPublishQueueItem.findUnique({
      where: { id: itemId },
      include: { company: true },
    });
    if (!item?.company) return;
    const company = item.company;

    if (company.socialIntroPublishedAt || company.socialIntroPostId) {
      await this.skipQueueItem(itemId, 'already_published');
      return;
    }

    await this.prisma.companySocialPublishQueueItem.update({
      where: { id: itemId },
      data: { status: 'PUBLISHING', attempts: { increment: 1 } },
    });

    const variantIndex = company.ico.charCodeAt(company.ico.length - 1) % FB_VARIANTS.length;
    const built = this.buildPostText(company, variantIndex);
    const cfg = this.settings.getCached();
    const link = cfg.facebook.useProfileAsCta ? built.profileUrl : built.profileUrl;

    try {
      const result = await this.publisher.publishToFacebook({
        message: built.text,
        link,
      });

      const postId = result.externalPostId ?? result.externalReelId ?? null;
      await this.prisma.$transaction([
        this.prisma.companySocialPublishQueueItem.update({
          where: { id: itemId },
          data: {
            status: 'PUBLISHED',
            publishedAt: new Date(),
            facebookPostId: postId,
            templateVariant: built.variant,
            postText: built.text,
            error: null,
          },
        }),
        this.prisma.companyDirectoryEntry.update({
          where: { id: company.id },
          data: {
            socialIntroPublishedAt: new Date(),
            socialIntroPostId: postId,
          },
        }),
      ]);

      await this.audit.log({
        companyId: company.id,
        action: 'FACEBOOK_PUBLISH',
        message: 'Intro příspěvek firmy publikován na Facebook',
        meta: { postId, variant: built.variant },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isAuth =
        /invalid token|permission|OAuth|190|200/i.test(message) ||
        /access token/i.test(message);

      if (isAuth) {
        this.automationPaused = true;
        this.automationPauseReason = message;
        this.log.error(`Facebook automation paused: ${message}`);
      }

      const failed = item.attempts >= 2 || isAuth;
      await this.prisma.companySocialPublishQueueItem.update({
        where: { id: itemId },
        data: {
          status: failed ? 'FAILED' : 'SCHEDULED',
          error: message,
          scheduledAt: failed ? item.scheduledAt : new Date(Date.now() + 15 * 60_000),
        },
      });
    }
  }

  async listQueue(query: { status?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 50));
    const where = query.status ? { status: query.status as CompanySocialPublishQueueStatus } : {};
    const [total, items] = await Promise.all([
      this.prisma.companySocialPublishQueueItem.count({ where }),
      this.prisma.companySocialPublishQueueItem.findMany({
        where,
        include: {
          company: {
            select: {
              id: true,
              name: true,
              slug: true,
              city: true,
              categories: true,
              website: true,
              phone: true,
              email: true,
              seoQualityScore: true,
              enrichmentStatus: true,
            },
          },
        },
        orderBy: [{ status: 'asc' }, { scheduledAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, page, pageSize, items, automationPaused: this.automationPaused, pauseReason: this.automationPauseReason };
  }

  resumeAutomation() {
    this.automationPaused = false;
    this.automationPauseReason = null;
  }
}
