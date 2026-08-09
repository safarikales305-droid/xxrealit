import { API_BASE_URL } from './api';
import type { AccommodationDetail, AccommodationItem, AccommodationListResponse } from './accommodation-client';

export type HotelbedsPublicConfig = {
  publicListings: boolean;
  bookingEnabled: boolean;
  environment: string;
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
  const res = await fetch(
    `${API_BASE_URL}/hotelbeds/public/search${buildQuery({
      destination: params.destination ?? defaults.destination,
      checkIn: params.checkIn ?? defaults.checkIn,
      checkOut: params.checkOut ?? defaults.checkOut,
      adults: params.adults ?? defaults.adults,
      rooms: params.rooms ?? defaults.rooms,
      children: params.children,
      page: params.page,
      limit: params.limit,
      starsMin: params.starsMin,
      priceMax: params.priceMax,
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
    limit: data.limit ?? 12,
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
    .map((i) => i as AccommodationItem & { latitude?: number | null; longitude?: number | null })
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

type RawHotel = {
  id: string;
  slug: string;
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

function mapToAccommodationItem(raw: RawHotel): AccommodationItem & {
  available?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  originalPrice?: number | null;
  originalCurrency?: string;
} {
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
    coverPhoto: raw.coverPhoto ?? raw.photos?.[0]?.url ?? null,
    amenities: raw.amenities ?? [],
    tags: raw.tags ?? [],
    wifi: Boolean(raw.wifi),
    parking: Boolean(raw.parking),
    breakfast: Boolean(raw.breakfast),
    wellness: Boolean(raw.wellness),
    pool: Boolean(raw.pool),
    available: raw.available ?? true,
    latitude: raw.latitude ?? null,
    longitude: raw.longitude ?? null,
    originalPrice: raw.priceFromOriginal ?? null,
    originalCurrency: raw.originalCurrency ?? undefined,
  };
}

function mapToAccommodationDetail(raw: RawHotel): AccommodationDetail & {
  available?: boolean;
  boardTypes?: string[];
  cancellationPolicy?: string | null;
  checkIn?: string;
  checkOut?: string;
  bookingEnabled?: boolean;
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
      url: p.url,
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
