export const HOTELBEDS_PAGE_SIZE = 24;
export const HOTELBEDS_BATCH_MAX = 100;
/** Max hotel codes per Content API request (Hotelbeds pagination default). */
export const HOTELBEDS_CONTENT_BATCH_SIZE = 100;

/**
 * Hotelbeds Content API language codes (3-letter, dle oficiální dokumentace).
 * Preferujeme češtinu, pak angličtinu.
 */
export const HOTELBEDS_CONTENT_LANGUAGE_PREFERRED = ['CZE', 'ENG'] as const;
export const HOTELBEDS_CONTENT_LANGUAGE = 'ENG';
export const HOTELBEDS_CONTENT_SECONDARY_LANGUAGE = 'ENG';

export type HotelbedsImageSize = 'thumbnail' | 'card' | 'detail' | 'hero';

const HOTELBEDS_IMAGE_BASE = 'https://photos.hotelbeds.com/giata';
const IMAGE_SIZE_SUFFIX: Record<HotelbedsImageSize, string> = {
  thumbnail: '_t',
  card: '_b',
  detail: '_l',
  hero: '_xl',
};

const IMAGE_TYPE_PRIORITY: Record<string, number> = {
  GEN: 0,
  HAB: 1,
  RES: 2,
};

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
  accommodationTypeCode?: string;
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

function replaceImageSizeSuffix(path: string, suffix: string): string {
  if (/_(t|s|b|l|xl)(\.[a-z0-9]+)$/i.test(path)) {
    return path.replace(/_(t|s|b|l|xl)(\.[a-z0-9]+)$/i, `${suffix}$2`);
  }
  return path.replace(/(\.[a-z0-9]+)$/i, `${suffix}$1`);
}

/** Sestaví plnou Hotelbeds GIATA image URL dle velikosti (Use of images). */
export function buildHotelbedsImageUrl(
  path?: string | null,
  size: HotelbedsImageSize = 'card',
): string | null {
  if (!path?.trim()) return null;
  const suffix = IMAGE_SIZE_SUFFIX[size];
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return replaceImageSizeSuffix(path, suffix);
  }
  const clean = replaceImageSizeSuffix(path.replace(/^\/+/, ''), suffix);
  return `${HOTELBEDS_IMAGE_BASE}/${clean}`;
}

/** @deprecated Use buildHotelbedsImageUrl(path, 'card') */
export function hotelbedsImageUrl(path?: string | null): string | null {
  return buildHotelbedsImageUrl(path, 'card');
}

export function sortHotelbedsImages(
  images?: HbContentHotel['images'],
): NonNullable<HbContentHotel['images']> {
  if (!images?.length) return [];
  const sorted = [...images].sort((a, b) => {
    const pa = IMAGE_TYPE_PRIORITY[a.imageTypeCode ?? ''] ?? 99;
    const pb = IMAGE_TYPE_PRIORITY[b.imageTypeCode ?? ''] ?? 99;
    if (pa !== pb) return pa - pb;
    return (a.order ?? 0) - (b.order ?? 0);
  });
  const seen = new Set<string>();
  return sorted.filter((img) => {
    if (!img.path) return false;
    if (seen.has(img.path)) return false;
    seen.add(img.path);
    return true;
  });
}

export function buildContentHotelsUrl(
  contentBaseUrl: string,
  codes: number[],
  language: string,
): string {
  const params = new URLSearchParams({
    fields: 'all',
    language,
    useSecondaryLanguage: 'false',
    codes: codes.join(','),
  });
  return `${contentBaseUrl}/hotels?${params.toString()}`;
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
  pets: boolean;
  accessible: boolean;
} {
  const joined = facilities.join(' ').toLowerCase();
  return {
    wifi: /wi-?fi|internet/.test(joined),
    parking: /park/.test(joined),
    breakfast: /snídan|breakfast|bufet/.test(joined),
    wellness: /wellness|spa|sauna/.test(joined),
    pool: /bazén|pool|swimming/.test(joined),
    pets: /pet|mazlí|dog|cat/.test(joined),
    accessible: /barrier|wheelchair|bezbari|accessible|handicap/.test(joined),
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

export function maskContentRequestParams(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}?${parsed.searchParams.toString()}`;
  } catch {
    return url.replace(/https?:\/\/[^/]+/i, '');
  }
}

export function formatHotelbedsErrorBody(bodyText: string): string {
  if (!bodyText.trim()) return '';
  try {
    const parsed = JSON.parse(bodyText) as {
      error?: { code?: string; message?: string };
      message?: string;
    };
    const code = parsed.error?.code;
    const message = parsed.error?.message ?? parsed.message;
    if (code || message) {
      return [code ? `Error code: ${code}` : null, message ? `Message: ${message}` : null]
        .filter(Boolean)
        .join('\n');
    }
  } catch {
    // fall through
  }
  return bodyText.slice(0, 500);
}
