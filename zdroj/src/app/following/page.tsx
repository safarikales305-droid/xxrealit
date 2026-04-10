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

  const items =
    base && authorization
      ? await loadPropertyFeedItems(base, {
          authorization,
          path: '/properties/following',
        })
      : [];

  return (
    <Suspense fallback={<div className="min-h-[50dvh] bg-[#fafafa]" />}>
      <HomeLayout items={classicListingsOnly(items)} ShortsFeed={ShortsFeed} />
    </Suspense>
  );
}
