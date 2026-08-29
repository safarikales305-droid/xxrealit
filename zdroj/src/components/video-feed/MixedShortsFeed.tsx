'use client';

import { Component, type ErrorInfo, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  CyclicFeedViewport,
  type CyclicFeedNav,
} from '@/components/feed/CyclicFeedViewport';
import { ShortsFeedNavProvider } from '@/components/shorts/shorts-feed-nav-context';
import { useGuestRegistrationGate } from '@/hooks/use-guest-registration-gate';
import { isShortVideoPlayable, shortVideoPlayableSrc } from '@/lib/feed/loop-feed';
import {
  isPropertyShortsItem,
  isRenderableShortsItem,
  normalizeShortsFeedItem,
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

type SlideErrorBoundaryProps = {
  feedKey: string;
  onSkip: (feedKey: string) => void;
  children: ReactNode;
};

type SlideErrorBoundaryState = { hasError: boolean };

class SlideErrorBoundary extends Component<SlideErrorBoundaryProps, SlideErrorBoundaryState> {
  state: SlideErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): SlideErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.warn('[MixedShortsFeed] slide render failed', this.props.feedKey, error, info);
    }
    this.props.onSkip(this.props.feedKey);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export function MixedShortsFeed({
  items,
  onMobileFiltersOpen,
  onLoadMore,
  loadingMore = false,
}: MixedShortsFeedProps) {
  const { reportGuestListingViewed } = useGuestRegistrationGate();
  const [nav, setNav] = useState<CyclicFeedNav>(noopNav);
  const [skippedKeys, setSkippedKeys] = useState<Set<string>>(() => new Set());

  const skipItem = useCallback((feedKey: string) => {
    setSkippedKeys((prev) => {
      if (prev.has(feedKey)) return prev;
      const next = new Set(prev);
      next.add(feedKey);
      return next;
    });
  }, []);

  const renderableItems = useMemo(
    () =>
      items
        .map((item) => normalizeShortsFeedItem(item))
        .filter((item) => isRenderableShortsItem(item) && !skippedKeys.has(item.feedKey)),
    [items, skippedKeys],
  );

  const handleNavigation = useCallback((api: CyclicFeedNav) => {
    setNav(api);
  }, []);

  useEffect(() => {
    if (!onLoadMore || loadingMore) return;
    if (nav.currentIndex >= renderableItems.length - 4) {
      onLoadMore();
    }
  }, [nav.currentIndex, renderableItems.length, onLoadMore, loadingMore]);

  const onGuestVideoViewed = useCallback(
    (videoId: string) => {
      reportGuestListingViewed(videoId);
    },
    [reportGuestListingViewed],
  );

  if (renderableItems.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 bg-zinc-100 px-4 text-center lg:bg-white">
        <p className="text-sm font-medium text-zinc-800">
          Žádný obsah pro Shorts feed
        </p>
        <p className="max-w-xs text-xs leading-relaxed text-zinc-500">
          Zkuste upravit filtry nebo se vraťte později.
        </p>
      </div>
    );
  }

  return (
    <ShortsFeedNavProvider value={{ goNext: nav.goNext, goPrev: nav.goPrev }}>
      <div className="flex min-h-0 w-full flex-1 flex-col">
        <CyclicFeedViewport
          items={renderableItems}
          getId={(item) => item.feedKey}
          debugLabel="MIXED_SHORTS"
          prefetchSrc={(item) => {
            if (!isPropertyShortsItem(item)) return null;
            const video = shortsPayloadToShortVideo(item.payload);
            return video ? shortVideoPlayableSrc(video) : null;
          }}
          onNavigation={handleNavigation}
          className="min-h-0 flex-1 overflow-hidden overscroll-none pb-[env(safe-area-inset-bottom)] pt-0"
          viewportClassName="h-full min-h-0"
          slideClassName="shorts-slide h-full min-h-0 overflow-hidden rounded-none bg-zinc-100 md:rounded-xl lg:bg-white lg:shadow-sm"
        >
          {(item, { isActive }) => (
            <SlideErrorBoundary feedKey={item.feedKey} onSkip={skipItem}>
              <div data-shorts-slide={item.feedKey} className="h-full min-h-0 w-full">
                {isPropertyShortsItem(item) ? (
                  (() => {
                    const video = shortsPayloadToShortVideo(item.payload);
                    if (!video || !isShortVideoPlayable(video)) {
                      return null;
                    }
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
                  <ShortsContentCard item={item} isActive={isActive} onSkip={() => skipItem(item.feedKey)} />
                )}
              </div>
            </SlideErrorBoundary>
          )}
        </CyclicFeedViewport>
        {loadingMore ? (
          <p className="pointer-events-none absolute bottom-2 left-0 right-0 text-center text-[11px] text-zinc-400">
            Načítám další…
          </p>
        ) : null}
      </div>
    </ShortsFeedNavProvider>
  );
}
