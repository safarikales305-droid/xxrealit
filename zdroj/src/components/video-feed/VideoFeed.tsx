'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useCyclicFeedNavigation } from '@/hooks/use-cyclic-feed-navigation';
import {
  incrementGuestShortsView,
  resetGuestShortsViews,
} from '@/lib/guest-shorts-views';
import type { ShortVideo } from '@/lib/nest-client';
import {
  fetchRegistrationGateSettings,
  type PublicRegistrationGateSettings,
} from '@/lib/registration-gate';
import { isShortVideoPlayable } from '@/lib/feed/loop-feed';
import { GuestShortsRegistrationGateModal } from '@/components/registration/GuestShortsRegistrationGateModal';
import VideoCard from './VideoCard';

type VideoFeedProps = {
  /** Pořadí z rodiče (např. sdílené video první); bez interního přerovnání. */
  videos: ShortVideo[];
  /** Mobil shorts: otevře stejný panel filtrů jako v klasickém režimu (tlačítko ve videu). */
  onMobileFiltersOpen?: () => void;
};

/**
 * Shorts feed — jeden slide, cyklická navigace modulo (dolů i nahoru).
 * Vyřadí jen inzeráty bez jakékoliv video URL.
 */
export function VideoFeed({ videos, onMobileFiltersOpen }: VideoFeedProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const [gateSettings, setGateSettings] = useState<PublicRegistrationGateSettings | null>(null);
  const [gateOpen, setGateOpen] = useState(false);

  const feedVideos = useMemo(
    () => videos.filter((v) => isShortVideoPlayable(v)),
    [videos],
  );

  const { currentItem, containerRef } = useCyclicFeedNavigation(feedVideos, {
    debugLabel: 'SHORTS',
    getId: (v) => v.id,
  });

  useEffect(() => {
    if (isLoading || isAuthenticated) {
      setGateSettings(null);
      setGateOpen(false);
      return;
    }
    void fetchRegistrationGateSettings().then((s) => setGateSettings(s));
  }, [isAuthenticated, isLoading]);

  const onGuestVideoViewed = useCallback(
    (_videoId: string) => {
      if (isLoading || isAuthenticated || !gateSettings?.shortsGateEnabled) return;
      if (gateOpen) return;

      const gateEvery = gateSettings.shortsGateAfterViews || 4;
      const views = incrementGuestShortsView();

      if (views >= gateEvery) {
        resetGuestShortsViews();
        setGateOpen(true);
      }
    },
    [gateOpen, gateSettings, isAuthenticated, isLoading],
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
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div
        ref={containerRef}
        tabIndex={-1}
        className="min-h-0 flex-1 overflow-hidden overscroll-none pb-[env(safe-area-inset-bottom)] pt-0 outline-none"
      >
        {currentItem ? (
          <div
            key={currentItem.id}
            data-video-slide={currentItem.id}
            className="h-full min-h-0 w-full overflow-hidden rounded-none bg-black max-md:min-h-[calc(100dvh-3.75rem)] md:rounded-xl lg:bg-white lg:shadow-sm"
          >
            <VideoCard
              video={currentItem}
              onMobileFiltersOpen={onMobileFiltersOpen}
              onGuestVideoViewed={onGuestVideoViewed}
            />
          </div>
        ) : null}
      </div>
      {gateOpen && gateSettings ? (
        <GuestShortsRegistrationGateModal settings={gateSettings} />
      ) : null}
    </div>
  );
}
