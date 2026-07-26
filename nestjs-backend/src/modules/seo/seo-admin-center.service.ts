import { Injectable } from '@nestjs/common';
import { Prisma, SeoContentStatus, SeoLocationKind } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  PROGRAMMATIC_SEO_INTENT_SLUGS,
  PROGRAMMATIC_SEO_INTENTS,
} from './programmatic-seo-intents';
import {
  buildProgrammaticSeoCopy,
  buildProgrammaticSeoPath,
} from './programmatic-seo.util';
import { buildProgrammaticSeoPageKey } from './seo-location.util';
import type { CzGeoLocation } from './cz-geo-locations.data';

export type SeoPagesListQuery = {
  q?: string;
  regionId?: string;
  districtId?: string;
  locationId?: string;
  intentSlug?: string;
  propertyType?: string;
  transaction?: string;
  indexed?: 'yes' | 'no';
  missingTitle?: boolean;
  missingDescription?: boolean;
  lowScore?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: 'url' | 'title' | 'score' | 'listings' | 'updated';
  sortDir?: 'asc' | 'desc';
};

const LOCATION_KINDS: SeoLocationKind[] = ['MESTO', 'MESTYS', 'OBEC', 'MESTSKA_CAST'];

@Injectable()
export class SeoAdminCenterService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard() {
    const intents = PROGRAMMATIC_SEO_INTENT_SLUGS.length;
    const [locationCount, contentRows, redirects, analytics] = await Promise.all([
      this.prisma.seoLocation.count({
        where: { isActive: true, kind: { in: LOCATION_KINDS } },
      }),
      this.prisma.seoPageContent.findMany({
        select: {
          id: true,
          status: true,
          title: true,
          description: true,
          h1: true,
          faq: true,
          ogTitle: true,
          schemaJson: true,
          canonical: true,
          noindex: true,
          googleIndexed: true,
          qualityScore: true,
          pageKey: true,
        },
      }),
      this.prisma.seoRedirect.count(),
      this.prisma.seoPageAnalytics.findMany({
        orderBy: { measuredAt: 'desc' },
        take: 500,
      }),
    ]);

    const totalPages = locationCount * intents;
    const draft = contentRows.filter((r) => r.status === SeoContentStatus.DRAFT);
    const published = contentRows.filter(
      (r) => r.status === SeoContentStatus.PUBLISHED || r.status === SeoContentStatus.LOCKED,
    );
    const indexable = contentRows.filter((r) => !r.noindex && published.some((p) => p.id === r.id));
    const googleIndexed = contentRows.filter((r) => r.googleIndexed && !r.noindex);
    const noindex = contentRows.filter((r) => r.noindex);
    const withoutTitle = contentRows.filter((r) => !r.title?.trim());
    const withoutH1 = contentRows.filter((r) => !r.h1?.trim());
    const withoutFaq = contentRows.filter((r) => !Array.isArray(r.faq) || r.faq.length === 0);
    const withoutOg = contentRows.filter((r) => !r.ogTitle?.trim());
    const withoutSchema = contentRows.filter((r) => !r.schemaJson);
    const withoutCanonical = contentRows.filter((r) => !r.canonical?.trim());
    const lowScore = contentRows.filter((r) => r.qualityScore < 50);

    const titleDupes = this.countDuplicates(contentRows.map((r) => r.title).filter(Boolean) as string[]);
    const h1Dupes = this.countDuplicates(
      contentRows.map((r) => r.h1).filter(Boolean) as string[],
    );
    const descDupes = this.countDuplicates(
      contentRows.map((r) => r.description).filter(Boolean) as string[],
    );
    const urlDupes = this.countDuplicates(contentRows.map((r) => r.pageKey));

    const totalClicks = analytics.reduce((s, a) => s + a.clicks, 0);
    const totalImpressions = analytics.reduce((s, a) => s + a.impressions, 0);
    const ctr = totalImpressions ? (totalClicks / totalImpressions) * 100 : 0;
    const positions = analytics.filter((a) => a.avgPosition != null).map((a) => a.avgPosition!);
    const avgPosition = positions.length
      ? positions.reduce((s, p) => s + p, 0) / positions.length
      : null;

