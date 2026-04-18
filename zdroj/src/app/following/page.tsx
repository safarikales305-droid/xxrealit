import { Suspense } from 'react';
import { HomeLayout } from '@/components/home/home-layout';
import { ShortsFeed } from '@/components/ShortsFeed';
import { getServerSideApiBaseUrl } from '@/lib/api';
import { loadPropertyFeedItems } from '@/lib/load-feed';
import { classicListingsOnly } from '@/lib/property-feed-filters';
import { getServerAuthorizationHeader } from '@/lib/server-bearer';

export const dynamic = 'force-dynamic';

export default async function FollowingPage() {
  const base = getServerSideApiBaseUrl();
  const authorization = await getServerAuthorizationHeader();

  const feed =
    base && authorization
      ? await loadPropertyFeedItems(base, {
          authorization,
          path: '/properties/following',
        })
      : { items: [], total: 0 };

  return (
    <Suspense fallback={<div className="min-h-[50dvh] bg-[#fafafa]" />}>
      <HomeLayout
        items={classicListingsOnly(feed.items)}
        classicTotal={feed.total}
        ShortsFeed={ShortsFeed}
      />
    </Suspense>
  );
}
