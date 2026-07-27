import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SeoContentStatus, SeoPageContent } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { getProgrammaticSeoIntent } from './programmatic-seo-intents';
import { buildProgrammaticSeoPath } from './programmatic-seo.util';
import {
  computeIndexability,
  normalizeCanonicalUrl,
} from './seo-indexability.util';

export type IndexabilityRecalculateScope =
  | 'ALL_PUBLISHED'
  | 'PUBLISHED_NOINDEX'
  | 'WITH_LISTINGS'
  | 'REGION'
  | 'LOCATION'
  | 'CHANGED_SINCE';

export type IndexabilityRecalculateInput = {
  scope: IndexabilityRecalculateScope;
  regionId?: string;
  locationId?: string;
  changedSince?: string;
  checkHttp?: boolean;
};

export type IndexabilityRecalculateResult = {
  processed: number;
  changedToIndexable: number;
  keptNoindex: number;
  errors: number;
  byReason: Record<string, number>;
  samples: Array<{ pageKey: string; indexable: boolean; reason: string; score: number }>;
};

const SITE_ORIGIN = 'https://www.xxrealit.cz';

@Injectable()
export class SeoIndexabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings() {
    return this.prisma.seoSettings.upsert({
      where: { id: 'default' },
      create: {},
      update: {},
    });
  }

  async recalculate(input: IndexabilityRecalculateInput): Promise<IndexabilityRecalculateResult> {
    const settings = await this.getSettings();
    const where = this.buildScopeWhere(input);
    const pages = await this.prisma.seoPageContent.findMany({
      where,
      include: { location: { select: { id: true, slug: true, isActive: true, officialCode: true, latitude: true, longitude: true, population: true, dataSource: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 5000,
    });

    const duplicateMaps = await this.buildDuplicateMaps(pages.map((p) => p.id));
    const result: IndexabilityRecalculateResult = {
      processed: 0,
      changedToIndexable: 0,
      keptNoindex: 0,
      errors: 0,
      byReason: {},
      samples: [],
    };

    for (const page of pages) {
      try {
        if (input.scope === 'WITH_LISTINGS') {
          const intent = page.intentSlug ? getProgrammaticSeoIntent(page.intentSlug) : null;
          const listingCount =
            page.location && intent
              ? await this.countListings(page.location.id, intent.offerType, intent.propertyTypeKey)
              : 0;
          if (listingCount === 0) continue;
        }

        const before = page.indexable;
        const updated = await this.evaluateAndPersist(page, {
          minScore: settings.programmaticIndexabilityMinScore,
          reviewScore: settings.programmaticIndexabilityReviewScore,
          duplicateMaps,
          checkHttp: input.checkHttp ?? settings.programmaticIndexationCheck,
        });
        result.processed += 1;
        const reason = updated.indexabilityReason ?? 'UNKNOWN';
        result.byReason[reason] = (result.byReason[reason] ?? 0) + 1;
        if (updated.indexable && !before) result.changedToIndexable += 1;
        if (!updated.indexable) result.keptNoindex += 1;
        if (result.samples.length < 20) {
          result.samples.push({
            pageKey: updated.pageKey,
            indexable: updated.indexable,
            reason,
            score: updated.indexabilityScore,
          });
        }
      } catch {
        result.errors += 1;
      }
    }

    await this.syncSitemapFlags();
    return result;
  }

  async evaluatePageById(id: string, checkHttp = false) {
    const page = await this.prisma.seoPageContent.findUnique({
      where: { id },
      include: { location: { select: { id: true, slug: true, isActive: true, officialCode: true, latitude: true, longitude: true, population: true, dataSource: true } } },
    });
    if (!page) throw new NotFoundException('SEO stránka nenalezena.');
    const settings = await this.getSettings();
    const duplicateMaps = await this.buildDuplicateMaps([page.id]);
    return this.evaluateAndPersist(page, {
      minScore: settings.programmaticIndexabilityMinScore,
      reviewScore: settings.programmaticIndexabilityReviewScore,
      duplicateMaps,
      checkHttp: checkHttp || settings.programmaticIndexationCheck,
    });
  }

  async setManualIndexable(id: string, indexable: boolean, editorId?: string) {
    const page = await this.prisma.seoPageContent.findUnique({ where: { id } });
    if (!page) throw new NotFoundException('SEO stránka nenalezena.');

    if (indexable) {
      return this.evaluatePageById(id, true);
    }

    return this.prisma.seoPageContent.update({
      where: { id },
      data: {
        indexable: false,
        noindex: true,
        robots: 'noindex,follow',
        indexabilityReason: 'MANUAL_NOINDEX',
        inSitemap: false,
        lastIndexabilityCheckAt: new Date(),
        indexabilityChecksJson: {
          manualOverride: true,
          editorId: editorId ?? null,
        } as Prisma.InputJsonValue,
      },
    });
  }

  async getSitemapStats() {
    const [indexableCount, excludedCount, lastPage] = await Promise.all([
      this.prisma.seoPageContent.count({
        where: { indexable: true, inSitemap: true, status: SeoContentStatus.PUBLISHED },
      }),
      this.prisma.seoPageContent.count({
        where: {
          status: SeoContentStatus.PUBLISHED,
          OR: [{ indexable: false }, { noindex: true }, { inSitemap: false }],
        },
      }),
      this.prisma.seoPageContent.findFirst({
        where: { inSitemap: true },
        orderBy: { lastIndexabilityCheckAt: 'desc' },
        select: { lastIndexabilityCheckAt: true },
      }),
    ]);

    return {
      indexableInSitemap: indexableCount,
      excludedFromSitemap: excludedCount,
      lastGeneratedAt: lastPage?.lastIndexabilityCheckAt?.toISOString() ?? null,
      sitemapUrls: [
        `${SITE_ORIGIN}/sitemap.xml`,
        `${SITE_ORIGIN}/sitemaps/seo-pages-1.xml`,
        `${SITE_ORIGIN}/sitemaps/listings.xml`,
        `${SITE_ORIGIN}/sitemaps/localities.xml`,
        `${SITE_ORIGIN}/sitemaps/static.xml`,
      ],
    };
  }

  private buildScopeWhere(input: IndexabilityRecalculateInput): Prisma.SeoPageContentWhereInput {
    const base: Prisma.SeoPageContentWhereInput = {};
    switch (input.scope) {
      case 'ALL_PUBLISHED':
        return { status: SeoContentStatus.PUBLISHED };
      case 'PUBLISHED_NOINDEX':
        return { status: SeoContentStatus.PUBLISHED, OR: [{ noindex: true }, { indexable: false }] };
      case 'WITH_LISTINGS':
        return { status: SeoContentStatus.PUBLISHED };
      case 'REGION':
        return {
          status: SeoContentStatus.PUBLISHED,
          location: input.regionId ? { regionId: input.regionId } : undefined,
        };
      case 'LOCATION':
        return {
          status: SeoContentStatus.PUBLISHED,
          ...(input.locationId ? { locationId: input.locationId } : {}),
        };
      case 'CHANGED_SINCE':
        return {
          status: SeoContentStatus.PUBLISHED,
          ...(input.changedSince ? { updatedAt: { gte: new Date(input.changedSince) } } : {}),
        };
      default:
        return base;
    }
  }

  private async evaluateAndPersist(
    page: SeoPageContent & {
      location: {
        id: string;
        slug: string;
        isActive: boolean;
        officialCode: string;
        latitude: number | null;
        longitude: number | null;
        population: number | null;
        dataSource: string | null;
      } | null;
    },
    opts: {
      minScore: number;
      reviewScore: number;
      duplicateMaps: DuplicateMaps;
      checkHttp: boolean;
    },
  ) {
    const intent = page.intentSlug ? getProgrammaticSeoIntent(page.intentSlug) : null;
    const locationSlug = page.location?.slug ?? '';
    const publicPath = page.intentSlug && locationSlug
      ? buildProgrammaticSeoPath(page.intentSlug, locationSlug)
      : `/${page.pageKey.replace(':', '/')}`;

    const listingCount =
      page.location && intent
        ? await this.countListings(page.location.id, intent.offerType, intent.propertyTypeKey)
        : 0;

    const canonical = page.canonical?.trim() || normalizeCanonicalUrl(publicPath);
    const normTitle = this.normalize(page.title);
    const normDesc = this.normalize(page.description);
    const normH1 = this.normalize(page.h1);

    let httpStatus: number | null = null;
    if (opts.checkHttp && page.status === SeoContentStatus.PUBLISHED) {
      httpStatus = await this.probePublicUrl(publicPath);
    }

    const manualNoindex = page.indexabilityReason === 'MANUAL_NOINDEX';
    const evaluation = computeIndexability({
      title: page.title,
      description: page.description,
      h1: page.h1,
      bodyText: page.bodyText,
      faq: page.faq,
      internalLinks: page.internalLinks,
      relatedLocations: page.relatedLocations,
      canonical,
      publicPath,
      status: page.status,
      manualNoindex,
      locationActive: page.location?.isActive !== false,
      hasLocalityData: Boolean(
        page.location?.officialCode &&
          (page.location.latitude != null ||
            page.location.population != null ||
            page.location.dataSource != null),
      ),
      listingCount,
      httpStatus,
      duplicateTitle: normTitle ? (opts.duplicateMaps.titles.get(normTitle) ?? 0) > 1 : false,
      duplicateDescription: normDesc ? (opts.duplicateMaps.descriptions.get(normDesc) ?? 0) > 1 : false,
      duplicateContent: normH1 ? (opts.duplicateMaps.h1.get(normH1) ?? 0) > 1 : false,
      minScore: opts.minScore,
      reviewScore: opts.reviewScore,
    });

  const data = {
      indexable: evaluation.indexable,
      noindex: evaluation.noindex,
      robots: evaluation.robots,
      canonical: evaluation.indexable ? normalizeCanonicalUrl(publicPath) : canonical,
      indexabilityReason: evaluation.indexabilityReason,
      indexabilityScore: evaluation.indexabilityScore,
      indexabilityChecksJson: evaluation.indexabilityChecksJson as Prisma.InputJsonValue,
      lastIndexabilityCheckAt: new Date(),
      inSitemap: evaluation.inSitemap,
      lastHttpStatus: httpStatus,
    };

    return this.prisma.seoPageContent.update({
      where: { id: page.id },
      data,
    });
  }

  private async syncSitemapFlags() {
    await this.prisma.seoPageContent.updateMany({
      where: {
        status: SeoContentStatus.PUBLISHED,
        indexable: true,
        noindex: false,
      },
      data: { inSitemap: true },
    });
    await this.prisma.seoPageContent.updateMany({
      where: {
        OR: [{ indexable: false }, { noindex: true }, { status: { not: SeoContentStatus.PUBLISHED } }],
      },
      data: { inSitemap: false },
    });
  }

  private async buildDuplicateMaps(pageIds: string[]): Promise<DuplicateMaps> {
    const rows = await this.prisma.seoPageContent.findMany({
      where: { status: SeoContentStatus.PUBLISHED },
      select: { id: true, title: true, description: true, h1: true },
    });

    const titles = new Map<string, number>();
    const descriptions = new Map<string, number>();
    const h1 = new Map<string, number>();

    for (const row of rows) {
      const t = this.normalize(row.title);
      const d = this.normalize(row.description);
      const h = this.normalize(row.h1);
      if (t) titles.set(t, (titles.get(t) ?? 0) + 1);
      if (d) descriptions.set(d, (descriptions.get(d) ?? 0) + 1);
      if (h) h1.set(h, (h1.get(h) ?? 0) + 1);
    }

    return { titles, descriptions, h1, withListingsOnly: false, pageIds };
  }

  private normalize(value: string | null | undefined): string {
    return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private async countListings(
    locationId: string,
    offerType?: string,
    propertyTypeKey?: string,
  ): Promise<number> {
    const where: Prisma.PropertyWhereInput = {
      deletedAt: null,
      approved: true,
      isActive: true,
      isVisible: true,
      seoLocationId: locationId,
    };
    if (offerType) {
      const variants =
        offerType === 'pronajem'
          ? ['pronájem', 'pronajem', 'nájem', 'najem']
          : ['prodej', 'prodej'];
      where.OR = variants.map((v) => ({ offerType: { equals: v, mode: 'insensitive' } }));
    }
    if (propertyTypeKey) {
      where.AND = [
        {
          OR: [
            { propertyTypeKey: { equals: propertyTypeKey, mode: 'insensitive' } },
            { propertyType: { contains: propertyTypeKey.replace('_', ' '), mode: 'insensitive' } },
          ],
        },
      ];
    }
    return this.prisma.property.count({ where });
  }

  private async probePublicUrl(publicPath: string): Promise<number | null> {
    const url = `${SITE_ORIGIN}${publicPath.startsWith('/') ? publicPath : `/${publicPath}`}`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'XXREALIT-SeoIndexability/1.0' },
      });
      clearTimeout(timer);
      return res.status;
    } catch {
      return null;
    }
  }
}

type DuplicateMaps = {
  titles: Map<string, number>;
  descriptions: Map<string, number>;
  h1: Map<string, number>;
  withListingsOnly: boolean;
  pageIds: string[];
};
