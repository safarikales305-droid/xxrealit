import {
  safeNormalizePropertyFromApi,
  type PropertyFeedItem,
} from '@/types/property';

const FETCH_TIMEOUT_MS = 12_000;

function extractFeedRawItems(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  const o = data as Record<string, unknown>;
  for (const key of ['items', 'listings', 'properties', 'data'] as const) {
    const candidate = o[key];
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function extractFeedTotal(data: unknown, fallback: number): number {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return fallback;
  const total = (data as Record<string, unknown>).total;
  return typeof total === 'number' && Number.isFinite(total) && total >= 0
    ? Math.trunc(total)
    : fallback;
}

export async function loadPropertyFeedItems(
  base: string,
  options: {
    authorization?: string;
    /** API path without base (default `/properties`). */
    path?: string;
    /** Query řetězec bez `?` (např. `city=Praha&propertyTypeKey=byt`). */
    query?: string;
  } = {},
): Promise<{ items: PropertyFeedItem[]; total: number }> {
  const path = options.path ?? '/properties';
  const q = options.query?.trim();
  const url = q ? `${base}${path}?${q}` : `${base}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        ...(options.authorization
          ? { Authorization: options.authorization }
          : {}),
      },
    });

    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn('[Feed] GET failed', url, res.status);
      return { items: [], total: 0 };
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return { items: [], total: 0 };
    }

    const rawItems = extractFeedRawItems(data);
    if (rawItems.length === 0 && data != null && typeof data === 'object' && !Array.isArray(data)) {
      return { items: [], total: 0 };
    }

    const list = rawItems
      .map(safeNormalizePropertyFromApi)
      .filter((x): x is PropertyFeedItem => x != null);
    const total = extractFeedTotal(data, list.length);
    if (process.env.NEXT_PUBLIC_DEBUG_LISTINGS === '1' && list.length > 0) {
      const p = list[0];
      // eslint-disable-next-line no-console
      console.log('PROPERTY FEED ITEM (normalized)', {
        id: p.id,
        title: p.title,
        price: p.price,
        cover: p.cover,
        imageUrl: p.imageUrl,
        thumbnail: p.thumbnail,
        coverImage: p.coverImage,
        photos: p.photos,
        images: p.images,
        mediaLen: p.media?.length ?? 0,
      });
    }
    const payload = { items: list, total: Math.max(total, list.length) };
    if (path === '/properties' || path.endsWith('/properties')) {
      // eslint-disable-next-line no-console
      console.log('CLASSIC LISTINGS RESPONSE', payload);
      // eslint-disable-next-line no-console
      console.log('CLASSIC LISTINGS NORMALIZED', list);
    }
    return payload;
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Feed] GET error', url, err);
    }
    return { items: [], total: 0 };
  } finally {
    clearTimeout(timeout);
  }
}
