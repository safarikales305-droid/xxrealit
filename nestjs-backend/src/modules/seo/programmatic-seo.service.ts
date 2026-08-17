import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { isPropertyPubliclyListed } from '../properties/property-public-visibility';
import { buildPropertyLocationsWhere } from '../properties/property-location-filter.util';
import {
  findCzGeoLocation,
  listCzGeoLocations,
  listCzGeoSlugsForSitemap,
  type CzGeoLocation,
} from './cz-geo-locations.data';
import {
  getProgrammaticSeoIntent,
  PROGRAMMATIC_SEO_INTENT_SLUGS,
  type ProgrammaticSeoIntent,
} from './programmatic-seo-intents';
import {
  buildProgrammaticSeoCopy,
  buildProgrammaticSeoPath,
  buildExtendedSeoMetadata,
  type ProgrammaticSeoCopy,
} from './programmatic-seo.util';
import { SeoContentService } from './seo-content.service';
import { SeoLocationService } from './seo-location.service';
import { SeoLocationDisplayService } from './seo-location-display.service';
import { SeoPortalFeedService } from './seo-portal-feed.service';
import { buildMarketStats, type SeoMarketStats } from './seo-market-stats.util';
import { buildProgrammaticSeoPageKey } from './seo-location.util';
import { getRobotsMetadata } from './seo-indexability.util';
import type { SitemapEntry } from './seo.service';

export type ProgrammaticSeoListingPreview = {
  id: string;
  slug: string | null;
  title: string;
  city: string;
  price: number | null;
  currency: string;
  mainImage: string | null;
  offerType: string;
  propertyType: string;
};

export type ProgrammaticSeoPagePayload = ProgrammaticSeoCopy & {
  intent: ProgrammaticSeoIntent;
  location: CzGeoLocation;
  totalCount: number;
  hasListings: boolean;
  listings: ProgrammaticSeoListingPreview[];
  marketStats: SeoMarketStats | null;
  latestPosts: Awaited<ReturnType<SeoPortalFeedService['getLatestForSeoPage']>>['items'];
  locationMeta?: {
    officialCode?: string;
    resolvedFrom?: string;
    districtName?: string | null;
    regionName?: string | null;
    status?: string;
  };
  relatedLocations: Array<{ slug: string; name: string; path: string }>;
  internalLinks: {
    sameIntentNearby: Array<{ slug: string; name: string; path: string }>;
    otherIntents: Array<{ intentSlug: string; label: string; path: string }>;
    regionIntent?: { slug: string; name: string; path: string };
    extra?: Array<{ label: string; path: string }>;
  };
  seo: {
    canonical: string;
    robots: string;
    noindex: boolean;
    indexable?: boolean;
    ogTitle: string;
    ogDescription: string;
    ogImage: string;
    twitterCard: string;
    schemaJson: Record<string, unknown>;
  };
};

