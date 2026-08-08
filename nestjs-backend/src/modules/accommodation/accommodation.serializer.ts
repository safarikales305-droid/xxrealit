import {
  AccommodationPriceUnit,
  AccommodationSource,
  AccommodationStatus,
  AccommodationType,
  Prisma,
} from '@prisma/client';
import type { Accommodation } from '@prisma/client';

export type SerializedAccommodation = {
  id: string;
  slug: string;
  source: string;
  provider: string;
  type: string;
  name: string;
  shortDescription: string | null;
  description: string | null;
  country: string;
  region: string | null;
  city: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  stars: number | null;
  rating: number | null;
  reviewCount: number;
  priceFrom: number | null;
  currency: string;
  priceUnit: string;
  checkInFrom: string | null;
  checkOutUntil: string | null;
  featured: boolean;
  amenities: string[];
  tags: string[];
  petsAllowed: boolean;
  parking: boolean;
  wifi: boolean;
  breakfast: boolean;
  wellness: boolean;
  pool: boolean;
  airConditioning: boolean;
  accessible: boolean;
  coverPhoto: string | null;
  photos: Array<{ id: string; url: string; alt: string | null; isCover: boolean }>;
  facilities: Array<{ id: string; name: string; icon: string | null }>;
  rooms: Array<{
    id: string;
    name: string;
    description: string | null;
    capacity: number;
    beds: string | null;
    priceFrom: number | null;
    currency: string;
  }>;
  favorited?: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
};

type AccWithRelations = Accommodation & {
  photos?: Array<{ id: string; url: string; alt: string | null; isCover: boolean; sortOrder: number }>;
  facilities?: Array<{ id: string; name: string; icon: string | null; sortOrder: number }>;
  rooms?: Array<{
    id: string;
    name: string;
    description: string | null;
    capacity: number;
    beds: string | null;
    priceFrom: number | null;
    currency: string;
  }>;
  likes?: Array<{ id: string }>;
};

export function serializeAccommodation(
  row: AccWithRelations,
  userId?: string,
): SerializedAccommodation {
  const photos = [...(row.photos ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const cover = photos.find((p) => p.isCover) ?? photos[0];
  return {
    id: row.id,
    slug: row.slug,
    source: row.source,
    provider: row.provider,
    type: row.type,
    name: row.name,
    shortDescription: row.shortDescription,
    description: row.description,
    country: row.country,
    region: row.region,
    city: row.city,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    stars: row.stars,
    rating: row.rating,
    reviewCount: row.reviewCount,
    priceFrom: row.priceFrom,
    currency: row.currency,
    priceUnit: row.priceUnit,
    checkInFrom: row.checkInFrom,
    checkOutUntil: row.checkOutUntil,
    featured: row.featured,
    amenities: row.amenities ?? [],
    tags: row.tags ?? [],
    petsAllowed: row.petsAllowed,
    parking: row.parking,
    wifi: row.wifi,
    breakfast: row.breakfast,
    wellness: row.wellness,
    pool: row.pool,
    airConditioning: row.airConditioning,
    accessible: row.accessible,
    coverPhoto: cover?.url ?? null,
    photos: photos.map((p) => ({ id: p.id, url: p.url, alt: p.alt, isCover: p.isCover })),
    facilities: [...(row.facilities ?? [])]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((f) => ({ id: f.id, name: f.name, icon: f.icon })),
    rooms: (row.rooms ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      capacity: r.capacity,
      beds: r.beds,
      priceFrom: r.priceFrom,
      currency: r.currency,
    })),
    favorited: userId ? Boolean(row.likes?.length) : undefined,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
  };
}

export function mapCategoryToType(category?: string): AccommodationType | undefined {
  if (!category || category === 'vse') return undefined;
  const map: Record<string, AccommodationType> = {
    hotely: AccommodationType.HOTEL,
    apartmany: AccommodationType.APARTMENT,
    penziony: AccommodationType.PENSION,
    chaty: AccommodationType.CHATA,
    chalupy: AccommodationType.CHALUPA,
    wellness: AccommodationType.WELLNESS,
    kempy: AccommodationType.CAMP,
    luxusni: AccommodationType.LUXURY,
  };
  return map[category];
}

export function mapCategoryToTag(category?: string): string | undefined {
  const map: Record<string, string> = {
    'u-more': 'u-vody',
    hory: 'hory',
    mesto: 'mesto',
  };
  return category ? map[category] : undefined;
}

export function mapProviderItemToCreate(
  item: {
    externalId: string;
    slug: string;
    type: string;
    name: string;
    shortDescription?: string;
    description?: string;
    country?: string;
    region?: string;
    city: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    stars?: number;
    rating?: number;
    reviewCount?: number;
    priceFrom?: number;
    currency?: string;
    priceUnit?: string;
    amenities?: string[];
    tags?: string[];
    photos?: Array<{ url: string; alt?: string; isCover?: boolean }>;
    facilities?: Array<{ name: string; icon?: string }>;
  },
  provider: string,
  source: AccommodationSource,
): Prisma.AccommodationCreateInput {
  const amenities = item.amenities ?? [];
  return {
    slug: item.slug,
    externalId: item.externalId,
    provider,
    source,
    type: (item.type as AccommodationType) || AccommodationType.HOTEL,
    name: item.name,
    shortDescription: item.shortDescription,
    description: item.description,
    country: item.country ?? 'CZ',
    region: item.region,
    city: item.city,
    address: item.address,
    latitude: item.latitude,
    longitude: item.longitude,
    stars: item.stars,
    rating: item.rating,
    reviewCount: item.reviewCount ?? 0,
    priceFrom: item.priceFrom,
    currency: item.currency ?? 'CZK',
    priceUnit: (item.priceUnit as AccommodationPriceUnit) ?? AccommodationPriceUnit.PER_NIGHT,
    status: AccommodationStatus.PUBLISHED,
    published: true,
    amenities,
    tags: item.tags ?? [],
    wifi: amenities.some((a) => /wi-?fi/i.test(a)),
    parking: amenities.some((a) => /parkov/i.test(a)),
    breakfast: amenities.some((a) => /snídan/i.test(a)),
    wellness: amenities.some((a) => /wellness|spa|sauna/i.test(a)),
    pool: amenities.some((a) => /bazén/i.test(a)),
    photos: {
      create: (item.photos ?? []).map((p, i) => ({
        url: p.url,
        alt: p.alt,
        isCover: p.isCover ?? i === 0,
        sortOrder: i,
      })),
    },
    facilities: {
      create: (item.facilities ?? []).map((f, i) => ({
        name: f.name,
        icon: f.icon,
        sortOrder: i,
      })),
    },
  };
}
