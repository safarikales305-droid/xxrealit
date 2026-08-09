const PHOTO_BASE = 'https://photos.hotelbeds.com/giata';

export type HbBookingHotel = {
  code?: number;
  name?: string;
  categoryCode?: string;
  categoryName?: string;
  destinationCode?: string;
  destinationName?: string;
  zoneName?: string;
  latitude?: string | number;
  longitude?: string | number;
  minRate?: string | number;
  maxRate?: string | number;
  currency?: string;
  rooms?: Array<{
    code?: string;
    name?: string;
    rates?: Array<{
      net?: string | number;
      boardCode?: string;
      boardName?: string;
      cancellationPolicies?: Array<{ amount?: string; from?: string }>;
      rooms?: number;
      adults?: number;
      children?: number;
    }>;
  }>;
};

export type HbContentHotel = {
  code?: number;
  name?: { content?: string } | string;
  description?: { content?: string } | string;
  countryCode?: string;
  destinationCode?: string;
  categoryCode?: string;
  category?: { code?: string; description?: { content?: string } };
  address?: { content?: string; street?: string; number?: string };
  city?: { content?: string };
  coordinates?: { latitude?: number; longitude?: number };
  images?: Array<{ path?: string; imageTypeCode?: string; order?: number }>;
  facilities?: Array<{ facilityCode?: number; facilityGroupCode?: number; description?: { content?: string } }>;
  rooms?: Array<{
    roomCode?: string;
    description?: string;
    maxAdults?: number;
    maxChildren?: number;
  }>;
  ranking?: number;
};

export function hotelbedsImageUrl(path?: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const clean = path.replace(/^\/+/, '');
  return `${PHOTO_BASE}/${clean}`;
}

export function slugifyHotelName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function hotelSlug(code: number | string, name?: string): string {
  const base = slugifyHotelName(name ?? 'hotel');
  return `hotel-${code}-${base}`;
}

export function parseHotelCodeFromSlug(slug: string): string | null {
  const m = /^hotel-(\d+)/i.exec(slug);
  return m?.[1] ?? null;
}

export function starsFromCategory(categoryCode?: string | null): number | null {
  if (!categoryCode) return null;
  const m = /(\d)/.exec(categoryCode);
  return m ? Number(m[1]) : null;
}

export function localizedText(value?: { content?: string } | string | null): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value.content ?? null;
}

export function facilityFlags(facilities: string[]): {
  wifi: boolean;
  parking: boolean;
  breakfast: boolean;
  wellness: boolean;
  pool: boolean;
} {
  const joined = facilities.join(' ').toLowerCase();
  return {
    wifi: /wi-?fi|internet/.test(joined),
    parking: /park/.test(joined),
    breakfast: /snídan|breakfast|bufet/.test(joined),
    wellness: /wellness|spa|sauna/.test(joined),
    pool: /bazén|pool|swimming/.test(joined),
  };
}

export function cancellationSummary(
  policies?: Array<{ amount?: string; from?: string }>,
): string | null {
  if (!policies?.length) return null;
  const first = policies[0];
  if (!first?.from) return 'Storno podmínky dle tarifu partnera.';
  return `Storno od ${first.from}${first.amount ? ` (poplatek ${first.amount})` : ''}.`;
}
