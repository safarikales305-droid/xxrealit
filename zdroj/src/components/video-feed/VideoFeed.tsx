'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CyclicFeedViewport } from '@/components/feed/CyclicFeedViewport';
import { useAuth } from '@/hooks/use-auth';
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
 * Shorts feed — TikTok/Reels slide animace, cyklická navigace modulo.
 */
export function VideoFeed({ videos, onMobileFiltersOpen }: VideoFeedProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const [gateSettings, setGateSettings] = useState<PublicRegistrationGateSettings | null>(null);
  const [gateOpen, setGateOpen] = useState(false);

  const feedVideos = useMemo(
    () => videos.filter((v) => isShortVideoPlayable(v)),
    [videos],
  );

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
      <CyclicFeedViewport
        items={feedVideos}
        getId={(v) => v.id}
        debugLabel="SHORTS"
        className="min-h-0 flex-1 overflow-hidden overscroll-none pb-[env(safe-area-inset-bottom)] pt-0"
        viewportClassName="h-full min-h-0 max-md:min-h-[calc(100dvh-3.75rem)]"
        slideClassName="overflow-hidden rounded-none bg-black md:rounded-xl lg:bg-white lg:shadow-sm"
      >
        {(video) => (
          <div
            data-video-slide={video.id}
            className="h-full w-full"
          >
            <VideoCard
              video={video}
              onMobileFiltersOpen={onMobileFiltersOpen}
              onGuestVideoViewed={onGuestVideoViewed}
            />
          </div>
        )}
      </CyclicFeedViewport>
      {gateOpen && gateSettings ? (
        <GuestShortsRegistrationGateModal settings={gateSettings} />
      ) : null}
    </div>
  );
}
