import { API_BASE_URL } from './api';
import { ACCOMMODATION_PAGE_SIZE } from './accommodation-categories';
import type {
  AccommodationAvailabilityStatus,
  AccommodationDetail,
  AccommodationItem,
  AccommodationListResponse,
} from './accommodation-client';

export type HotelbedsPublicConfig = {
  publicListings: boolean;
  bookingEnabled: boolean;
  environment: string;
  contentApiAvailable?: boolean;
};

export type HotelbedsSearchParams = {
  destination?: string;
  checkIn?: string;
  checkOut?: string;
  adults?: number;
  children?: number;
  rooms?: number;
  page?: number;
  limit?: number;
  starsMin?: number;
  priceMax?: number;
  category?: string;
  wifi?: boolean;
  parking?: boolean;
  breakfast?: boolean;
  wellness?: boolean;
  pool?: boolean;
  pets?: boolean;
  accessible?: boolean;
  ratingMin?: number;
  /** Katalog z DB bez Booking availability */
  catalog?: boolean;
};

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '' || v === false) continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export function defaultHotelbedsSearchParams(): Required<
  Pick<HotelbedsSearchParams, 'destination' | 'checkIn' | 'checkOut' | 'adults' | 'rooms'>
> {
  return {
    destination: 'Praha',
    checkIn: addDays(7),
    checkOut: addDays(9),
    adults: 2,
    rooms: 1,
  };
}

function addDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isHotelbedsSlug(slug: string): boolean {
  return /^hotel-\d+/i.test(slug);
}

export async function fetchHotelbedsConfig(): Promise<HotelbedsPublicConfig | null> {
  if (!API_BASE_URL) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/hotelbeds/public/config`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return (await res.json()) as HotelbedsPublicConfig;
  } catch {
    return null;
  }
}

export async function fetchHotelbedsSearch(
  params: HotelbedsSearchParams = {},
): Promise<AccommodationListResponse & { checkIn: string; checkOut: string; destination: string }> {
  const defaults = defaultHotelbedsSearchParams();
  const catalog = params.catalog ?? true;
  const res = await fetch(
    `${API_BASE_URL}/hotelbeds/public/search${buildQuery({
      destination: params.destination ?? defaults.destination,
      checkIn: params.checkIn ?? defaults.checkIn,
      checkOut: params.checkOut ?? defaults.checkOut,
      adults: params.adults ?? defaults.adults,
      rooms: params.rooms ?? defaults.rooms,
      children: params.children,
      page: params.page,
      limit: params.limit ?? ACCOMMODATION_PAGE_SIZE,
      starsMin: params.starsMin,
      priceMax: params.priceMax,
      category: params.category,
      wifi: params.wifi ? '1' : undefined,
      parking: params.parking ? '1' : undefined,
      breakfast: params.breakfast ? '1' : undefined,
      wellness: params.wellness ? '1' : undefined,
      pool: params.pool ? '1' : undefined,
      pets: params.pets ? '1' : undefined,
      accessible: params.accessible ? '1' : undefined,
      ratingMin: params.ratingMin,
      catalog: catalog ? '1' : '0',
    })}`,
    { next: { revalidate: 60 } },
  );
  if (!res.ok) {
    throw new Error('Ubytování se momentálně nepodařilo načíst. Zkuste to prosím za chvíli.');
  }
  const data = await res.json();
  return {
    items: (data.items ?? []).map(mapToAccommodationItem),
    total: data.total ?? 0,
    page: data.page ?? 1,
    limit: data.limit ?? ACCOMMODATION_PAGE_SIZE,
    totalPages: data.totalPages ?? 1,
    checkIn: data.checkIn,
    checkOut: data.checkOut,
    destination: data.destination,
  };
}

export async function fetchHotelbedsDetail(
  slug: string,
  params?: Pick<HotelbedsSearchParams, 'checkIn' | 'checkOut' | 'adults' | 'rooms'>,
): Promise<AccommodationDetail | null> {
  const defaults = defaultHotelbedsSearchParams();
  const res = await fetch(
    `${API_BASE_URL}/hotelbeds/public/hotels/${encodeURIComponent(slug)}${buildQuery({
      checkIn: params?.checkIn ?? defaults.checkIn,
      checkOut: params?.checkOut ?? defaults.checkOut,
      adults: params?.adults ?? defaults.adults,
      rooms: params?.rooms ?? defaults.rooms,
    })}`,
    { next: { revalidate: 120 } },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Nepodařilo se načíst detail ubytování.');
  const data = await res.json();
  return mapToAccommodationDetail(data);
}

export async function fetchHotelbedsSimilar(
  slug: string,
  params?: Pick<HotelbedsSearchParams, 'checkIn' | 'checkOut' | 'adults' | 'rooms'>,
): Promise<AccommodationItem[]> {
  const defaults = defaultHotelbedsSearchParams();
  const res = await fetch(
    `${API_BASE_URL}/hotelbeds/public/hotels/${encodeURIComponent(slug)}/similar${buildQuery({
      checkIn: params?.checkIn ?? defaults.checkIn,
      checkOut: params?.checkOut ?? defaults.checkOut,
      adults: params?.adults ?? defaults.adults,
      rooms: params?.rooms ?? defaults.rooms,
    })}`,
    { next: { revalidate: 120 } },
  );
  if (!res.ok) return [];
  const rows = await res.json();
  return (rows ?? []).map(mapToAccommodationItem);
}

export async function fetchHotelbedsMapMarkers(params: HotelbedsSearchParams = {}) {
  const res = await fetchHotelbedsSearch({ ...params, limit: 50, page: 1 });
  return res.items
    .filter((i) => i.latitude != null && i.longitude != null)
    .map((i) => ({
      id: i.id,
      slug: i.slug,
      name: i.name,
      latitude: i.latitude as number,
      longitude: i.longitude as number,
      priceFrom: i.priceFrom,
    }));
}

function resolveHotelbedsImageUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (!API_BASE_URL) return url;
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${API_BASE_URL}${path}`;
}

