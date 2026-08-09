import { Injectable } from '@nestjs/common';
import type { AccommodationType } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { mapHotelbedsToCategory } from './hotelbeds-category.mapper';
import {
  HOTELBEDS_CONTENT_LANGUAGE,
  buildHotelbedsImageUrl,
  hotelSlug,
  localizedText,
  sortHotelbedsImages,
  starsFromCategory,
  type HbBookingHotel,
  type HbContentHotel,
} from './hotelbeds-normalizer';

const PROVIDER = 'HOTELBEDS';
const TAG_CONTENT_ENRICHED = 'hb-content:ENRICHED';
const TAG_CONTENT_PENDING = 'hb-content:PENDING';
const TAG_BOOKING_SYNC_PREFIX = 'hb-booking-sync:';

export type HotelbedsCatalogStats = {
  total: number;
  withContent: number;
  withoutContent: number;
  withImages: number;
  bookingOnly: number;
  contentEnriched: number;
};

export type CatalogHotelRecord = {
  content: HbContentHotel;
  booking: HbBookingHotel;
  bookingOnly: boolean;
  priceFrom: number | null;
  currency: string;
};

@Injectable()
export class HotelbedsContentStorageService {
  constructor(private readonly prisma: PrismaService) {}

  async findByProviderId(providerHotelId: number): Promise<HbContentHotel | null> {
    const row = await this.prisma.accommodation.findFirst({
      where: { provider: PROVIDER, externalId: String(providerHotelId) },
      include: {
        photos: { orderBy: { sortOrder: 'asc' } },
        facilities: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!row) return null;
    return this.toContentHotel(row);
  }

  async upsertFromContent(hotel: HbContentHotel, language = HOTELBEDS_CONTENT_LANGUAGE): Promise<void> {
    if (hotel.code == null) return;

    const name = localizedText(hotel.name) ?? `Hotel ${hotel.code}`;
    const description = localizedText(hotel.description);
    const shortDescription = description ? description.slice(0, 220) : null;
    const city = localizedText(hotel.city) ?? 'Česko';
    const addressParts = [hotel.address?.street, hotel.address?.number].filter(Boolean);
    const address = addressParts.length ? addressParts.join(' ') : null;
    const slug = hotelSlug(hotel.code, name);
    const sortedImages = sortHotelbedsImages(hotel.images);
    const facilities = (hotel.facilities ?? [])
      .map((f) => localizedText(f.description))
      .filter((x): x is string => Boolean(x));

    const xxCategory = mapHotelbedsToCategory({
      accommodationTypeCode: hotel.accommodationTypeCode,
      categoryName: hotel.category?.description?.content,
      categoryCode: hotel.categoryCode,
      name,
    });

    const existingForTags = await this.prisma.accommodation.findFirst({
      where: { provider: PROVIDER, externalId: String(hotel.code) },
      select: { id: true, tags: true },
    });

    const tags = this.mergeTags(existingForTags?.tags ?? [], [
      `hb-lang:${language}`,
      `hb-cat:${xxCategory}`,
      TAG_CONTENT_ENRICHED,
    ]);

    const data = {
      slug,
      source: 'OTHER' as const,
      externalId: String(hotel.code),
      provider: PROVIDER,
      type: mapToAccommodationType(xxCategory),
      name,
      shortDescription,
      description,
      country: hotel.countryCode ?? 'CZ',
      city,
      address,
      latitude: hotel.coordinates?.latitude ?? null,
      longitude: hotel.coordinates?.longitude ?? null,
      stars: starsFromCategory(hotel.categoryCode),
      status: 'PUBLISHED' as const,
      published: true,
      tags,
      lastSyncedAt: new Date(),
    };

    const existing = existingForTags;

    const accommodationId = existing
      ? (
          await this.prisma.accommodation.update({
            where: { id: existing.id },
            data,
            select: { id: true },
          })
        ).id
      : (
          await this.prisma.accommodation.create({
            data,
            select: { id: true },
          })
        ).id;

    await this.prisma.accommodationPhoto.deleteMany({ where: { accommodationId } });
    if (sortedImages.length) {
      await this.prisma.accommodationPhoto.createMany({
        data: sortedImages.map((img, idx) => ({
          accommodationId,
          url: img.path!,
          alt: name,
          sortOrder: img.visualOrder ?? img.order ?? idx,
          isCover: idx === 0,
        })),
      });
    }

    await this.prisma.accommodationFacility.deleteMany({ where: { accommodationId } });
    if (facilities.length) {
      await this.prisma.accommodationFacility.createMany({
        data: facilities.slice(0, 40).map((name, idx) => ({
          accommodationId,
          name,
          sortOrder: idx,
        })),
      });
    }
  }

  async upsertFromBooking(
    hotel: HbBookingHotel,
    destinationLabel: string,
    stay?: { checkIn: string; checkOut: string },
  ): Promise<{ created: boolean; accommodationId: string }> {
    void stay;
    if (hotel.code == null) {
      throw new Error('Booking hotel missing code.');
    }

    const code = hotel.code;
    const name = hotel.name?.trim() || `Hotel ${code}`;
    const city = hotel.destinationName?.trim() || destinationLabel || 'Česko';
    const region = hotel.zoneName?.trim() || null;
    const slug = hotelSlug(code, name);
    const stars = starsFromCategory(hotel.categoryCode);
    const minRate = hotel.minRate != null ? Number(hotel.minRate) : null;
    const currency = (hotel.currency ?? 'EUR').toUpperCase();
    const lat = hotel.latitude != null ? Number(hotel.latitude) : null;
    const lng = hotel.longitude != null ? Number(hotel.longitude) : null;
    const xxCategory = mapHotelbedsToCategory({
      categoryName: hotel.categoryName,
      categoryCode: hotel.categoryCode,
      name,
    });

    const existing = await this.prisma.accommodation.findFirst({
      where: { provider: PROVIDER, externalId: String(code) },
      include: { photos: { select: { id: true } } },
    });

    const hasContent = Boolean(
      (existing?.photos.length ?? 0) > 0 || existing?.description?.trim(),
    );
    const baseTags = [
      `hb-lang:${HOTELBEDS_CONTENT_LANGUAGE}`,
      `hb-cat:${xxCategory}`,
      hasContent ? TAG_CONTENT_ENRICHED : TAG_CONTENT_PENDING,
      `${TAG_BOOKING_SYNC_PREFIX}${new Date().toISOString()}`,
    ];
    const tags = this.mergeTags(existing?.tags ?? [], baseTags);

    const data = {
      slug: existing?.slug ?? slug,
      source: 'OTHER' as const,
      externalId: String(code),
      provider: PROVIDER,
      type: mapToAccommodationType(xxCategory),
      name,
      city,
      region,
      country: 'CZ',
      latitude: Number.isFinite(lat) ? lat : existing?.latitude ?? null,
      longitude: Number.isFinite(lng) ? lng : existing?.longitude ?? null,
      stars: stars ?? existing?.stars ?? null,
      priceFrom: minRate != null ? Math.round(minRate) : existing?.priceFrom ?? null,
      currency,
      priceUnit: 'PER_NIGHT' as const,
      status: 'PUBLISHED' as const,
      published: true,
      tags,
      lastSyncedAt: new Date(),
      shortDescription: existing?.shortDescription ?? null,
      description: existing?.description ?? null,
      address: existing?.address ?? null,
    };

    const accommodationId = existing
      ? (
          await this.prisma.accommodation.update({
            where: { id: existing.id },
            data,
            select: { id: true },
          })
        ).id
      : (
          await this.prisma.accommodation.create({
            data,
            select: { id: true },
          })
        ).id;

    await this.syncBookingRooms(accommodationId, hotel, currency);

    return { created: !existing, accommodationId };
  }

  private async syncBookingRooms(
    accommodationId: string,
    hotel: HbBookingHotel,
    currency: string,
  ): Promise<void> {
    const rooms = hotel.rooms ?? [];
    if (!rooms.length) return;

    await this.prisma.accommodationRoom.deleteMany({ where: { accommodationId } });
    for (const room of rooms.slice(0, 8)) {
      const rate = room.rates?.[0];
      const net = rate?.net != null ? Number(rate.net) : null;
      await this.prisma.accommodationRoom.create({
        data: {
          accommodationId,
          name: room.name ?? 'Pokoj',
          description: rate?.boardName ?? null,
          capacity: (rate?.adults ?? 2) + (rate?.children ?? 0),
          priceFrom: net != null ? Math.round(net) : null,
          currency,
        },
      });
    }
  }

  async getCatalogStats(): Promise<HotelbedsCatalogStats> {
    const rows = await this.prisma.accommodation.findMany({
      where: { provider: PROVIDER, published: true, status: 'PUBLISHED' },
      select: {
        tags: true,
        description: true,
        _count: { select: { photos: true } },
      },
    });

    let withImages = 0;
    let contentEnriched = 0;
    let bookingOnly = 0;

    for (const row of rows) {
      const hasImages = row._count.photos > 0;
      const enriched =
        row.tags.includes(TAG_CONTENT_ENRICHED) ||
        Boolean(row.description?.trim()) ||
        hasImages;
      if (hasImages) withImages++;
      if (enriched) contentEnriched++;
      else bookingOnly++;
    }

    const total = rows.length;
    return {
      total,
      withContent: contentEnriched,
      withoutContent: total - contentEnriched,
      withImages,
      bookingOnly,
      contentEnriched,
    };
  }

  async listCatalogRecords(opts: {
    category?: string;
    city?: string;
    page: number;
    limit: number;
  }): Promise<{ items: CatalogHotelRecord[]; total: number }> {
    const page = Math.max(1, opts.page);
    const limit = Math.max(1, Math.min(100, opts.limit));
    const where: {
      provider: string;
      published: boolean;
      status: 'PUBLISHED';
      city?: { contains: string; mode: 'insensitive' };
      tags?: { has: string };
    } = {
      provider: PROVIDER,
      published: true,
      status: 'PUBLISHED',
    };

    if (opts.city?.trim()) {
      where.city = { contains: opts.city.trim(), mode: 'insensitive' };
    }
    if (opts.category && opts.category !== 'vse') {
      where.tags = { has: `hb-cat:${opts.category}` };
    }

    const [rows, total] = await Promise.all([
      this.prisma.accommodation.findMany({
        where,
        include: {
          photos: { orderBy: { sortOrder: 'asc' } },
          facilities: { orderBy: { sortOrder: 'asc' } },
        },
        orderBy: [{ featured: 'desc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.accommodation.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toCatalogRecord(row)),
      total,
    };
  }

  private toCatalogRecord(row: {
    externalId: string | null;
    name: string;
    description: string | null;
    country: string;
    city: string;
    region: string | null;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    stars: number | null;
    priceFrom: number | null;
    currency: string;
    tags: string[];
    photos: Array<{ url: string; sortOrder: number; isCover: boolean }>;
    facilities: Array<{ name: string }>;
  }): CatalogHotelRecord {
    const code = Number(row.externalId);
    const content = this.toContentHotel(row);
    const hasContent =
      row.tags.includes(TAG_CONTENT_ENRICHED) ||
      Boolean(row.description?.trim()) ||
      row.photos.length > 0;
    const booking: HbBookingHotel = {
      code: Number.isFinite(code) ? code : undefined,
      name: row.name,
      categoryCode: row.stars != null ? `${row.stars}EST` : undefined,
      destinationName: row.city,
      zoneName: row.region ?? undefined,
      latitude: row.latitude ?? undefined,
      longitude: row.longitude ?? undefined,
      minRate: row.priceFrom ?? undefined,
      currency: row.currency,
    };
    return {
      content,
      booking,
      bookingOnly: !hasContent,
      priceFrom: row.priceFrom,
      currency: row.currency,
    };
  }

  private mergeTags(existing: string[], incoming: string[]): string[] {
    const preserved = existing.filter(
      (tag) =>
        !tag.startsWith('hb-content:') &&
        !tag.startsWith(TAG_BOOKING_SYNC_PREFIX) &&
        !tag.startsWith('hb-lang:') &&
        !tag.startsWith('hb-cat:'),
    );
    return [...new Set([...preserved, ...incoming])];
  }

  async countImages(providerHotelId: number): Promise<number> {
    const row = await this.prisma.accommodation.findFirst({
      where: { provider: PROVIDER, externalId: String(providerHotelId) },
      include: { _count: { select: { photos: true } } },
    });
    return row?._count.photos ?? 0;
  }

  async countCatalog(): Promise<number> {
    return this.prisma.accommodation.count({
      where: { provider: PROVIDER, published: true, status: 'PUBLISHED' },
    });
  }

  async getDbDiagnostics(providerHotelId: number) {
    const row = await this.prisma.accommodation.findFirst({
      where: { provider: PROVIDER, externalId: String(providerHotelId) },
      include: {
        photos: { orderBy: { sortOrder: 'asc' } },
        facilities: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!row) {
      return {
        found: false,
        hotelCode: providerHotelId,
        name: null as string | null,
        slug: null as string | null,
        imagesCount: 0,
        imagePaths: [] as string[],
        descriptionExists: false,
        facilitiesCount: 0,
        address: null as string | null,
        coordinates: null as { latitude: number; longitude: number } | null,
        lastSyncedAt: null as string | null,
      };
    }
    return {
      found: true,
      hotelCode: providerHotelId,
      name: row.name,
      slug: row.slug,
      imagesCount: row.photos.length,
      imagePaths: row.photos.slice(0, 8).map((p) => p.url),
      descriptionExists: Boolean(row.description?.trim()),
      facilitiesCount: row.facilities.length,
      address: row.address,
      coordinates:
        row.latitude != null && row.longitude != null
          ? { latitude: row.latitude, longitude: row.longitude }
          : null,
      lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    };
  }

  async listCatalog(opts: {
    category?: string;
    city?: string;
    page: number;
    limit: number;
  }): Promise<{ items: HbContentHotel[]; total: number }> {
    const page = Math.max(1, opts.page);
    const limit = Math.max(1, Math.min(100, opts.limit));
    const where: {
      provider: string;
      published: boolean;
      status: 'PUBLISHED';
      city?: { contains: string; mode: 'insensitive' };
      tags?: { has: string };
    } = {
      provider: PROVIDER,
      published: true,
      status: 'PUBLISHED',
    };

    if (opts.city?.trim()) {
      where.city = { contains: opts.city.trim(), mode: 'insensitive' };
    }
    if (opts.category && opts.category !== 'vse') {
      where.tags = { has: `hb-cat:${opts.category}` };
    }

    const [rows, total] = await Promise.all([
      this.prisma.accommodation.findMany({
        where,
        include: {
          photos: { orderBy: { sortOrder: 'asc' } },
          facilities: { orderBy: { sortOrder: 'asc' } },
        },
        orderBy: [{ featured: 'desc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.accommodation.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toContentHotel(row)),
      total,
    };
  }

  private toContentHotel(row: {
    externalId: string | null;
    name: string;
    description: string | null;
    country: string;
    city: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    tags: string[];
    photos: Array<{ url: string; sortOrder: number; isCover: boolean }>;
    facilities: Array<{ name: string }>;
  }): HbContentHotel {
    const code = Number(row.externalId);
    const langTag = row.tags.find((t) => t.startsWith('hb-lang:'));
    const language = langTag?.split(':')[1] ?? HOTELBEDS_CONTENT_LANGUAGE;
    return {
      code: Number.isFinite(code) ? code : undefined,
      name: row.name,
      description: row.description ?? undefined,
      countryCode: row.country,
      city: { content: row.city },
      address: row.address ? { street: row.address } : undefined,
      coordinates:
        row.latitude != null && row.longitude != null
          ? { latitude: row.latitude, longitude: row.longitude }
          : undefined,
      images: row.photos.map((p) => ({
        path: p.url,
        order: p.sortOrder,
      })),
      facilities: row.facilities.map((f) => ({ description: { content: f.name } })),
      // language stored in tags for diagnostics
      ...(language ? {} : {}),
    };
  }

  photoUrlFromStoredPath(path: string, size: 'thumbnail' | 'card' | 'detail' | 'hero' = 'card'): string | null {
    return buildHotelbedsImageUrl(path, size);
  }
}

function mapToAccommodationType(category: ReturnType<typeof mapHotelbedsToCategory>): AccommodationType {
  switch (category) {
    case 'apartmany':
      return 'APARTMENT';
    case 'penziony':
      return 'PENSION';
    case 'chaty':
      return 'CHATA';
    case 'chalupy':
      return 'CHALUPA';
    case 'wellness':
      return 'WELLNESS';
    case 'kempy':
      return 'CAMP';
    case 'luxusni':
      return 'LUXURY';
    default:
      return 'HOTEL';
  }
}
