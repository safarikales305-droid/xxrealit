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
import { buildProgrammaticSeoPageKey } from './seo-location.util';
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
    const db = await this.seoLocations.findBySlug(slug);
    if (db) {
      return this.dbToCzGeo(db);
    }
    return findCzGeoLocation(slug);
  }

  async resolvePage(intentSlug: string, locationSlug: string): Promise<ProgrammaticSeoPagePayload> {
    const intent = getProgrammaticSeoIntent(intentSlug);
    if (!intent) throw new NotFoundException('Neznámý typ stránky.');

    const location = await this.resolveLocation(locationSlug);
    if (!location) throw new NotFoundException('Lokalita nenalezena.');

    const pageKey = buildProgrammaticSeoPageKey(intentSlug, location.slug);
    const published = await this.seoContent.getPublished(pageKey);
    const generated = buildProgrammaticSeoCopy(intent, location);
    const extended = buildExtendedSeoMetadata(intent, location, generated);

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

    const seoMeta = published?.canonical
      ? {
          canonical: published.canonical,
          robots: published.robots ?? extended.robots,
          noindex: Boolean(published.noindex),
          ogTitle: published.ogTitle ?? extended.ogTitle,
          ogDescription: published.ogDescription ?? extended.ogDescription,
          ogImage: published.ogImage ?? extended.ogImage,
          twitterCard: published.twitterCard ?? extended.twitterCard,
          schemaJson:
            published.schemaJson && typeof published.schemaJson === 'object'
              ? (published.schemaJson as Record<string, unknown>)
              : extended.schemaJson,
        }
      : {
          canonical: extended.canonical,
          robots: extended.robots,
          noindex: false,
          ogTitle: extended.ogTitle,
          ogDescription: extended.ogDescription,
          ogImage: extended.ogImage,
          twitterCard: extended.twitterCard,
          schemaJson: extended.schemaJson,
        };

    return {
      ...copy,
      intent,
      location,
      totalCount: 0,
      hasListings: false,
      listings: [],
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

    const [rows, totalCount] = await Promise.all([
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

    return {
      ...base,
      totalCount,
      hasListings: totalCount > 0,
      listings,
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
    const now = new Date().toISOString();
    const dbSlugs = await this.seoLocations.listSlugsForSitemap();
    const slugs = dbSlugs.length ? dbSlugs : listCzGeoSlugsForSitemap();
    const entries: SitemapEntry[] = [];

    for (const intentSlug of PROGRAMMATIC_SEO_INTENT_SLUGS) {
      const intent = getProgrammaticSeoIntent(intentSlug)!;
      for (const locSlug of slugs) {
        entries.push({
          loc: `${base}${buildProgrammaticSeoPath(intentSlug, locSlug)}`,
          lastmod: now,
          changefreq: 'weekly',
          priority: intent.sitemapPriority,
        });
      }
    }

    return entries;
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
