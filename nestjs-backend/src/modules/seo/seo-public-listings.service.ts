import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { isPropertyPubliclyListed } from '../properties/property-public-visibility';
import { buildPropertyLocationMatchWhere } from '../properties/property-location-filter.util';
import { getProgrammaticSeoIntent } from './programmatic-seo-intents';

export type PublicSeoListingsQuery = {
  intent?: string;
  location?: string;
  locationId?: string;
  propertyTypeKey?: string;
  offerType?: string;
  page?: number;
  limit?: number;
};

@Injectable()
export class SeoPublicListingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getListings(query: PublicSeoListingsQuery) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(48, Math.max(1, query.limit ?? 24));
    const skip = (page - 1) * limit;

    const whereParts: Prisma.PropertyWhereInput[] = [
      { deletedAt: null },
      { approved: true },
      { isActive: true },
      { isVisible: true },
    ];

    let locationRecord: {
      id: string;
      name: string;
      slug: string;
      regionId: string | null;
      districtId: string | null;
      searchTerms: string[];
    } | null = null;

    if (query.locationId) {
      locationRecord = await this.prisma.seoLocation.findFirst({
        where: { id: query.locationId, isActive: true },
        select: {
          id: true,
          name: true,
          slug: true,
          regionId: true,
          districtId: true,
          searchTerms: true,
        },
      });
      if (locationRecord) {
        whereParts.push({ seoLocationId: locationRecord.id });
      }
    } else if (query.location) {
      const loc = await this.prisma.seoLocation.findFirst({
        where: {
          isActive: true,
          OR: [{ slug: query.location }, { slugAscii: query.location }],
        },
        select: {
          id: true,
          name: true,
          slug: true,
          regionId: true,
          districtId: true,
          searchTerms: true,
        },
      });
      if (loc) {
        locationRecord = loc;
        whereParts.push({ seoLocationId: loc.id });
      } else {
        whereParts.push(buildPropertyLocationMatchWhere(query.location));
      }
    }

    const intent = query.intent ? getProgrammaticSeoIntent(query.intent) : null;
    if (intent?.offerType) {
      const variants =
        intent.offerType === 'pronajem'
          ? ['pronájem', 'pronajem', 'nájem', 'najem']
          : ['prodej'];
      whereParts.push({
        OR: variants.map((v) => ({
          offerType: { equals: v, mode: 'insensitive' as const },
        })),
      });
    }

    const ptk = query.propertyTypeKey ?? intent?.propertyTypeKey;
    if (ptk) {
      whereParts.push({
        OR: [
          { propertyTypeKey: { equals: ptk, mode: 'insensitive' } },
          { propertyType: { contains: ptk.replace('_', ''), mode: 'insensitive' } },
        ],
      });
    }

    const where: Prisma.PropertyWhereInput = { AND: whereParts };

    const [rows, total, priceAgg] = await Promise.all([
      this.prisma.property.findMany({
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
          propertyTypeKey: true,
          videoUrl: true,
          createdAt: true,
          approved: true,
          isActive: true,
          isVisible: true,
          deletedAt: true,
          activeFrom: true,
          activeUntil: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.property.count({ where }),
      this.prisma.property.aggregate({
        where: { ...where, price: { not: null, gt: 0 } },
        _avg: { price: true },
        _min: { price: true },
        _max: { price: true },
      }),
    ]);

    const listings = rows
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
        propertyTypeKey: r.propertyTypeKey,
        hasVideo: Boolean(r.videoUrl?.trim()),
        url: r.slug ? `/nemovitosti/${r.slug}` : `/nemovitost/${r.id}`,
      }));

    const relatedLocations = locationRecord?.regionId
      ? await this.prisma.seoLocation.findMany({
          where: {
            isActive: true,
            regionId: locationRecord.regionId,
            NOT: { id: locationRecord.id },
            kind: { in: ['MESTO', 'OBEC', 'MESTYS'] },
          },
          orderBy: [{ population: 'desc' }],
          take: 8,
          select: { slug: true, name: true },
        })
      : [];

    return {
      ok: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      listings,
      statistics: {
        total,
        avgPrice: priceAgg._avg.price ? Math.round(priceAgg._avg.price) : null,
        minPrice: priceAgg._min.price,
        maxPrice: priceAgg._max.price,
      },
      location: locationRecord
        ? { id: locationRecord.id, name: locationRecord.name, slug: locationRecord.slug }
        : null,
      relatedLocations: relatedLocations.map((l) => ({
        slug: l.slug,
        name: l.name,
      })),
    };
  }
}
