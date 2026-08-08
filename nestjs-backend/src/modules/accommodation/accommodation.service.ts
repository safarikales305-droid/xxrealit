import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import {
  AccommodationSource,
  AccommodationStatus,
  AccommodationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  mapCategoryToTag,
  mapCategoryToType,
  mapProviderItemToCreate,
  serializeAccommodation,
} from './accommodation.serializer';
import type { AccommodationSearchParams } from './providers/accommodation-provider.interface';
import { AccommodationProviderRegistry } from './providers/accommodation-provider.registry';
import {
  DEMO_ACCOMMODATION_SEED_KEY,
  DEMO_ACCOMMODATIONS,
} from './seed/demo-accommodations.data';

export type AccommodationListQuery = AccommodationSearchParams & {
  category?: string;
  locationSlug?: string;
};

@Injectable()
export class AccommodationService implements OnModuleInit {
  private readonly log = new Logger(AccommodationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: AccommodationProviderRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDemoIfNeeded();
  }

  private includePublic = {
    photos: { orderBy: { sortOrder: 'asc' as const } },
    facilities: { orderBy: { sortOrder: 'asc' as const } },
    rooms: true,
    likes: { select: { id: true }, take: 1 },
  };

  private publicWhere(extra?: Prisma.AccommodationWhereInput): Prisma.AccommodationWhereInput {
    return {
      status: AccommodationStatus.PUBLISHED,
      published: true,
      ...extra,
    };
  }

  async seedDemoIfNeeded(): Promise<{ seeded: number }> {
    const existing = await this.prisma.accommodation.count({
      where: { provider: 'demo', externalId: { startsWith: 'demo-' } },
    });
    if (existing >= DEMO_ACCOMMODATIONS.length) {
      return { seeded: 0 };
    }
    let seeded = 0;
    for (const item of DEMO_ACCOMMODATIONS) {
      const found = await this.prisma.accommodation.findFirst({
        where: { provider: 'demo', externalId: item.externalId },
      });
      if (found) continue;
      await this.prisma.accommodation.create({
        data: mapProviderItemToCreate(item, 'demo', AccommodationSource.DEMO),
      });
      seeded++;
    }
    if (seeded > 0) {
      this.log.log(`Seeded ${seeded} demo accommodations (${DEMO_ACCOMMODATION_SEED_KEY})`);
    }
    return { seeded };
  }

  async list(query: AccommodationListQuery, userId?: string) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(50, Math.max(1, query.limit ?? 20));
    const where: Prisma.AccommodationWhereInput = this.publicWhere();