    const topPages = [...analytics]
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 5)
      .map((a) => ({ pageKey: a.pageKey, clicks: a.clicks, ctr: a.ctr, position: a.avgPosition }));
    const worstPages = [...analytics]
      .sort((a, b) => (a.avgPosition ?? 99) - (b.avgPosition ?? 99))
      .reverse()
      .slice(0, 5)
      .map((a) => ({ pageKey: a.pageKey, clicks: a.clicks, ctr: a.ctr, position: a.avgPosition }));

    const recentContent = await this.prisma.seoPageContent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, pageKey: true, title: true, createdAt: true, status: true },
    });

    return {
      totalPages,
      possibleCombinations: totalPages,
      withContent: contentRows.length,
      createdRecords: contentRows.length,
      draft: draft.length,
      published: published.length,
      indexable: indexable.length,
      indexed: googleIndexed.length,
      notIndexed: null,
      searchConsoleConnected: totalImpressions > 0 || totalClicks > 0,
      searchConsoleNote:
        totalImpressions > 0 || totalClicks > 0
          ? null
          : 'Data Search Console nejsou připojena.',
      withoutMeta: withoutTitle.length + withoutH1.length,
      withoutTitle: withoutTitle.length,
      withoutDescription: contentRows.filter((r) => !r.description?.trim()).length,
      withoutH1: withoutH1.length,
      withoutFaq: withoutFaq.length,
      withoutOg: withoutOg.length,
      withoutSchema: withoutSchema.length,
      withoutCanonical: withoutCanonical.length,
      noindex: noindex.length,
      redirects301: redirects,
      errors404: 0,
      errors500: 0,
      duplicateUrls: urlDupes,
      duplicateH1: h1Dupes,
      duplicateDescription: descDupes,
      duplicateTitles: titleDupes,
      lowScore: lowScore.length,
      clicks: totalClicks,
      impressions: totalImpressions,
      ctr: Math.round(ctr * 100) / 100,
      avgPosition: avgPosition ? Math.round(avgPosition * 10) / 10 : null,
      topPages,
      worstPages,
      newPages: recentContent,
    };
  }

  async listPages(query: SeoPagesListQuery) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(10, query.pageSize ?? 25));
    const intents = query.intentSlug
      ? [query.intentSlug].filter((s) => PROGRAMMATIC_SEO_INTENT_SLUGS.includes(s as never))
      : PROGRAMMATIC_SEO_INTENT_SLUGS;

    const locationWhere: Prisma.SeoLocationWhereInput = {
      isActive: true,
      kind: { in: LOCATION_KINDS },
      ...(query.regionId ? { regionId: query.regionId } : {}),
      ...(query.districtId ? { districtId: query.districtId } : {}),
      ...(query.locationId ? { id: query.locationId } : {}),
      ...(query.q?.trim()
        ? { name: { contains: query.q.trim(), mode: 'insensitive' } }
        : {}),
    };

    const locationCount = await this.prisma.seoLocation.count({ where: locationWhere });
    const totalRows = locationCount * intents.length;
    const flatSkip = (page - 1) * pageSize;

    const locationIndex = Math.floor(flatSkip / intents.length);
    const intentOffset = flatSkip % intents.length;
    const locationsNeeded = Math.ceil((pageSize + intentOffset) / intents.length);

    const locations = await this.prisma.seoLocation.findMany({
      where: locationWhere,
      orderBy: [{ population: 'desc' }, { name: 'asc' }],
      skip: locationIndex,
      take: locationsNeeded,
      include: {
        region: { select: { name: true } },
        district: { select: { name: true } },
      },
    });

    const pageKeys: string[] = [];
    for (const loc of locations) {
      for (const intentSlug of intents) {
        pageKeys.push(buildProgrammaticSeoPageKey(intentSlug, loc.slug));
      }
    }

    const [contents, analyticsRows] = await Promise.all([
      this.prisma.seoPageContent.findMany({
        where: { pageKey: { in: pageKeys } },
      }),
      this.prisma.seoPageAnalytics.findMany({
        where: { pageKey: { in: pageKeys } },
        orderBy: { measuredAt: 'desc' },
      }),
    ]);

    const contentByKey = new Map(contents.map((c) => [c.pageKey, c]));
    const analyticsByKey = new Map<string, (typeof analyticsRows)[0]>();
    for (const a of analyticsRows) {
      if (!analyticsByKey.has(a.pageKey)) analyticsByKey.set(a.pageKey, a);
    }

    const rows: Array<Record<string, unknown>> = [];
    let skipped = 0;
    for (const loc of locations) {
      for (let i = 0; i < intents.length; i += 1) {
        const intentSlug = intents[i]!;
        if (skipped < intentOffset) {
          skipped += 1;
          continue;
        }
        if (rows.length >= pageSize) break;

        const intent = PROGRAMMATIC_SEO_INTENTS[intentSlug as keyof typeof PROGRAMMATIC_SEO_INTENTS];
        if (query.transaction && intent.offerType !== query.transaction) continue;
        if (query.propertyType && intent.propertyTypeKey !== query.propertyType) continue;

        const pageKey = buildProgrammaticSeoPageKey(intentSlug, loc.slug);
        const content = contentByKey.get(pageKey);
        const analytics = analyticsByKey.get(pageKey);

        if (query.indexed === 'yes' && !content?.googleIndexed) continue;
        if (query.indexed === 'no' && content?.googleIndexed) continue;
        if (query.missingTitle && content?.title?.trim()) continue;
        if (query.missingDescription && content?.description?.trim()) continue;
        if (query.lowScore && (content?.qualityScore ?? 0) >= 50) continue;

        const locCopy = {
          slug: loc.slug,
          name: loc.name,
          locative: loc.locative || loc.name,
          kind: 'mesto' as const,
          searchTerms: loc.searchTerms,
        } satisfies Pick<CzGeoLocation, 'slug' | 'name' | 'locative' | 'kind' | 'searchTerms'>;

        const fallback = buildProgrammaticSeoCopy(intent, locCopy as CzGeoLocation);
        const url = buildProgrammaticSeoPath(intentSlug, loc.slug);
        const listingCount = await this.countListings(loc.id, intent.offerType, intent.propertyTypeKey);

        rows.push({
          id: content?.id ?? `virtual:${pageKey}`,
          pageKey,
          url,
          name: content?.h1 ?? fallback.h1,
          locationName: loc.name,
          locationSlug: loc.slug,
          regionName: loc.region?.name ?? null,
          districtName: loc.district?.name ?? null,
          intentSlug,
          intentLabel: intent.label,
          propertyType: intent.propertyTypeKey ?? null,
          transaction: intent.offerType ?? null,
          h1: content?.h1 ?? fallback.h1,
          metaTitle: content?.title ?? fallback.title,
          metaDescription: content?.description ?? fallback.description,
          canonical: content?.canonical ?? `https://www.xxrealit.cz${url}`,
          robots: content?.robots ?? 'index,follow',
          status: content?.status ?? 'MISSING',
          listingCount,
          seoScore: content?.qualityScore ?? 0,
          googleIndex: content?.googleIndexed ?? false,
          clicks: analytics?.clicks ?? 0,
          ctr: analytics?.ctr ?? null,
          position: analytics?.avgPosition ?? null,
          updatedAt: content?.updatedAt?.toISOString() ?? null,
          publishedAt: content?.publishedAt?.toISOString() ?? null,
        });
      }
      if (rows.length >= pageSize) break;
    }

    return { items: rows, total: totalRows, page, pageSize };
  }

  async listLocations(opts?: {
    kind?: SeoLocationKind;
    q?: string;
    regionId?: string;
    dataSource?: string;
    active?: 'yes' | 'no';
    missingGps?: boolean;
    missingSlug?: boolean;
    withoutSeoPage?: boolean;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, opts?.page ?? 1);
    const pageSize = Math.min(200, Math.max(10, opts?.pageSize ?? 50));
    const where: Prisma.SeoLocationWhereInput = {
      ...(opts?.active === 'no' ? { isActive: false } : opts?.active === 'yes' ? { isActive: true } : {}),
      ...(opts?.kind ? { kind: opts.kind } : {}),
      ...(opts?.regionId ? { regionId: opts.regionId } : {}),
      ...(opts?.dataSource ? { dataSource: opts.dataSource as never } : {}),
      ...(opts?.missingGps ? { OR: [{ latitude: null }, { longitude: null }] } : {}),
      ...(opts?.missingSlug ? { slug: '' } : {}),
      ...(opts?.q?.trim() ? { name: { contains: opts.q.trim(), mode: 'insensitive' } } : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.seoLocation.count({ where }),
      this.prisma.seoLocation.findMany({
        where,
        orderBy: [{ kind: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          region: { select: { name: true } },
          district: { select: { name: true } },
          parent: { select: { name: true } },
          _count: { select: { properties: true, pageContents: true } },
        },
      }),
    ]);

    const intents = PROGRAMMATIC_SEO_INTENT_SLUGS.length;
    let mapped = items.map((loc) => ({
      id: loc.id,
      name: loc.name,
      officialCode: loc.officialCode,
      slug: loc.slug,
      kind: loc.kind,
      regionName: loc.region?.name ?? null,
      districtName: loc.district?.name ?? null,
      parentName: loc.parent?.name ?? null,
      population: loc.population,
      listingCount: loc._count.properties,
      seoUrlCount: loc._count.pageContents || intents,
      seoEnabled: loc.seoEnabled,
      status: loc.isActive ? 'active' : 'inactive',
      dataSource: loc.dataSource,
      indexed: loc._count.pageContents > 0,
      hasGps: loc.latitude != null && loc.longitude != null,
      updatedAt: loc.updatedAt.toISOString(),
    }));

    if (opts?.withoutSeoPage) {
      mapped = mapped.filter((l) => l.seoUrlCount === 0);
    }

    return {
      total: opts?.withoutSeoPage ? mapped.length : total,
      page,
      pageSize,
      items: mapped,
    };
  }

  async listRedirects() {
    return this.prisma.seoRedirect.findMany({
      orderBy: { createdAt: 'desc' },
      include: { location: { select: { name: true, slug: true } } },
    });
  }

  async createRedirect(fromPath: string, toPath: string, reason?: string) {
    return this.prisma.seoRedirect.create({
      data: { fromPath, toPath, reason, statusCode: 301 },
    });
  }

  async deleteRedirect(id: string) {
    return this.prisma.seoRedirect.delete({ where: { id } });
  }

  async getSearchConsoleStats() {
    const rows = await this.prisma.seoPageAnalytics.findMany({
      orderBy: { measuredAt: 'desc' },
      take: 200,
    });
    const totalClicks = rows.reduce((s, r) => s + r.clicks, 0);
    const totalImpressions = rows.reduce((s, r) => s + r.impressions, 0);
    const notIndexed = await this.prisma.seoPageContent.count({
      where: { OR: [{ noindex: true }, { googleIndexed: false }] },
    });

    return {
      clicks: totalClicks,
      impressions: totalImpressions,
      ctr: totalImpressions ? (totalClicks / totalImpressions) * 100 : 0,
      position:
        rows.filter((r) => r.avgPosition != null).reduce((s, r) => s + r.avgPosition!, 0) /
          (rows.filter((r) => r.avgPosition != null).length || 1),
      notIndexedPages: notIndexed,
      reasons: [
        { reason: 'noindex', count: await this.prisma.seoPageContent.count({ where: { noindex: true } }) },
        {
          reason: 'bez obsahu',
          count: await this.prisma.seoPageContent.count({ where: { status: SeoContentStatus.DRAFT } }),
        },
        {
          reason: 'čeká na indexaci',
          count: await this.prisma.seoPageContent.count({
            where: { status: SeoContentStatus.PUBLISHED, googleIndexed: false },
          }),
        },
      ],
      topQueries: rows.slice(0, 20).map((r) => ({
        pageKey: r.pageKey,
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.avgPosition,
      })),
      note: 'Data z interní analytiky SeoPageAnalytics. Pro live GSC připojte Google Search Console API v nastavení.',
    };
  }

  async runAudit() {
    const pages = await this.prisma.seoPageContent.findMany({ take: 500 });
    const issues: Array<{ type: string; pageKey: string; message: string; severity: string }> = [];

    for (const p of pages) {
      if (!p.title?.trim()) issues.push({ type: 'meta', pageKey: p.pageKey, message: 'Chybí title', severity: 'high' });
      if (!p.description?.trim())
        issues.push({ type: 'meta', pageKey: p.pageKey, message: 'Chybí description', severity: 'high' });
      if (!p.h1?.trim()) issues.push({ type: 'h1', pageKey: p.pageKey, message: 'Chybí H1', severity: 'high' });
      if (!p.canonical?.trim())
        issues.push({ type: 'canonical', pageKey: p.pageKey, message: 'Chybí canonical', severity: 'medium' });
      if (!p.ogTitle?.trim())
        issues.push({ type: 'og', pageKey: p.pageKey, message: 'Chybí OG title', severity: 'low' });
      if (!p.schemaJson)
        issues.push({ type: 'schema', pageKey: p.pageKey, message: 'Chybí schema', severity: 'medium' });
      if (p.noindex && p.status === SeoContentStatus.PUBLISHED)
        issues.push({ type: 'robots', pageKey: p.pageKey, message: 'Publikováno s noindex', severity: 'high' });
    }

    const redirects = await this.prisma.seoRedirect.count();
    const titleDupes = this.countDuplicates(pages.map((p) => p.title).filter(Boolean) as string[]);

    return {
      ranAt: new Date().toISOString(),
      pagesChecked: pages.length,
      issueCount: issues.length,
      issues: issues.slice(0, 100),
      summary: {
        missingMeta: issues.filter((i) => i.type === 'meta').length,
        missingH1: issues.filter((i) => i.type === 'h1').length,
        missingOg: issues.filter((i) => i.type === 'og').length,
        missingSchema: issues.filter((i) => i.type === 'schema').length,
        canonicalIssues: issues.filter((i) => i.type === 'canonical').length,
        robotsIssues: issues.filter((i) => i.type === 'robots').length,
        redirects,
        duplicateTitles: titleDupes,
        errors404: 0,
        errors500: 0,
        coreWebVitals: { lcp: null, fid: null, cls: null, note: 'Vyžaduje PageSpeed API' },
      },
    };
  }

  async listChangeHistory(limit = 50) {
    return this.prisma.seoPageContentVersion.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        content: {
          select: { pageKey: true, title: true, intentSlug: true },
        },
      },
    });
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

  private countDuplicates(values: string[]): number {
    const seen = new Map<string, number>();
    for (const v of values) {
      const k = v.toLowerCase().trim();
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    return [...seen.values()].filter((c) => c > 1).length;
  }
}
