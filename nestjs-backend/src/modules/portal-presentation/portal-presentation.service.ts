import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  DEFAULT_PRESENTATION_FAQ,
  DEFAULT_PRESENTATION_PAGE,
  DEFAULT_PRESENTATION_SECTIONS,
} from './portal-presentation.defaults';
import type {
  ReorderSectionsDto,
  TrackAnalyticsDto,
  UpdatePresentationPageDto,
  UpsertFaqDto,
  UpsertPresentationSectionDto,
} from './dto/portal-presentation.dto';

const SUPPORTED_LOCALES = ['cs', 'sk', 'en', 'de', 'pl'] as const;

@Injectable()
export class PortalPresentationService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensureDefaultPage();
  }

  private serializeSection(row: {
    id: string;
    anchor: string;
    sectionType: string;
    sortOrder: number;
    isVisible: boolean;
    icon: string | null;
    title: string;
    subtitle: string | null;
    bodyHtml: string;
    imageUrl: string | null;
    galleryUrls: string[];
    videoUrl: string | null;
    youtubeUrl: string | null;
    ctaLabel: string | null;
    ctaUrl: string | null;
    accentColor: string | null;
    bgStyle: string;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      anchor: row.anchor,
      sectionType: row.sectionType,
      sortOrder: row.sortOrder,
      isVisible: row.isVisible,
      icon: row.icon,
      title: row.title,
      subtitle: row.subtitle,
      bodyHtml: row.bodyHtml,
      imageUrl: row.imageUrl,
      galleryUrls: row.galleryUrls,
      videoUrl: row.videoUrl,
      youtubeUrl: row.youtubeUrl,
      ctaLabel: row.ctaLabel,
      ctaUrl: row.ctaUrl,
      accentColor: row.accentColor,
      bgStyle: row.bgStyle,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private serializePage(
    page: {
      id: string;
      locale: string;
      slug: string;
      isPublished: boolean;
      metaTitle: string;
      metaDescription: string;
      metaKeywords: string | null;
      ogImageUrl: string | null;
      canonicalUrl: string | null;
      heroTitle: string;
      heroSubtitle: string;
      heroBadgeText: string | null;
      faqTitle: string | null;
      heroCtaLabel: string | null;
      heroCtaUrl: string | null;
      heroSecondaryCtaLabel: string | null;
      heroSecondaryCtaUrl: string | null;
      heroImageUrl: string | null;
      heroVideoUrl: string | null;
      heroGradientFrom: string;
      heroGradientTo: string;
      contactEmail: string | null;
      contactPhone: string | null;
      contactAddress: string | null;
      publishedAt: Date | null;
      updatedAt: Date;
      sections: Array<Parameters<PortalPresentationService['serializeSection']>[0]>;
      faqItems: Array<{
        id: string;
        question: string;
        answerHtml: string;
        sortOrder: number;
      }>;
    },
    includeHidden = false,
  ) {
    const sections = page.sections
      .filter((s) => includeHidden || s.isVisible)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => this.serializeSection(s));

    return {
      id: page.id,
      locale: page.locale,
      slug: page.slug,
      isPublished: page.isPublished,
      metaTitle: page.metaTitle,
      metaDescription: page.metaDescription,
      metaKeywords: page.metaKeywords,
      ogImageUrl: page.ogImageUrl,
      canonicalUrl: page.canonicalUrl,
      heroTitle: page.heroTitle,
      heroSubtitle: page.heroSubtitle,
      heroBadgeText: page.heroBadgeText ?? 'Představení portálu',
      faqTitle: page.faqTitle ?? 'Časté dotazy',
      heroCtaLabel: page.heroCtaLabel,
      heroCtaUrl: page.heroCtaUrl,
      heroSecondaryCtaLabel: page.heroSecondaryCtaLabel,
      heroSecondaryCtaUrl: page.heroSecondaryCtaUrl,
      heroImageUrl: page.heroImageUrl,
      heroVideoUrl: page.heroVideoUrl,
      heroGradientFrom: page.heroGradientFrom,
      heroGradientTo: page.heroGradientTo,
      contactEmail: page.contactEmail,
      contactPhone: page.contactPhone,
      contactAddress: page.contactAddress,
      publishedAt: page.publishedAt?.toISOString() ?? null,
      updatedAt: page.updatedAt.toISOString(),
      sections,
      faq: page.faqItems
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((f) => ({
          id: f.id,
          question: f.question,
          answerHtml: f.answerHtml,
          sortOrder: f.sortOrder,
        })),
      supportedLocales: [...SUPPORTED_LOCALES],
    };
  }

  async ensureDefaultPage() {
    const existing = await this.prisma.portalPresentationPage.findFirst({
      where: { locale: 'cs', slug: 'o-portalu' },
    });
    if (existing) return;

    const page = await this.prisma.portalPresentationPage.create({
      data: {
        ...DEFAULT_PRESENTATION_PAGE,
        publishedAt: new Date(),
        sections: {
          create: DEFAULT_PRESENTATION_SECTIONS.map((s) => ({
            anchor: s.anchor,
            sectionType: s.sectionType,
            sortOrder: s.sortOrder,
            icon: s.icon,
            title: s.title,
            subtitle: s.subtitle,
            bodyHtml: s.bodyHtml,
            ctaLabel: s.ctaLabel,
            ctaUrl: s.ctaUrl,
            bgStyle: s.bgStyle ?? 'white',
            accentColor: s.accentColor,
          })),
        },
        faqItems: {
          create: DEFAULT_PRESENTATION_FAQ.map((f) => ({
            question: f.question,
            answerHtml: f.answerHtml,
            sortOrder: f.sortOrder,
          })),
        },
      },
      include: {
        sections: true,
        faqItems: true,
      },
    });
    return page;
  }

  private async loadPage(where: Prisma.PortalPresentationPageWhereInput, includeHidden = false) {
    const page = await this.prisma.portalPresentationPage.findFirst({
      where,
      include: {
        sections: { orderBy: { sortOrder: 'asc' } },
        faqItems: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!page) return null;
    return this.serializePage(page, includeHidden);
  }

  async getPublic(locale = 'cs') {
    const loc = locale.trim().toLowerCase() || 'cs';
    const page =
      (await this.loadPage({ locale: loc, slug: 'o-portalu', isPublished: true })) ??
      (loc !== 'cs'
        ? await this.loadPage({ locale: 'cs', slug: 'o-portalu', isPublished: true })
        : null);
    if (!page) throw new NotFoundException('Prezentační stránka není publikována');
    return page;
  }

  async getAdmin(locale = 'cs') {
    await this.ensureDefaultPage();
    const page = await this.loadPage({ locale: locale.trim() || 'cs', slug: 'o-portalu' }, true);
    if (!page) throw new NotFoundException('Stránka nenalezena');
    return page;
  }

  async updatePage(locale: string, dto: UpdatePresentationPageDto) {
    const page = await this.prisma.portalPresentationPage.findFirst({
      where: { locale: locale.trim() || 'cs', slug: 'o-portalu' },
    });
    if (!page) throw new NotFoundException('Stránka nenalezena');

    const data: Prisma.PortalPresentationPageUpdateInput = {};
    const fields = [
      'metaTitle',
      'metaDescription',
      'metaKeywords',
      'ogImageUrl',
      'canonicalUrl',
      'heroTitle',
      'heroSubtitle',
      'heroBadgeText',
      'faqTitle',
      'heroCtaLabel',
      'heroCtaUrl',
      'heroSecondaryCtaLabel',
      'heroSecondaryCtaUrl',
      'heroImageUrl',
      'heroVideoUrl',
      'heroGradientFrom',
      'heroGradientTo',
      'contactEmail',
      'contactPhone',
      'contactAddress',
    ] as const;

    for (const key of fields) {
      if (dto[key] !== undefined) {
        (data as Record<string, unknown>)[key] = dto[key];
      }
    }

    if (dto.isPublished !== undefined) {
      data.isPublished = dto.isPublished;
      data.publishedAt = dto.isPublished ? new Date() : null;
    }

    await this.prisma.portalPresentationPage.update({ where: { id: page.id }, data });
    return this.getAdmin(locale);
  }

  async upsertSection(locale: string, dto: UpsertPresentationSectionDto) {
    const page = await this.prisma.portalPresentationPage.findFirst({
      where: { locale: locale.trim() || 'cs', slug: 'o-portalu' },
    });
    if (!page) throw new NotFoundException('Stránka nenalezena');

    const anchor = dto.anchor.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (!anchor) throw new BadRequestException('Neplatný anchor');

    const data = {
      anchor,
      sectionType: dto.sectionType?.trim() || 'feature',
      sortOrder: dto.sortOrder ?? 0,
      isVisible: dto.isVisible ?? true,
      icon: dto.icon?.trim() || null,
      title: dto.title.trim(),
      subtitle: dto.subtitle?.trim() || null,
      bodyHtml: dto.bodyHtml,
      imageUrl: dto.imageUrl?.trim() || null,
      galleryUrls: dto.galleryUrls ?? [],
      videoUrl: dto.videoUrl?.trim() || null,
      youtubeUrl: dto.youtubeUrl?.trim() || null,
      ctaLabel: dto.ctaLabel?.trim() || null,
      ctaUrl: dto.ctaUrl?.trim() || null,
      accentColor: dto.accentColor?.trim() || null,
      bgStyle: dto.bgStyle?.trim() || 'white',
    };

    if (dto.id) {
      const row = await this.prisma.portalPresentationSection.update({
        where: { id: dto.id },
        data,
      });
      return this.serializeSection(row);
    }

    const row = await this.prisma.portalPresentationSection.upsert({
      where: { pageId_anchor: { pageId: page.id, anchor } },
      create: { pageId: page.id, ...data },
      update: data,
    });
    return this.serializeSection(row);
  }

  async deleteSection(id: string) {
    await this.prisma.portalPresentationSection.delete({ where: { id } });
    return { ok: true };
  }

  async reorderSections(locale: string, dto: ReorderSectionsDto) {
    const page = await this.prisma.portalPresentationPage.findFirst({
      where: { locale: locale.trim() || 'cs', slug: 'o-portalu' },
      include: { sections: true },
    });
    if (!page) throw new NotFoundException('Stránka nenalezena');

    const idSet = new Set(page.sections.map((s) => s.id));
    for (const id of dto.orderedIds) {
      if (!idSet.has(id)) throw new BadRequestException('Neplatné ID sekce');
    }

    await this.prisma.$transaction(
      dto.orderedIds.map((id, index) =>
        this.prisma.portalPresentationSection.update({
          where: { id },
          data: { sortOrder: (index + 1) * 10 },
        }),
      ),
    );
    return this.getAdmin(locale);
  }

  async upsertFaq(locale: string, dto: UpsertFaqDto) {
    const page = await this.prisma.portalPresentationPage.findFirst({
      where: { locale: locale.trim() || 'cs', slug: 'o-portalu' },
    });
    if (!page) throw new NotFoundException('Stránka nenalezena');

    if (dto.id) {
      return this.prisma.portalPresentationFaq.update({
        where: { id: dto.id },
        data: {
          question: dto.question.trim(),
          answerHtml: dto.answerHtml,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
    }

    return this.prisma.portalPresentationFaq.create({
      data: {
        pageId: page.id,
        question: dto.question.trim(),
        answerHtml: dto.answerHtml,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async deleteFaq(id: string) {
    await this.prisma.portalPresentationFaq.delete({ where: { id } });
    return { ok: true };
  }

  async trackAnalytics(locale: string, dto: TrackAnalyticsDto, userAgent?: string | null) {
    const page = await this.prisma.portalPresentationPage.findFirst({
      where: { locale: locale.trim() || 'cs', slug: 'o-portalu', isPublished: true },
    });
    if (!page) return { ok: false };

    await this.prisma.portalPresentationAnalytics.create({
      data: {
        pageId: page.id,
        eventType: dto.eventType.trim().slice(0, 64),
        visitorId: dto.visitorId?.trim().slice(0, 64) || null,
        sessionId: dto.sessionId?.trim().slice(0, 64) || null,
        payload: dto.payload ? (dto.payload as Prisma.InputJsonValue) : undefined,
        referrer: dto.referrer?.trim().slice(0, 512) || null,
        userAgent: userAgent?.trim().slice(0, 512) || null,
      },
    });
    return { ok: true };
  }

  async getAnalyticsSummary(locale: string, days = 30) {
    const page = await this.prisma.portalPresentationPage.findFirst({
      where: { locale: locale.trim() || 'cs', slug: 'o-portalu' },
    });
    if (!page) throw new NotFoundException('Stránka nenalezena');

    const since = new Date();
    since.setDate(since.getDate() - Math.min(Math.max(days, 1), 365));

    const rows = await this.prisma.portalPresentationAnalytics.findMany({
      where: { pageId: page.id, createdAt: { gte: since } },
      select: {
        eventType: true,
        visitorId: true,
        sessionId: true,
        referrer: true,
        payload: true,
        createdAt: true,
      },
    });

    const pageViews = rows.filter((r) => r.eventType === 'page_view').length;
    const uniqueVisitors = new Set(
      rows.map((r) => r.visitorId).filter((v): v is string => Boolean(v)),
    ).size;
    const ctaClicks = rows.filter((r) => r.eventType === 'cta_click').length;
    const scrollEvents = rows.filter((r) => r.eventType === 'scroll_depth');

    const scrollDepthBuckets: Record<string, number> = {};
    for (const ev of scrollEvents) {
      const depth =
        ev.payload && typeof ev.payload === 'object' && 'depth' in ev.payload
          ? String((ev.payload as { depth?: unknown }).depth)
          : 'unknown';
      scrollDepthBuckets[depth] = (scrollDepthBuckets[depth] ?? 0) + 1;
    }

    const referrers: Record<string, number> = {};
    for (const r of rows) {
      if (!r.referrer) continue;
      referrers[r.referrer] = (referrers[r.referrer] ?? 0) + 1;
    }

    return {
      days,
      pageViews,
      uniqueVisitors,
      ctaClicks,
      scrollDepthBuckets,
      topReferrers: Object.entries(referrers)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([referrer, count]) => ({ referrer, count })),
      totalEvents: rows.length,
    };
  }

  async searchPublic(q: string, locale = 'cs') {
    const term = q.trim().toLowerCase();
    if (term.length < 2) return { items: [] };

    const page = await this.getPublic(locale).catch(() => null);
    if (!page) return { items: [] };

    const items: Array<{ type: string; title: string; anchor: string; excerpt: string }> = [];

    const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    if (
      page.heroTitle.toLowerCase().includes(term) ||
      page.heroSubtitle.toLowerCase().includes(term)
    ) {
      items.push({
        type: 'hero',
        title: page.heroTitle,
        anchor: 'uvod',
        excerpt: page.heroSubtitle.slice(0, 160),
      });
    }

    for (const s of page.sections) {
      const hay = `${s.title} ${s.subtitle ?? ''} ${strip(s.bodyHtml)}`.toLowerCase();
      if (hay.includes(term)) {
        items.push({
          type: 'section',
          title: s.title,
          anchor: s.anchor,
          excerpt: strip(s.bodyHtml).slice(0, 160),
        });
      }
    }

    for (const f of page.faq) {
      const hay = `${f.question} ${strip(f.answerHtml)}`.toLowerCase();
      if (hay.includes(term)) {
        items.push({
          type: 'faq',
          title: f.question,
          anchor: 'faq',
          excerpt: strip(f.answerHtml).slice(0, 160),
        });
      }
    }

    return { items: items.slice(0, 20) };
  }

  async buildRss(locale = 'cs') {
    const page = await this.getPublic(locale);
    const base = page.canonicalUrl?.replace(/\/o-portalu.*$/, '') || 'https://xxrealit.cz';
    const items = page.sections.map((s) => ({
      title: s.title,
      link: `${base}/o-portalu#${s.anchor}`,
      description: s.subtitle ?? s.title,
      pubDate: page.updatedAt,
    }));
    return { page, base, items };
  }
}