type RawHotel = {
  id: string;
  slug: string;
  providerId?: string;
  contentEnriched?: boolean;
  type: string;
  name: string;
  shortDescription?: string | null;
  description?: string | null;
  city: string;
  region?: string | null;
  stars?: number | null;
  rating?: number | null;
  reviewCount?: number;
  priceFrom?: number | null;
  priceFromOriginal?: number | null;
  currency: string;
  originalCurrency?: string;
  priceUnit?: string;
  coverPhoto?: string | null;
  amenities?: string[];
  tags?: string[];
  wifi?: boolean;
  parking?: boolean;
  breakfast?: boolean;
  wellness?: boolean;
  pool?: boolean;
  available?: boolean;
  catalogOnly?: boolean;
  availabilityStatus?: AccommodationAvailabilityStatus;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  checkInFrom?: string | null;
  checkOutUntil?: string | null;
  photos?: Array<{ url: string; alt?: string | null }>;
  facilities?: string[];
  rooms?: Array<{
    code: string;
    name: string;
    description?: string | null;
    capacity: number;
    priceFrom?: number | null;
    currency: string;
    boardType?: string | null;
  }>;
  boardTypes?: string[];
  cancellationPolicy?: string | null;
  checkIn?: string;
  checkOut?: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
};

function mapToAccommodationItem(raw: RawHotel): AccommodationItem {
  return {
    id: raw.id,
    slug: raw.slug,
    type: raw.type ?? 'HOTEL',
    name: raw.name,
    shortDescription: raw.shortDescription ?? null,
    city: raw.city,
    region: raw.region ?? null,
    stars: raw.stars ?? null,
    rating: raw.rating ?? null,
    reviewCount: raw.reviewCount ?? 0,
    priceFrom: raw.priceFrom ?? null,
    currency: raw.currency ?? 'CZK',
    priceUnit: raw.priceUnit ?? 'PER_NIGHT',
    coverPhoto: resolveHotelbedsImageUrl(raw.coverPhoto ?? raw.photos?.[0]?.url ?? null),
    amenities: raw.amenities ?? [],
    tags: raw.tags ?? [],
    wifi: Boolean(raw.wifi),
    parking: Boolean(raw.parking),
    breakfast: Boolean(raw.breakfast),
    wellness: Boolean(raw.wellness),
    pool: Boolean(raw.pool),
    available: raw.available ?? false,
    catalogOnly: raw.catalogOnly ?? false,
    availabilityStatus: raw.availabilityStatus,
    latitude: raw.latitude ?? null,
    longitude: raw.longitude ?? null,
    originalPrice: raw.priceFromOriginal ?? null,
    originalCurrency: raw.originalCurrency ?? undefined,
    providerId: raw.providerId,
    contentEnriched: raw.contentEnriched ?? false,
  };
}

function mapToAccommodationDetail(raw: RawHotel): AccommodationDetail & {
  available?: boolean;
  boardTypes?: string[];
  cancellationPolicy?: string | null;
  checkIn?: string;
  checkOut?: string;
  bookingEnabled?: boolean;
  providerId?: string;
  contentEnriched?: boolean;
} {
  const item = mapToAccommodationItem(raw);
  return {
    ...item,
    description: raw.description ?? raw.shortDescription ?? null,
    address: raw.address ?? null,
    latitude: raw.latitude ?? null,
    longitude: raw.longitude ?? null,
    checkInFrom: raw.checkInFrom ?? null,
    checkOutUntil: raw.checkOutUntil ?? null,
    petsAllowed: false,
    photos: (raw.photos ?? []).map((p, i) => ({
      id: `${raw.id}-photo-${i}`,
      url: resolveHotelbedsImageUrl(p.url) ?? p.url,
      alt: p.alt ?? raw.name,
      isCover: i === 0,
    })),
    facilities: (raw.facilities ?? []).map((name, i) => ({
      id: `${raw.id}-fac-${i}`,
      name,
      icon: null,
    })),
    rooms: (raw.rooms ?? []).map((r) => ({
      id: r.code,
      name: r.name,
      description: r.description ?? r.boardType ?? null,
      capacity: r.capacity,
      beds: null,
      priceFrom: r.priceFrom ?? null,
      currency: r.currency,
    })),
    seoTitle: raw.seoTitle ?? null,
    seoDescription: raw.seoDescription ?? null,
    boardTypes: raw.boardTypes ?? [],
    cancellationPolicy: raw.cancellationPolicy ?? null,
    checkIn: raw.checkIn,
    checkOut: raw.checkOut,
    bookingEnabled: false,
  };
}
