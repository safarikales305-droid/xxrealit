import { API_BASE_URL } from './api';

export type AccommodationItem = {
  id: string;
  slug: string;
  type: string;
  name: string;
  shortDescription: string | null;
  city: string;
  region: string | null;
  stars: number | null;
  rating: number | null;
  reviewCount: number;
  priceFrom: number | null;
  currency: string;
  priceUnit: string;
  coverPhoto: string | null;
  amenities: string[];
  tags: string[];
  wifi: boolean;
  parking: boolean;
  breakfast: boolean;
  wellness: boolean;
  pool: boolean;
  favorited?: boolean;
};

export type AccommodationDetail = AccommodationItem & {
  description: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  checkInFrom: string | null;
  checkOutUntil: string | null;
  petsAllowed: boolean;
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
  seoTitle: string | null;
  seoDescription: string | null;
};

export type AccommodationListResponse = {
  items: AccommodationItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type AccommodationSearchParams = {
  q?: string;
  city?: string;
  category?: string;
  locationSlug?: string;
  priceMin?: number;
  priceMax?: number;
  ratingMin?: number;
  page?: number;
  limit?: number;
  wifi?: boolean;
  parking?: boolean;
  breakfast?: boolean;
  wellness?: boolean;
  pool?: boolean;
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

export async function fetchAccommodations(
  params: AccommodationSearchParams = {},
  token?: string | null,
): Promise<AccommodationListResponse> {
  const headers: HeadersInit = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(
    `${API_BASE_URL}/accommodations${buildQuery({
      q: params.q,
      city: params.city,
      category: params.category,
      locationSlug: params.locationSlug,
      priceMin: params.priceMin,
      priceMax: params.priceMax,
      ratingMin: params.ratingMin,
      page: params.page,
      limit: params.limit,
      wifi: params.wifi ? '1' : undefined,
      parking: params.parking ? '1' : undefined,
      breakfast: params.breakfast ? '1' : undefined,
      wellness: params.wellness ? '1' : undefined,
      pool: params.pool ? '1' : undefined,
    })}`,
    { headers, next: { revalidate: 60 } },
  );
  if (!res.ok) throw new Error('Nepodařilo se načíst ubytování.');
  return res.json();
}

export async function fetchAccommodationDetail(
  slug: string,
  token?: string | null,
): Promise<AccommodationDetail | null> {
  const headers: HeadersInit = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE_URL}/accommodations/${encodeURIComponent(slug)}`, {
    headers,
    next: { revalidate: 120 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Nepodařilo se načíst detail ubytování.');
  return res.json();
}

export async function fetchSimilarAccommodations(slug: string): Promise<AccommodationItem[]> {
  const res = await fetch(`${API_BASE_URL}/accommodations/${encodeURIComponent(slug)}/similar`, {
    next: { revalidate: 120 },
  });
  if (!res.ok) return [];
  return res.json();
}

export async function fetchAccommodationMapMarkers(params: AccommodationSearchParams = {}) {
  const res = await fetch(
    `${API_BASE_URL}/accommodations/map-markers${buildQuery({
      q: params.q,
      category: params.category,
      city: params.city,
    })}`,
    { next: { revalidate: 60 } },
  );
  if (!res.ok) return [];
  return res.json();
}

export async function toggleAccommodationFavorite(token: string, id: string) {
  const res = await fetch(`${API_BASE_URL}/accommodations/${encodeURIComponent(id)}/favorite`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Oblíbené se nepodařilo uložit.');
  return res.json() as Promise<{ favorited: boolean }>;
}

export const ACCOMMODATION_CATEGORIES = [
  { slug: 'vse', label: 'Vše' },
  { slug: 'hotely', label: 'Hotely' },
  { slug: 'apartmany', label: 'Apartmány' },
  { slug: 'penziony', label: 'Penziony' },
  { slug: 'chaty', label: 'Chaty' },
  { slug: 'chalupy', label: 'Chalupy' },
  { slug: 'wellness', label: 'Wellness' },
  { slug: 'kempy', label: 'Kempy' },
  { slug: 'luxusni', label: 'Luxusní' },
  { slug: 'u-more', label: 'U moře' },
  { slug: 'hory', label: 'Hory' },
  { slug: 'mesto', label: 'Město' },
] as const;

export const ACCOMMODATION_TYPE_LABELS: Record<string, string> = {
  HOTEL: 'Hotel',
  APARTMENT: 'Apartmán',
  PENSION: 'Penzion',
  CHALUPA: 'Chalupa',
  CHATA: 'Chata',
  WELLNESS: 'Wellness',
  CAMP: 'Kemp',
  LUXURY: 'Luxusní',
  OTHER: 'Ubytování',
};

export function formatAccommodationPrice(item: Pick<AccommodationItem, 'priceFrom' | 'currency' | 'priceUnit'>) {
  if (item.priceFrom == null) return 'Cena na dotaz';
  const unit = item.priceUnit === 'PER_STAY' ? 'celý objekt' : 'noc';
  return `od ${item.priceFrom.toLocaleString('cs-CZ')} ${item.currency} / ${unit}`;
}

// ─── Admin API ───────────────────────────────────────────────────────────────

async function adminFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/admin/accommodations${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? 'Admin API chyba');
  }
  return res.json();
}

export async function adminFetchAccommodationDashboard(token: string) {
  return adminFetch<{
    total: number;
    active: number;
    inactive: number;
    byProvider: Record<string, number>;
    syncErrors: unknown[];
  }>(token, '/dashboard');
}

export async function adminFetchAccommodations(
  token: string,
  params?: { page?: number; provider?: string },
) {
  const sp = new URLSearchParams();
  if (params?.page) sp.set('page', String(params.page));
  if (params?.provider) sp.set('provider', params.provider);
  const q = sp.toString();
  return adminFetch<{ items: Array<Record<string, unknown>>; total: number }>(token, q ? `?${q}` : '');
}

export async function adminFetchAccommodationProvider(token: string, provider: string) {
  return adminFetch<Record<string, unknown>>(token, `/providers/${encodeURIComponent(provider)}`);
}

export async function adminSaveAccommodationProvider(
  token: string,
  provider: string,
  body: Record<string, unknown>,
) {
  return adminFetch(token, `/providers/${encodeURIComponent(provider)}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function adminTestAccommodationProvider(token: string, provider: string) {
  return adminFetch<{ ok: boolean; message: string }>(
    token,
    `/providers/${encodeURIComponent(provider)}/test`,
    { method: 'POST', body: '{}' },
  );
}

export async function adminStartAccommodationSync(token: string, provider: string) {
  return adminFetch<{ jobId: string }>(token, `/providers/${encodeURIComponent(provider)}/sync`, {
    method: 'POST',
    body: '{}',
  });
}

export async function adminUpdateAccommodationStatus(
  token: string,
  id: string,
  body: { status?: string; published?: boolean },
) {
  return adminFetch(token, `/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

