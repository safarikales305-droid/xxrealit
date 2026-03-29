import { HomeLayout } from '@/components/home/home-layout';
import { ShortsFeed } from '@/components/ShortsFeed';
import { getServerSideApiBaseUrl } from '@/lib/api';
import { loadPropertyFeedItems } from '@/lib/load-feed';
import { getServerAuthorizationHeader } from '@/lib/server-bearer';
import type { PropertyFeedItem } from '@/types/property';

/** Server-render on every request when an API URL is configured. */
export const dynamic = 'force-dynamic';

async function loadHomeFeed(): Promise<PropertyFeedItem[]> {
  const base = getServerSideApiBaseUrl();
  if (!base) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        '[Home] Skipping feed: set NEXT_PUBLIC_API_URL on Vercel (server will not use localhost).',
      );
    }
    return [];
  }

  const authorization = await getServerAuthorizationHeader();

  if (authorization) {
    const personalized = await loadPropertyFeedItems(base, {
      authorization,
      path: '/feed/personalized',
    });
    if (personalized.length > 0) {
      return personalized;
    }
  }

  return loadPropertyFeedItems(base, {
    authorization,
    path: '/properties',
  });
}

export default async function Home() {
  const items = await loadHomeFeed();
  return <HomeLayout items={items} ShortsFeed={ShortsFeed} />;
}
