export const HOTELBEDS_PAGE_SIZE = 24;
export const HOTELBEDS_BATCH_MAX = 100;
/** Max hotel codes per Content API request (Hotelbeds pagination default). */
export const HOTELBEDS_CONTENT_BATCH_SIZE = 100;

/**
 * Jediná podporovaná language hodnota pro Hotelbeds Content API.
 * Používejte výhradně 3písmenné kódy dle dokumentace (ENG, SPA, …).
 */
export const HOTELBEDS_CONTENT_LANGUAGE = 'ENG';

/** @deprecated Používejte HOTELBEDS_CONTENT_LANGUAGE */
export const HOTELBEDS_CONTENT_LANGUAGE_PREFERRED = [HOTELBEDS_CONTENT_LANGUAGE] as const;

/** @deprecated Používejte HOTELBEDS_CONTENT_LANGUAGE */
export const HOTELBEDS_CONTENT_SECONDARY_LANGUAGE = HOTELBEDS_CONTENT_LANGUAGE;

export type HotelbedsImageSize = 'thumbnail' | 'card' | 'detail' | 'hero';

const HOTELBEDS_IMAGE_BASE = 'https://photos.hotelbeds.com/giata';

/** Hotelbeds GIATA size folders — dle oficiální dokumentace (ne filename suffix). */
const IMAGE_SIZE_FOLDER: Record<HotelbedsImageSize, string | null> = {
  thumbnail: 'small',
  card: 'medium',
  detail: 'bigger',
  hero: 'xl',
};

/** Fallback pořadí pro server-side image delivery. */
export const HOTELBEDS_IMAGE_FOLDER_FALLBACK = [
  null,
  'bigger',
  'medium',
  'small',
  'xl',
  'original',
] as const;

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
  images?: Array<{
    path?: string;
    imageTypeCode?: string;
    order?: number;
    visualOrder?: number;
    roomCode?: string;
    roomType?: string;
    characteristicCode?: string;
  }>;
  facilities?: Array<{ facilityCode?: number; facilityGroupCode?: number; description?: { content?: string } }>;
  rooms?: Array<{
    roomCode?: string;
    description?: string;
    maxAdults?: number;
    maxChildren?: number;
  }>;
  ranking?: number;
};

/** Odstraní chybné suffixy přidané starou logikou (_b.jpg apod.). */
export function normalizeHotelbedsImagePath(path: string): string {
  let clean = path.trim().replace(/^\/+/, '');
  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    try {
      const u = new URL(clean);
      clean = u.pathname.replace(/^\/giata\/?/, '').replace(/^\/+/, '');
    } catch {
      return path;
    }
  }
  return clean.replace(/_(t|b|l|xl)(\.(jpe?g|png|webp))$/i, '$2');
}

/** Sestaví GIATA URL — path z Content API se NEMĚNÍ, pouze se přidá size folder. */
export function buildHotelbedsImageUrl(
  path?: string | null,
  size: HotelbedsImageSize = 'card',
  folderOverride?: string | null,
): string | null {
  if (!path?.trim()) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const clean = normalizeHotelbedsImagePath(path);
  const folder = folderOverride !== undefined ? folderOverride : IMAGE_SIZE_FOLDER[size];
  if (folder) {
    return `${HOTELBEDS_IMAGE_BASE}/${folder}/${clean}`;
  }
  return `${HOTELBEDS_IMAGE_BASE}/${clean}`;
}

export function buildHotelbedsImageUrlWithFolder(
  path: string,
  folder: string | null,
): string {
  const clean = normalizeHotelbedsImagePath(path);
  return folder ? `${HOTELBEDS_IMAGE_BASE}/${folder}/${clean}` : `${HOTELBEDS_IMAGE_BASE}/${clean}`;
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
    const oa = a.visualOrder ?? a.order ?? 0;
    const ob = b.visualOrder ?? b.order ?? 0;
    return oa - ob;
  });
  const seen = new Set<string>();
  return sorted.filter((img) => {
    const path = normalizeImagePath(img.path);
    if (!path) return false;
    if (seen.has(path)) return false;
    seen.add(path);
    img.path = path;
    return true;
  });
}

function normalizeImagePath(path?: string | null): string | null {
  if (!path?.trim()) return null;
  const trimmed = path.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return trimmed.replace(/^\/+/, '');
}

type HbContentImage = NonNullable<HbContentHotel['images']>[number];

function normalizeContentImage(raw: unknown): HbContentImage | null {
  if (typeof raw === 'string') {
    const path = normalizeImagePath(raw);
    return path ? { path } : null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const path = normalizeImagePath(
    (o.path ?? o.url ?? o.image ?? o.uri ?? o.imagePath) as string | undefined,
  );
  if (!path) return null;
  return {
    path,
    imageTypeCode: (o.imageTypeCode ?? o.type ?? o.imageType) as string | undefined,
    order: o.order != null ? Number(o.order) : undefined,
    visualOrder: o.visualOrder != null ? Number(o.visualOrder) : undefined,
    roomCode: (o.roomCode ?? o.room) as string | undefined,
    roomType: o.roomType as string | undefined,
    characteristicCode: o.characteristicCode as string | undefined,
  };
}

function extractContentImages(hotel: Record<string, unknown>): HbContentHotel['images'] {
  const raw = hotel.images ?? hotel.photos ?? hotel.visualizations;
  if (Array.isArray(raw)) {
    return raw.map(normalizeContentImage).filter((x): x is NonNullable<typeof x> => x != null);
  }
  if (raw && typeof raw === 'object') {
    const nested = (raw as { image?: unknown }).image;
    if (Array.isArray(nested)) {
      return nested.map(normalizeContentImage).filter((x): x is NonNullable<typeof x> => x != null);
    }
  }
  return [];
}

/** Parsuje Content API response — podporuje hotels[] i hotels.hotels[]. */
export function parseContentHotelsResponse(data: unknown): HbContentHotel[] {
  if (!data || typeof data !== 'object') return [];
  const root = data as Record<string, unknown>;
  let hotels: unknown[] = [];
  if (Array.isArray(root.hotels)) {
    hotels = root.hotels;
  } else if (root.hotels && typeof root.hotels === 'object') {
    const nested = (root.hotels as Record<string, unknown>).hotels;
    if (Array.isArray(nested)) hotels = nested;
  }
  return hotels
    .filter((h): h is Record<string, unknown> => Boolean(h) && typeof h === 'object')
    .map((hotel) => {
      const images = extractContentImages(hotel);
      return { ...(hotel as HbContentHotel), images };
    });
}

export function summarizeContentResponse(data: unknown, hotelCode?: number) {
  const keys = data && typeof data === 'object' ? Object.keys(data as object) : [];
  const hotels = parseContentHotelsResponse(data);
  const hotel =
    hotelCode != null
      ? hotels.find((h) => String(h.code) === String(hotelCode)) ?? hotels[0]
      : hotels[0];
  const images = sortHotelbedsImages(hotel?.images);
  return {
    responseKeys: keys,
    hotelsCount: hotels.length,
    hotelCode: hotel?.code ?? null,
    hotelName: localizedText(hotel?.name),
    imagesRawCount: hotel?.images?.length ?? 0,
    imagesParsedCount: images.length,
    descriptionExists: Boolean(localizedText(hotel?.description)),
    facilitiesCount: hotel?.facilities?.length ?? 0,
    firstImagePath: images[0]?.path ?? null,
  };
}

export function buildContentHotelsUrl(
  contentBaseUrl: string,
  codes: number[],
  language: string = HOTELBEDS_CONTENT_LANGUAGE,
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
