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
  } = {},
): Promise<PropertyFeedItem[]> {
  const path = options.path ?? '/properties';
  const url = `${base}${path}`;
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
      return [];
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return [];
    }

    if (!Array.isArray(data)) return [];

    return data
      .map(safeNormalizePropertyFromApi)
      .filter((x): x is PropertyFeedItem => x != null);
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Feed] GET error', url, err);
    }
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