@Injectable()
export class ProgrammaticSeoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seoLocations: SeoLocationService,
    private readonly seoContent: SeoContentService,
    private readonly locationDisplay: SeoLocationDisplayService,
    private readonly portalFeed: SeoPortalFeedService,
  ) {}

  private dbToCzGeo(row: {
    slug: string;
    name: string;
    locative: string;
    kind: string;
    regionId: string | null;
    districtId: string | null;
    searchTerms: string[];
    population: number | null;
  }): CzGeoLocation {
    const kindMap: Record<string, CzGeoLocation['kind']> = {
      KRAJ: 'kraj',
      OKRES: 'okres',
      ORP: 'orp',
      MESTO: 'mesto',
      MESTYS: 'obec',
      OBEC: 'obec',
      MESTSKA_CAST: 'mestska-cast',
      CAST_OBCE: 'cast-obce',
      KATASTR: 'lokalita',
      PSC: 'psc',
      LOKALITA: 'lokalita',
    };
    return {
      slug: row.slug,
      name: row.name,
      locative: row.locative || row.name,
      kind: kindMap[row.kind] ?? 'obec',
      regionSlug: row.regionId ?? undefined,
      districtSlug: row.districtId ?? undefined,
      searchTerms: row.searchTerms.length ? row.searchTerms : [row.name],
      population: row.population ?? undefined,
    };
  }

  async resolveLocation(slug: string): Promise<CzGeoLocation | null> {
    const resolved = await this.locationDisplay.resolveSeoLocationBySlug(slug);
    if (resolved) {
      return this.locationDisplay.toCzGeoLocation(resolved);
    }
    const db = await this.seoLocations.findBySlug(slug);
    if (db) {
      return this.dbToCzGeo(db);
    }
    return findCzGeoLocation(slug);
  }

  async resolvePage(intentSlug: string, locationSlug: string): Promise<ProgrammaticSeoPagePayload> {
    const intent = getProgrammaticSeoIntent(intentSlug);
    if (!intent) throw new NotFoundException('Neznámý typ stránky.');

    const resolved = await this.locationDisplay.resolveSeoLocationBySlug(locationSlug);
    const location = resolved
      ? this.locationDisplay.toCzGeoLocation(resolved)
      : await this.resolveLocation(locationSlug);
    if (!location) throw new NotFoundException('Lokalita nenalezena.');

    const pageKey = buildProgrammaticSeoPageKey(intentSlug, location.slug);
    const published = await this.seoContent.getPublished(pageKey);
    const generated = buildProgrammaticSeoCopy(intent, location);
    const extended = buildExtendedSeoMetadata(intent, location, generated);

    const unresolved = resolved?.status === 'LOCATION_UNRESOLVED';

    const copy: ProgrammaticSeoCopy = published?.h1
      ? {
          ...generated,
          h1: published.h1,
          title: published.title ?? generated.title,
          description: published.description ?? generated.description,
          bodyText: published.bodyText ?? generated.bodyText,
          faq: Array.isArray(published.faq)
            ? (published.faq as Array<{ question: string; answer: string }>)
            : generated.faq,
        }
      : generated;

    const seoMeta = published
      ? (() => {
          const robots = getRobotsMetadata({
            noindex: published.noindex || unresolved,
            robots: unresolved ? 'noindex,follow' : published.robots,
            indexable: unresolved ? false : published.indexable,
          });
          return {
            canonical: published.canonical ?? extended.canonical,
            robots: robots.robots,
            noindex: !robots.index,
            indexable: unresolved ? false : published.indexable,
            ogTitle: published.ogTitle ?? extended.ogTitle,
            ogDescription: published.ogDescription ?? extended.ogDescription,
            ogImage: published.ogImage ?? extended.ogImage,
            twitterCard: published.twitterCard ?? extended.twitterCard,
            schemaJson:
              published.schemaJson && typeof published.schemaJson === 'object'
                ? (published.schemaJson as Record<string, unknown>)
                : extended.schemaJson,
          };
        })()
      : {
          canonical: extended.canonical,
          robots: unresolved ? 'noindex,follow' : extended.robots,
          noindex: unresolved,
          indexable: !unresolved,
          ogTitle: extended.ogTitle,
          ogDescription: extended.ogDescription,
          ogImage: extended.ogImage,
          twitterCard: extended.twitterCard,
          schemaJson: extended.schemaJson,
        };

    const latestPosts = (
      await this.portalFeed.getLatestForSeoPage({
        cityName: location.name,
        regionName: resolved?.regionName,
        limit: 5,
      })
    ).items;

    return {
      ...copy,
      intent,
      location,
      totalCount: 0,
      hasListings: false,
      listings: [],
      marketStats: null,
      latestPosts,
      locationMeta: resolved
        ? {
            officialCode: resolved.officialCode,
            resolvedFrom: resolved.resolvedFrom,
            districtName: resolved.districtName,
            regionName: resolved.regionName,
            status: resolved.status,
          }
        : undefined,
      relatedLocations: [],
      internalLinks: {
        sameIntentNearby: [],
        otherIntents: [],
        extra: extended.internalLinks,
      },
      seo: seoMeta,
    };
  }

  async resolvePageWithListings(
    intentSlug: string,
    locationSlug: string,
    limit = 24,
  ): Promise<ProgrammaticSeoPagePayload> {
    const base = await this.resolvePage(intentSlug, locationSlug);
    return this.attachListings(base, intentSlug, locationSlug, limit);
  }

  /** Admin náhled — načte stránku včetně DRAFT obsahu z DB. */
  async resolvePageByContentId(contentId: string, limit = 24): Promise<ProgrammaticSeoPagePayload & { contentId: string; contentStatus: string }> {
    const row = await this.prisma.seoPageContent.findUnique({
      where: { id: contentId },
      include: { location: true },
    });
    if (!row?.intentSlug) throw new NotFoundException('SEO stránka nenalezena.');
    const locationSlug = row.location?.slug;
    if (!locationSlug) throw new NotFoundException('SEO stránka nemá lokalitu.');

    const resolved = row.location?.id
      ? await this.locationDisplay.resolveSeoLocation(row.location.id)
      : null;

    const intent = getProgrammaticSeoIntent(row.intentSlug);
    if (!intent) throw new NotFoundException('Neznámý intent.');

    const location = resolved
      ? this.locationDisplay.toCzGeoLocation(resolved)
      : await this.resolveLocation(locationSlug);
    if (!location) throw new NotFoundException('Lokalita nenalezena.');

    const generated = buildProgrammaticSeoCopy(intent, location);
    const extended = buildExtendedSeoMetadata(intent, location, generated);

    const copy: ProgrammaticSeoCopy = row.h1
      ? {
          ...generated,
          h1: row.h1,
          title: row.title ?? generated.title,
          description: row.description ?? generated.description,
          bodyText: row.bodyText ?? generated.bodyText,
          faq: Array.isArray(row.faq)
            ? (row.faq as Array<{ question: string; answer: string }>)
            : generated.faq,
        }
      : generated;

    const seoMeta = row.canonical
      ? {
          canonical: row.canonical,
          robots: row.robots ?? extended.robots,
          noindex: Boolean(row.noindex),
          ogTitle: row.ogTitle ?? extended.ogTitle,
          ogDescription: row.ogDescription ?? extended.ogDescription,
          ogImage: row.ogImage ?? extended.ogImage,
          twitterCard: row.twitterCard ?? extended.twitterCard,
          schemaJson:
            row.schemaJson && typeof row.schemaJson === 'object'
              ? (row.schemaJson as Record<string, unknown>)
              : extended.schemaJson,
        }
      : {
          canonical: extended.canonical,
          robots: extended.robots,
          noindex: row.noindex,
          ogTitle: extended.ogTitle,
          ogDescription: extended.ogDescription,
          ogImage: extended.ogImage,
          twitterCard: extended.twitterCard,
          schemaJson: extended.schemaJson,
        };

    const latestPosts = (
      await this.portalFeed.getLatestForSeoPage({
        cityName: location.name,
        regionName: resolved?.regionName,
        limit: 5,
      })
    ).items;

    const base: ProgrammaticSeoPagePayload = {
      ...copy,
      intent,
      location,
      totalCount: 0,
      hasListings: false,
      listings: [],
      marketStats: null,
      latestPosts,
      locationMeta: resolved
        ? {
            officialCode: resolved.officialCode,
            resolvedFrom: resolved.resolvedFrom,
            districtName: resolved.districtName,
            regionName: resolved.regionName,
            status: resolved.status,
          }
        : undefined,
      relatedLocations: [],
      internalLinks: {
        sameIntentNearby: [],
        otherIntents: [],
        extra: extended.internalLinks,
      },
      seo: seoMeta,
    };

    const withListings = await this.attachListings(base, row.intentSlug, locationSlug, limit);
    return {
      ...withListings,
      contentId: row.id,
      contentStatus: row.status,
    };
  }

  private async attachListings(
    base: ProgrammaticSeoPagePayload,
    intentSlug: string,
    locationSlug: string,
    limit: number,
  ): Promise<ProgrammaticSeoPagePayload> {
    const { intent, location } = base;

    const dbLoc = await this.seoLocations.findBySlug(locationSlug);

    const whereParts: Prisma.PropertyWhereInput[] = [
      { deletedAt: null },
      { approved: true },
      { isActive: true },
      { isVisible: true },
      { slug: { not: null } },
    ];

    if (!intent.isBrokerPage) {
      if (dbLoc) {
        whereParts.push({ seoLocationId: dbLoc.id });
      } else {
        const locationWhere = buildPropertyLocationsWhere(location.searchTerms);
        if (Object.keys(locationWhere).length > 0) whereParts.push(locationWhere);
      }

      if (intent.offerType) {
        const offerVariants =
          intent.offerType === 'pronajem'
            ? ['pronájem', 'pronajem', 'nájem', 'najem']
            : ['prodej', 'prodej'];
        whereParts.push({
          OR: offerVariants.map((v) => ({
            offerType: { equals: v, mode: 'insensitive' as const },
          })),
        });
      }

      if (intent.propertyTypeKey) {
        const ptk = intent.propertyTypeKey;
        const typeVariants: Record<string, string[]> = {
          byt: ['byt'],
          dum: ['dům', 'dum', 'dom'],
          pozemek: ['pozemek', 'pozem'],
          garaz: ['garáž', 'garaz'],
          komercni: ['komerční', 'komercni'],
          chata_chalupa: ['chata', 'chalupa', 'chata_chalupa'],
        };
        const ptEq = typeVariants[ptk] ?? [ptk];
        whereParts.push({
          OR: [
            { propertyTypeKey: { equals: ptk, mode: 'insensitive' } },
            ...ptEq.map((t) => ({
              propertyType: { equals: t, mode: 'insensitive' as const },
            })),
          ],
        });
      }
    }

    const where: Prisma.PropertyWhereInput = { AND: whereParts };

    const [rows, totalCount, priceRows] = await Promise.all([
      intent.isBrokerPage
        ? Promise.resolve([])
        : this.prisma.property.findMany({
            where,
            select: {
              id: true,
              slug: true,
              title: true,
              city: true,
              price: true,
              currency: true,
              mainImage: true,
              offerType: true,
              propertyType: true,
              area: true,
              approved: true,
              isActive: true,
              isVisible: true,
              deletedAt: true,
              activeFrom: true,
              activeUntil: true,
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
          }),
      intent.isBrokerPage
        ? Promise.resolve(0)
        : this.prisma.property.count({ where }),
      intent.isBrokerPage
        ? Promise.resolve([])
        : this.prisma.property.findMany({
            where: { ...where, price: { gt: 0 } },
            select: { price: true, area: true },
            take: 200,
            orderBy: { createdAt: 'desc' },
          }),
    ]);

    const listings: ProgrammaticSeoListingPreview[] = rows
      .filter((r) => isPropertyPubliclyListed(r))
      .map((r) => ({
        id: r.id,
        slug: r.slug,
        title: r.title,
        city: r.city,
        price: r.price,
        currency: r.currency,
        mainImage: r.mainImage,
        offerType: r.offerType,
        propertyType: r.propertyType,
      }));

    const relatedLocations = await this.buildRelatedLocations(intent, location);
    const internalLinks = await this.buildInternalLinks(intent, location);
    const generated = buildProgrammaticSeoCopy(intent, location);
    const extended = buildExtendedSeoMetadata(intent, location, generated);

    const marketStats = buildMarketStats({
      prices: priceRows.map((r) => r.price ?? 0),
      areas: priceRows.map((r) => r.area),
      listingCount: totalCount,
    });

    const latestPosts = (
      await this.portalFeed.getLatestForSeoPage({
        cityName: location.name,
        regionName: base.locationMeta?.regionName,
        limit: 5,
      })
    ).items;

    return {
      ...base,
      totalCount,
      hasListings: totalCount > 0,
      listings,
      marketStats: marketStats.hasEnoughData ? marketStats : null,
      latestPosts,
      relatedLocations,
      internalLinks: {
        ...internalLinks,
        extra: extended.internalLinks,
      },
    };
  }

  private async buildRelatedLocations(
    intent: ProgrammaticSeoIntent,
    location: CzGeoLocation,
  ): Promise<Array<{ slug: string; name: string; path: string }>> {
    const related = await this.seoLocations.findRelated(location.slug, 8);
    if (related.length) {
      return related.map((l) => ({
        slug: l.slug,
        name: l.name,
        path: buildProgrammaticSeoPath(intent.slug, l.slug),
      }));
    }
    const sameRegion = listCzGeoLocations()
      .filter((l) => l.regionSlug === location.regionSlug && l.slug !== location.slug && l.kind === 'mesto')
      .slice(0, 8);
    return sameRegion.map((l) => ({
      slug: l.slug,
      name: l.name,
      path: buildProgrammaticSeoPath(intent.slug, l.slug),
    }));
  }

  private async buildInternalLinks(intent: ProgrammaticSeoIntent, location: CzGeoLocation) {
    const otherIntents = PROGRAMMATIC_SEO_INTENT_SLUGS.filter((s) => s !== intent.slug)
      .slice(0, 6)
      .map((intentSlug) => {
        const i = getProgrammaticSeoIntent(intentSlug)!;
        return {
          intentSlug,
          label: i.label,
          path: buildProgrammaticSeoPath(intentSlug, location.slug),
        };
      });

    const sameIntentNearby = listCzGeoLocations()
      .filter((l) => l.kind === 'mesto' && l.slug !== location.slug)
      .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
      .slice(0, 8)
      .map((l) => ({
        slug: l.slug,
        name: l.name,
        path: buildProgrammaticSeoPath(intent.slug, l.slug),
      }));

    const region = location.regionSlug
      ? listCzGeoLocations().find((l) => l.slug === location.regionSlug)
      : undefined;

    return {
      sameIntentNearby,
      otherIntents,
      regionIntent: region
        ? {
            slug: region.slug,
            name: region.name,
            path: buildProgrammaticSeoPath(intent.slug, region.slug),
          }
        : undefined,
    };
  }

  async getProgrammaticSitemapEntries(origin: string): Promise<SitemapEntry[]> {
    const base = origin.replace(/\/+$/, '');
    const pages = await this.prisma.seoPageContent.findMany({
      where: {
        status: 'PUBLISHED',
        indexable: true,
        noindex: false,
      },
      select: {
        intentSlug: true,
        canonical: true,
        updatedAt: true,
        location: { select: { slug: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50000,
    });

    return pages
      .filter((p) => p.intentSlug && p.location?.slug)
      .map((p) => {
        const path = buildProgrammaticSeoPath(p.intentSlug!, p.location!.slug);
        const loc = p.canonical?.trim() || `${base}${path}`;
        return {
          loc,
          lastmod: p.updatedAt.toISOString(),
          changefreq: 'weekly' as const,
          priority: 0.55,
        };
      });
  }

  getRegionSitemapEntries(origin: string): SitemapEntry[] {
    const base = origin.replace(/\/+$/, '');
    const now = new Date().toISOString();
    return listCzGeoLocations('kraj').map((k) => ({
      loc: `${base}/kraj/${k.slug}`,
      lastmod: now,
      changefreq: 'monthly',
      priority: 0.65,
    }));
  }

  getCitySitemapEntries(origin: string): SitemapEntry[] {
    const base = origin.replace(/\/+$/, '');
    const now = new Date().toISOString();
    return listCzGeoLocations()
      .filter((l) => l.kind === 'mesto' || l.kind === 'obec')
      .map((l) => ({
        loc: `${base}/mesto/${l.slug}`,
        lastmod: now,
        changefreq: 'weekly',
        priority: 0.6,
      }));
  }
}
