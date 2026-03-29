import { HomeLayout } from '@/components/home/home-layout';
import { ShortsFeed } from '@/components/ShortsFeed';
import { getServerSideApiBaseUrl } from '@/lib/api';
import {
  safeNormalizePropertyFromApi,
  type PropertyFeedItem,
} from '@/types/property';

/** Server-render on every request when an API URL is configured. */
export const dynamic = 'force-dynamic';

const FETCH_TIMEOUT_MS = 12_000;

async function loadFeedItems(): Promise<PropertyFeedItem[]> {
  const base = getServerSideApiBaseUrl();
  if (!base) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        '[Home] Skipping GET /properties: set NEXT_PUBLIC_API_URL on Vercel (server will not use localhost).',
      );
    }
    return [];
  }

  const url = `${base}/properties`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!res.ok) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Home] GET properties failed', url, res.status);
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
      console.warn('[Home] GET properties error', url, err);
    }
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export default async function Home() {
  const items = await loadFeedItems();
  return <HomeLayout items={items} ShortsFeed={ShortsFeed} />;
}
