'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import type { PublicRegistrationGateSettings } from '@/lib/registration-gate';

type Props = {
  settings: PublicRegistrationGateSettings;
  onDismiss: () => void;
};

export function GuestShortsRegistrationGateModal({ settings, onDismiss }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [secondsLeft, setSecondsLeft] = useState(settings.skipAfterSeconds);
  const isVideo = settings.gateType.toUpperCase() === 'VIDEO';
  const canSkip = !isVideo || secondsLeft <= 0;

  useEffect(() => {
    setSecondsLeft(settings.skipAfterSeconds);
  }, [settings.skipAfterSeconds]);

  useEffect(() => {
    if (!isVideo || secondsLeft <= 0) return;
    const timer = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [isVideo, secondsLeft]);

  const startVideo = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = true;
    void el.play().catch(() => {});
  }, []);

  useEffect(() => {
    if (!isVideo) return;
    startVideo();
  }, [isVideo, settings.videoUrl, startVideo]);

  const bannerSrc = settings.bannerImageUrl
    ? nestAbsoluteAssetUrl(settings.bannerImageUrl)
    : '';
  const videoSrc = settings.videoUrl ? nestAbsoluteAssetUrl(settings.videoUrl) : '';

  return (
    <div className="fixed inset-0 z-[500] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
      <div className="relative w-full max-w-lg overflow-hidden rounded-t-3xl bg-zinc-950 shadow-2xl sm:rounded-3xl">
        {isVideo && videoSrc ? (
          <div className="relative aspect-[9/16] max-h-[55dvh] w-full bg-black sm:max-h-[420px]">
            <video
              ref={videoRef}
              src={videoSrc}
              className="h-full w-full object-cover"
              playsInline
              muted
              autoPlay
              onLoadedData={startVideo}
            />
          </div>
        ) : (
          <div
            className="relative flex min-h-[180px] items-end bg-gradient-to-br from-[#ff6a00] via-[#ff4500] to-[#c41e00] p-5 sm:min-h-[220px]"
            style={
              bannerSrc
                ? {
                    backgroundImage: `linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0.25)), url(${bannerSrc})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }
                : undefined
            }
          >
            <div>
              <h2 className="text-xl font-bold text-white drop-shadow-md">{settings.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/90">{settings.description}</p>
            </div>
          </div>
        )}

        <div className="space-y-3 p-5">
          {isVideo ? (
            <>
              <h2 className="text-lg font-bold text-white">{settings.title}</h2>
              <p className="text-sm leading-relaxed text-zinc-300">{settings.description}</p>
            </>
          ) : null}

          <Link
            href="/registrace"
            className="flex w-full items-center justify-center rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:brightness-110"
          >
            {settings.buttonText}
          </Link>

          <button
            type="button"
            disabled={!canSkip}
            onClick={onDismiss}
            className="flex w-full items-center justify-center rounded-full border border-zinc-600 px-5 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {canSkip
              ? 'Pokračovat bez registrace'
              : `Pokračovat můžete za ${secondsLeft} s`}
          </button>
        </div>
      </div>
    </div>
  );
}
