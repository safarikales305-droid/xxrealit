import { Suspense } from 'react';
import { HomeLayout } from '@/components/home/home-layout';
import { ShortsFeed } from '@/components/ShortsFeed';
import { getServerSideApiBaseUrl } from '@/lib/api';
import { loadPropertyFeedItems } from '@/lib/load-feed';
import { classicListingsOnly } from '@/lib/property-feed-filters';
import type { PropertyFeedItem } from '@/types/property';

/** Server-render on every request when an API URL is configured. */
export const dynamic = 'force-dynamic';

type SearchParamsInput = Record<string, string | string[] | undefined>;

function firstQuery(sp: SearchParamsInput, key: string): string | undefined {
  const v = sp[key];
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v[0];
  return undefined;
}

function buildPropertiesQueryString(sp: SearchParamsInput): string {
  const out = new URLSearchParams();
  const ptype = firstQuery(sp, 'ptype')?.trim();
  /** Backend očekává kanonické klíče (byt, dum, …) — sjednotit velikost písmen z URL. */
  if (ptype) out.set('propertyTypeKey', ptype.toLowerCase());
  const cities = firstQuery(sp, 'cities')?.trim();
  if (cities) out.set('cities', cities);
  const priceMin = firstQuery(sp, 'priceMin')?.trim();
  if (priceMin) out.set('priceMin', priceMin);
  const priceMax = firstQuery(sp, 'priceMax')?.trim();
  if (priceMax) out.set('priceMax', priceMax);
  return out.toString();
}

async function loadHomeFeed(sp: SearchParamsInput): Promise<{
  items: PropertyFeedItem[];
  total: number;
}> {
  const base = getServerSideApiBaseUrl();
  if (!base) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        '[Home] Skipping feed: set NEXT_PUBLIC_API_URL (and API_URL for BFF routes).',
      );
    }
    return { items: [], total: 0 };
  }

  const query = buildPropertiesQueryString(sp);

  /** Tab Klasik — veřejný katalog GET /properties bez JWT (nepřihlášení i přihlášení). */
  const classicFeed = await loadPropertyFeedItems(base, {
    path: '/properties',
    query: query || undefined,
  });
  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.log('CLASSIC LISTINGS RESPONSE', {
      total: classicFeed.total,
      items: classicFeed.items.length,
      sample: classicFeed.items[0]?.id ?? null,
    });
  }
  return classicFeed;
}

type HomePageProps = {
  searchParams?: Promise<SearchParamsInput>;
};

export default async function Home({ searchParams }: HomePageProps) {
  const sp = (await searchParams) ?? {};
  const base = getServerSideApiBaseUrl();
  const feed = await loadHomeFeed(sp);
  const items = classicListingsOnly(feed.items);
  const classicTotal = items.length;
  const apiConfigMissing =
    process.env.NODE_ENV === 'production' && base == null;

  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center bg-[#fafafa] text-zinc-600">
          Načítám…
        </div>
      }
    >
      <HomeLayout
        items={items}
        classicTotal={classicTotal}
        ShortsFeed={ShortsFeed}
        apiConfigMissing={apiConfigMissing}
      />
    </Suspense>
  );
}
