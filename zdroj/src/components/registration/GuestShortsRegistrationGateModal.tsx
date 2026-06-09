'use client';

import Link from 'next/link';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import type { PublicRegistrationGateSettings } from '@/lib/registration-gate';
import { LoopingVideoWithSound } from './LoopingVideoWithSound';

type Props = {
  settings: PublicRegistrationGateSettings;
};

export function GuestShortsRegistrationGateModal({ settings }: Props) {
  const isVideo = settings.gateType.toUpperCase() === 'VIDEO';
  const bannerSrc = settings.bannerImageUrl
    ? nestAbsoluteAssetUrl(settings.bannerImageUrl)
    : '';
  const videoSrc = settings.videoUrl ? nestAbsoluteAssetUrl(settings.videoUrl) : '';
  const registerLabel = settings.buttonText?.trim() || 'Založit účet';

  return (
    <div
      className="fixed inset-0 z-[500] flex flex-col bg-gradient-to-b from-zinc-950 via-[#1a0a00] to-black"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-registration-gate-title"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {isVideo && videoSrc ? (
          <div className="relative min-h-0 flex-1 bg-black">
            <LoopingVideoWithSound
              src={videoSrc}
              className="h-full w-full"
              videoClassName="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-5 pb-4 pt-16">
              <h2
                id="guest-registration-gate-title"
                className="text-2xl font-bold text-white drop-shadow-md"
              >
                {settings.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-white/90">{settings.description}</p>
            </div>
          </div>
        ) : (
          <div
            className="relative flex min-h-0 flex-1 flex-col justify-end bg-gradient-to-br from-[#ff6a00] via-[#ff4500] to-[#c41e00] p-6"
            style={
              bannerSrc
                ? {
                    backgroundImage: `linear-gradient(to top, rgba(0,0,0,0.82), rgba(0,0,0,0.35)), url(${bannerSrc})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }
                : undefined
            }
          >
            <div>
              <h2
                id="guest-registration-gate-title"
                className="text-2xl font-bold text-white drop-shadow-md sm:text-3xl"
              >
                {settings.title}
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-white/90 sm:text-base">
                {settings.description}
              </p>
            </div>
          </div>
        )}

        <div className="shrink-0 space-y-3 border-t border-orange-500/20 bg-zinc-950/95 px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] backdrop-blur sm:mx-auto sm:mb-6 sm:max-w-lg sm:rounded-3xl sm:border sm:border-orange-500/30 sm:shadow-2xl">
          {isVideo ? null : (
            <div className="sm:hidden">
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-400">
                XXrealit
              </p>
            </div>
          )}

          <Link
            href="/registrace"
            className="flex w-full items-center justify-center rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-orange-900/40 transition hover:brightness-110"
          >
            {registerLabel}
          </Link>

          <Link
            href="/login"
            className="flex w-full items-center justify-center rounded-full border-2 border-orange-400/60 bg-transparent px-5 py-3.5 text-sm font-bold text-orange-100 transition hover:bg-orange-500/10"
          >
            Přihlásit se
          </Link>
        </div>
      </div>
    </div>
  );
}
