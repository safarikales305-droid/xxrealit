'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  CyclicFeedViewport,
  type CyclicFeedNav,
} from '@/components/feed/CyclicFeedViewport';
import {
  ShortsFeedNavProvider,
} from '@/components/shorts/shorts-feed-nav-context';
import { useGuestRegistrationGate } from '@/hooks/use-guest-registration-gate';
import type { ShortVideo } from '@/lib/nest-client';
import { isShortVideoPlayable, shortVideoPlayableSrc } from '@/lib/feed/loop-feed';
import VideoCard from './VideoCard';

type VideoFeedProps = {
  videos: ShortVideo[];
  onMobileFiltersOpen?: () => void;
};

const noopNav: CyclicFeedNav = {
  goNext: () => undefined,
  goPrev: () => undefined,
  total: 0,
  currentIndex: 0,
};

export function VideoFeed({ videos, onMobileFiltersOpen }: VideoFeedProps) {
  const { reportGuestListingViewed } = useGuestRegistrationGate();
  const [nav, setNav] = useState<CyclicFeedNav>(noopNav);

  const feedVideos = useMemo(
    () => videos.filter((v) => isShortVideoPlayable(v)),
    [videos],
  );

  const handleNavigation = useCallback((api: CyclicFeedNav) => {
    setNav(api);
  }, []);

  const onGuestVideoViewed = useCallback(
    (videoId: string) => {
      reportGuestListingViewed(videoId);
    },
    [reportGuestListingViewed],
  );

  if (feedVideos.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 bg-black px-4 text-center lg:bg-white">
        <p className="text-sm font-medium text-white/85 lg:text-zinc-800">
          Žádné platné video inzeráty
        </p>
        <p className="max-w-xs text-xs leading-relaxed text-white/55 lg:text-zinc-500">
          Záznamy bez funkčního videa jsou skryté. Zkuste upravit filtry nebo se vraťte později.
        </p>
      </div>
    );
  }

  return (
    <ShortsFeedNavProvider value={{ goNext: nav.goNext, goPrev: nav.goPrev }}>
      <div className="flex min-h-0 w-full flex-1 flex-col">
        <CyclicFeedViewport
          items={feedVideos}
          getId={(v) => v.id}
          debugLabel="SHORTS"
          prefetchSrc={(v) => shortVideoPlayableSrc(v)}
          onNavigation={handleNavigation}
          className="min-h-0 flex-1 overflow-hidden overscroll-none pb-[env(safe-area-inset-bottom)] pt-0"
          viewportClassName="h-full min-h-0 max-md:min-h-[calc(100dvh-3.75rem)]"
          slideClassName="shorts-slide overflow-hidden rounded-none bg-[#111] md:rounded-xl lg:bg-white lg:shadow-sm"
        >
          {(video, { isActive }) => (
            <div data-video-slide={video.id} className="h-full w-full">
              <VideoCard
                video={video}
                isActive={isActive}
                onMobileFiltersOpen={onMobileFiltersOpen}
                onGuestVideoViewed={onGuestVideoViewed}
              />
            </div>
          )}
        </CyclicFeedViewport>
      </div>
    </ShortsFeedNavProvider>
  );
}
