import {
  safeNormalizePropertyFromApi,
  type PropertyFeedItem,
} from '@/types/property';

const FETCH_TIMEOUT_MS = 12_000;

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
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Feed] GET failed', url, res.status);
      }
      return { items: [], total: 0 };
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return { items: [], total: 0 };
    }

    let rawItems: unknown[] = [];
    let total = 0;
    if (Array.isArray(data)) {
      rawItems = data;
      total = data.length;
    } else if (data && typeof data === 'object') {
      const o = data as Record<string, unknown>;
      rawItems = Array.isArray(o.items) ? o.items : [];
      total =
        typeof o.total === 'number' && Number.isFinite(o.total) && o.total >= 0
          ? Math.trunc(o.total)
          : rawItems.length;
    } else {
      return { items: [], total: 0 };
    }

    const list = rawItems
      .map(safeNormalizePropertyFromApi)
      .filter((x): x is PropertyFeedItem => x != null);
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
    return { items: list, total: Math.max(total, list.length) };
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Feed] GET error', url, err);
    }
    return { items: [], total: 0 };
  } finally {
    clearTimeout(timeout);
  }
}
