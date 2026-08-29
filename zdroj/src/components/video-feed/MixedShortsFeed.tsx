'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CyclicFeedViewport,
  type CyclicFeedNav,
} from '@/components/feed/CyclicFeedViewport';
import { ShortsFeedNavProvider } from '@/components/shorts/shorts-feed-nav-context';
import { useGuestRegistrationGate } from '@/hooks/use-guest-registration-gate';
import { isShortVideoPlayable, shortVideoPlayableSrc } from '@/lib/feed/loop-feed';
import {
  isPropertyShortsItem,
  shortsPayloadToShortVideo,
  type ShortsFeedItem,
} from '@/lib/shorts-feed';
import VideoCard from './VideoCard';
import { ShortsContentCard } from './ShortsContentCard';

type MixedShortsFeedProps = {
  items: ShortsFeedItem[];
  onMobileFiltersOpen?: () => void;
  onLoadMore?: () => void;
  loadingMore?: boolean;
};

const noopNav: CyclicFeedNav = {
  goNext: () => undefined,
  goPrev: () => undefined,
  total: 0,
  currentIndex: 0,
};

export function MixedShortsFeed({
  items,
  onMobileFiltersOpen,
  onLoadMore,
  loadingMore = false,
}: MixedShortsFeedProps) {
  const { reportGuestListingViewed } = useGuestRegistrationGate();
  const [nav, setNav] = useState<CyclicFeedNav>(noopNav);

  const playableItems = useMemo(
    () =>
      items.filter((item) => {
        if (isPropertyShortsItem(item)) {
          const video = shortsPayloadToShortVideo(item.payload);
          return video != null && isShortVideoPlayable(video);
        }
        const imageUrl = item.payload.imageUrl;
        if (item.contentType === 'youtube') {
          return Boolean(item.payload.youtubeVideoId);
        }
        return typeof imageUrl === 'string' && imageUrl.trim().length > 0;
      }),
    [items],
  );

  const handleNavigation = useCallback((api: CyclicFeedNav) => {
    setNav(api);
  }, []);

  useEffect(() => {
    if (!onLoadMore || loadingMore) return;
    if (nav.currentIndex >= playableItems.length - 4) {
      onLoadMore();
    }
  }, [nav.currentIndex, playableItems.length, onLoadMore, loadingMore]);

  const onGuestVideoViewed = useCallback(
    (videoId: string) => {
      reportGuestListingViewed(videoId);
    },
    [reportGuestListingViewed],
  );

  if (playableItems.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 bg-black px-4 text-center lg:bg-white">
        <p className="text-sm font-medium text-white/85 lg:text-zinc-800">
          Žádný obsah pro Shorts feed
        </p>
        <p className="max-w-xs text-xs leading-relaxed text-white/55 lg:text-zinc-500">
          Zkuste upravit filtry nebo se vraťte později.
        </p>
      </div>
    );
  }

  return (
    <ShortsFeedNavProvider value={{ goNext: nav.goNext, goPrev: nav.goPrev }}>
      <div className="flex min-h-0 w-full flex-1 flex-col">
        <CyclicFeedViewport
          items={playableItems}
          getId={(item) => item.feedKey}
          debugLabel="MIXED_SHORTS"
          prefetchSrc={(item) => {
            if (!isPropertyShortsItem(item)) return null;
            const video = shortsPayloadToShortVideo(item.payload);
            return video ? shortVideoPlayableSrc(video) : null;
          }}
          onNavigation={handleNavigation}
          className="min-h-0 flex-1 overflow-hidden overscroll-none pb-[env(safe-area-inset-bottom)] pt-0"
          viewportClassName="h-full min-h-0 max-md:min-h-[calc(100dvh-3.75rem)]"
          slideClassName="shorts-slide overflow-hidden rounded-none bg-[#111] md:rounded-xl lg:bg-white lg:shadow-sm max-md:scroll-snap-align-start max-md:min-h-[100dvh]"
        >
          {(item, { isActive }) => (
            <div data-shorts-slide={item.feedKey} className="h-full w-full max-md:min-h-[100dvh]">
              {isPropertyShortsItem(item) ? (
                (() => {
                  const video = shortsPayloadToShortVideo(item.payload);
                  if (!video) return null;
                  return (
                    <VideoCard
                      video={video}
                      isActive={isActive}
                      onMobileFiltersOpen={onMobileFiltersOpen}
                      onGuestVideoViewed={onGuestVideoViewed}
                    />
                  );
                })()
              ) : (
                <ShortsContentCard item={item} isActive={isActive} />
              )}
            </div>
          )}
        </CyclicFeedViewport>
        {loadingMore ? (
          <p className="pointer-events-none absolute bottom-2 left-0 right-0 text-center text-[11px] text-white/50 lg:text-zinc-400">
            Načítám další…
          </p>
        ) : null}
      </div>
    </ShortsFeedNavProvider>
  );
}
