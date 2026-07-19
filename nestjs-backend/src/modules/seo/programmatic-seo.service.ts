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
  type ProgrammaticSeoCopy,
} from './programmatic-seo.util';
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
  listings: ProgrammaticSeoListingPreview[];
  relatedLocations: Array<{ slug: string; name: string; path: string }>;
  internalLinks: {
    sameIntentNearby: Array<{ slug: string; name: string; path: string }>;
    otherIntents: Array<{ intentSlug: string; label: string; path: string }>;
    regionIntent?: { slug: string; name: string; path: string };
  };
};

@Injectable()
export class ProgrammaticSeoService {
  constructor(private readonly prisma: PrismaService) {}

  resolvePage(intentSlug: string, locationSlug: string): ProgrammaticSeoPagePayload {
    const intent = getProgrammaticSeoIntent(intentSlug);
    if (!intent) throw new NotFoundException('Neznámý typ stránky.');

    const location = findCzGeoLocation(locationSlug);
    if (!location) throw new NotFoundException('Lokalita nenalezena.');

    const copy = buildProgrammaticSeoCopy(intent, location);
    return {
      ...copy,
      intent,
      location,
      totalCount: 0,
      listings: [],
      relatedLocations: [],
      internalLinks: {
        sameIntentNearby: [],
        otherIntents: [],
      },
    };
  }

  async resolvePageWithListings(
    intentSlug: string,
    locationSlug: string,
    limit = 24,
  ): Promise<ProgrammaticSeoPagePayload> {
    const base = this.resolvePage(intentSlug, locationSlug);
    const { intent, location } = base;

    const whereParts: Prisma.PropertyWhereInput[] = [
      { deletedAt: null },
      { approved: true },
      { isActive: true },
      { isVisible: true },
      { slug: { not: null } },
    ];

    if (!intent.isBrokerPage) {
      const locationWhere = buildPropertyLocationsWhere(location.searchTerms);
      if (Object.keys(locationWhere).length > 0) whereParts.push(locationWhere);

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

    const relatedLocations = this.buildRelatedLocations(intent, location);
    const internalLinks = this.buildInternalLinks(intent, location);

    return {
      ...base,
      totalCount,
      listings,
      relatedLocations,
      internalLinks,
    };
  }

  private buildRelatedLocations(
    intent: ProgrammaticSeoIntent,
    location: CzGeoLocation,
  ): Array<{ slug: string; name: string; path: string }> {
    const sameRegion = listCzGeoLocations()
      .filter((l) => l.regionSlug === location.regionSlug && l.slug !== location.slug && l.kind === 'mesto')
      .slice(0, 8);
    return sameRegion.map((l) => ({
      slug: l.slug,
      name: l.name,
      path: buildProgrammaticSeoPath(intent.slug, l.slug),
    }));
  }

  private buildInternalLinks(intent: ProgrammaticSeoIntent, location: CzGeoLocation) {
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

  getProgrammaticSitemapEntries(origin: string): SitemapEntry[] {
    const base = origin.replace(/\/+$/, '');
    const now = new Date().toISOString();
    const slugs = listCzGeoSlugsForSitemap();
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
