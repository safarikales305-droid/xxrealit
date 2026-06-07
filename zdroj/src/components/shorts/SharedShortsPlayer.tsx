'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GuestShortsCta } from '@/components/shorts/GuestShortsCta';
import { ShortsSoundToggle } from '@/components/shorts/ShortsSoundToggle';
import { useAuth } from '@/hooks/use-auth';
import { useShortsVideoSound } from '@/hooks/use-shorts-video-sound';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import type { PublicShortsListing } from '@/lib/shorts-listing-video';

type Props = {
  listing: PublicShortsListing;
  detailHref: string;
};

export function SharedShortsPlayer({ listing, detailHref }: Props) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [needsPlayButton, setNeedsPlayButton] = useState(false);
  const [videoError, setVideoError] = useState(false);

  const videoSrc = listing.videoUrl ? nestAbsoluteAssetUrl(listing.videoUrl) : '';
  const imageSrc = listing.imageUrl ? nestAbsoluteAssetUrl(listing.imageUrl) : '';
  const showVideo = Boolean(videoSrc) && !videoError;

  const { muted, toggleSound } = useShortsVideoSound(videoRef, {
    enabled: showVideo,
    videoKey: videoSrc,
  });

  const tryAutoplayMuted = useCallback(() => {
    const el = videoRef.current;
    if (!el || !videoSrc) return;
    if (!muted) {
      el.muted = false;
      el.volume = 1;
    } else {
      el.muted = true;
    }
    void el.play()
      .then(() => setNeedsPlayButton(false))
      .catch(() => setNeedsPlayButton(true));
  }, [muted, videoSrc]);

  useEffect(() => {
    if (!showVideo) return;
    tryAutoplayMuted();
  }, [showVideo, tryAutoplayMuted]);

  function handleBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/?tab=shorts');
  }

  return (
    <div className="flex min-h-[100dvh] w-full flex-col items-center justify-center bg-zinc-950">
      <header className="absolute inset-x-0 top-0 z-[70] flex flex-wrap items-center justify-between gap-2 p-3">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex rounded-full border border-white/30 bg-black/55 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-md hover:bg-black/75"
        >
          ← Zpět
        </button>
        <Link
          href={detailHref}
          className="inline-flex rounded-full border border-orange-400/60 bg-orange-600/90 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur-md hover:bg-orange-600"
        >
          Zobrazit detail inzerátu
        </Link>
      </header>

      <div className="flex w-full flex-1 items-center justify-center px-0 py-14 md:px-4">
        <div className="shorts-video-stage relative h-[100dvh] w-full max-w-[100vw] overflow-hidden bg-zinc-900 md:h-auto md:max-h-[calc(100vh-80px)] md:w-full md:max-w-[430px] md:aspect-[9/16] md:rounded-2xl md:shadow-2xl">
          {showVideo ? (
            <>
              <video
                ref={videoRef}
                src={videoSrc}
                autoPlay
                muted={muted}
                playsInline
                loop
                preload="auto"
                className="h-full w-full object-cover"
                onLoadedData={() => tryAutoplayMuted()}
                onError={() => setVideoError(true)}
              />
              {needsPlayButton ? (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/35">
                  <button
                    type="button"
                    onClick={() => {
                      setNeedsPlayButton(false);
                      tryAutoplayMuted();
                    }}
                    className="rounded-full bg-orange-600 px-6 py-3 text-sm font-bold text-white shadow-lg hover:bg-orange-700"
                  >
                    Přehrát video
                  </button>
                </div>
              ) : null}
              {!isLoading && !isAuthenticated ? <GuestShortsCta /> : null}
              <ShortsSoundToggle
                variant="overlay"
                className="shorts-rail-sound"
                muted={muted}
                onToggle={toggleSound}
              />
            </>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-zinc-900 px-4 text-center">
              {imageSrc ? (
                <img
                  src={imageSrc}
                  alt={listing.title}
                  className="max-h-[55dvh] w-full max-w-full rounded-xl object-cover md:max-h-[70%]"
                />
              ) : null}
              <p className="text-base font-semibold text-white">{listing.title}</p>
              {listing.city ? <p className="text-sm text-white/70">{listing.city}</p> : null}
              <p className="text-sm text-white/60">Video není dostupné</p>
              <Link
                href={detailHref}
                className="rounded-full bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-700"
              >
                Zobrazit inzerát
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