    if (query.query?.trim()) {
      const q = query.query.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
        { region: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (query.city?.trim()) where.city = { contains: query.city.trim(), mode: 'insensitive' };
    if (query.locationSlug?.trim()) {
      const slug = query.locationSlug.trim();
      where.OR = [
        { city: { contains: slug.replace(/-/g, ' '), mode: 'insensitive' } },
        { slug: { contains: slug, mode: 'insensitive' } },
      ];
    }
    const type = (query.type ?? mapCategoryToType(query.category)) as AccommodationType | undefined;
    if (type) where.type = type;
    const tag = mapCategoryToTag(query.category);
    if (tag) where.tags = { has: tag };
    if (query.priceMin != null) where.priceFrom = { gte: query.priceMin };
    if (query.priceMax != null) {
      where.priceFrom = { ...(where.priceFrom as object), lte: query.priceMax };
    }
    if (query.ratingMin != null) where.rating = { gte: query.ratingMin };
    if (query.starsMin != null) where.stars = { gte: query.starsMin };
    if (query.wifi) where.wifi = true;
    if (query.parking) where.parking = true;
    if (query.breakfast) where.breakfast = true;
    if (query.wellness) where.wellness = true;
    if (query.pool) where.pool = true;
    if (query.pets) where.petsAllowed = true;
    if (query.accessible) where.accessible = true;

    const [total, rows] = await Promise.all([
      this.prisma.accommodation.count({ where }),
      this.prisma.accommodation.findMany({
        where,
        orderBy: [{ featured: 'desc' }, { rating: 'desc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          ...this.includePublic,
          likes: userId ? { where: { userId }, select: { id: true }, take: 1 } : undefined,
        },
      }),
    ]);

    return {
      items: rows.map((r) => serializeAccommodation(r, userId)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getBySlug(slug: string, userId?: string) {
    const row = await this.prisma.accommodation.findFirst({
      where: this.publicWhere({ slug }),
      include: {
        ...this.includePublic,
        likes: userId ? { where: { userId }, select: { id: true }, take: 1 } : undefined,
      },
    });
    if (!row) throw new NotFoundException('Ubytování nenalezeno.');
    return serializeAccommodation(row, userId);
  }

  async getSimilar(slug: string, limit = 4) {
    const base = await this.prisma.accommodation.findFirst({
      where: this.publicWhere({ slug }),
      select: { id: true, city: true, type: true, tags: true },
    });
    if (!base) return [];
    const rows = await this.prisma.accommodation.findMany({
      where: this.publicWhere({
        id: { not: base.id },
        OR: [{ city: base.city }, { type: base.type }, { tags: { hasSome: base.tags } }],
      }),
      take: limit,
      include: this.includePublic,
    });
    return rows.map((r) => serializeAccommodation(r));
  }

  async checkAvailability(slug: string, checkIn: string, checkOut: string, guests?: number) {
    const row = await this.prisma.accommodation.findFirst({
      where: this.publicWhere({ slug }),
      select: { id: true, provider: true, externalId: true, priceFrom: true, currency: true },
    });
    if (!row?.externalId) throw new NotFoundException('Ubytování nenalezeno.');
    const provider = this.providers.get(row.provider) ?? this.providers.default();
    const result = await provider.getAvailability(row.externalId, checkIn, checkOut, guests);
    if (!result.available && row.provider === 'booking') {
      return {
        available: false,
        message: 'Data partnera momentálně nejsou dostupná. Zkuste to prosím později.',
      };
    }
    return {
      available: result.available,
      priceFrom: result.priceFrom ?? row.priceFrom,
      currency: result.currency ?? row.currency,
      roomsLeft: result.roomsLeft,
      message: result.available
        ? undefined
        : 'Rezervace bude dostupná po napojení partnerského API.',
    };
  }

  async toggleFavorite(userId: string, accommodationId: string) {
    const acc = await this.prisma.accommodation.findFirst({
      where: this.publicWhere({ id: accommodationId }),
    });
    if (!acc) throw new NotFoundException('Ubytování nenalezeno.');
    const existing = await this.prisma.accommodationLike.findUnique({
      where: { accommodationId_userId: { accommodationId, userId } },
    });
    if (existing) {
      await this.prisma.accommodationLike.delete({ where: { id: existing.id } });
      return { favorited: false };
    }
    await this.prisma.accommodationLike.create({ data: { accommodationId, userId } });
    return { favorited: true };
  }

  async listFavorites(userId: string) {
    const rows = await this.prisma.accommodationLike.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        accommodation: { include: this.includePublic },
      },
    });
    return rows
      .filter((r) => r.accommodation.status === AccommodationStatus.PUBLISHED && r.accommodation.published)
      .map((r) => serializeAccommodation({ ...r.accommodation, likes: [{ id: r.id }] }, userId));
  }

  async getMapMarkers(query: AccommodationListQuery) {
    const { items } = await this.list({ ...query, limit: 200, page: 1 });
    return items
      .filter((i) => i.latitude != null && i.longitude != null)
      .map((i) => ({
        id: i.id,
        slug: i.slug,
        name: i.name,
        latitude: i.latitude!,
        longitude: i.longitude!,
        priceFrom: i.priceFrom,
        coverPhoto: i.coverPhoto,
        type: i.type,
      }));
  }
}
