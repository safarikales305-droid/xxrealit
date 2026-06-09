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
      className="registration-gate-overlay fixed inset-0 z-[9999] flex flex-col bg-gradient-to-b from-zinc-950 via-[#1a0a00] to-black max-[768px]:flex-col min-[769px]:items-center min-[769px]:justify-center min-[769px]:bg-black/45 min-[769px]:from-transparent min-[769px]:via-transparent min-[769px]:to-transparent min-[769px]:p-4 min-[769px]:backdrop-blur-[14px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-registration-gate-title"
    >
      <div className="registration-gate-modal flex h-full min-h-0 w-full flex-col bg-zinc-950 min-[769px]:h-auto min-[769px]:max-h-[90vh] min-[769px]:w-[min(430px,92vw)] min-[769px]:overflow-hidden min-[769px]:rounded-[28px] min-[769px]:shadow-[0_30px_80px_rgba(0,0,0,0.35)] min-[769px]:[aspect-ratio:9/16]">
        {isVideo && videoSrc ? (
          <div className="relative min-h-0 flex-1 bg-black">
            <LoopingVideoWithSound
              src={videoSrc}
              className="h-full w-full"
              videoClassName="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-4 pb-3 pt-12 min-[769px]:px-5 min-[769px]:pb-4 min-[769px]:pt-14">
              <h2
                id="guest-registration-gate-title"
                className="text-xl font-bold text-white drop-shadow-md min-[769px]:text-2xl"
              >
                {settings.title}
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-white/90 min-[769px]:mt-2 min-[769px]:text-sm">
                {settings.description}
              </p>
            </div>
          </div>
        ) : (
          <div
            className="relative flex min-h-0 flex-1 flex-col justify-end bg-gradient-to-br from-[#ff6a00] via-[#ff4500] to-[#c41e00] p-5 min-[769px]:p-6"
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
                className="text-xl font-bold text-white drop-shadow-md min-[769px]:text-2xl"
              >
                {settings.title}
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-white/90 min-[769px]:mt-3 min-[769px]:text-sm">
                {settings.description}
              </p>
            </div>
          </div>
        )}

        <div className="shrink-0 space-y-2.5 border-t border-orange-500/20 bg-zinc-950/95 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur min-[769px]:space-y-3 min-[769px]:px-5 min-[769px]:py-4">
          <Link
            href="/registrace"
            className="flex w-full items-center justify-center rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-4 py-3 text-sm font-bold text-white shadow-lg shadow-orange-900/40 transition hover:brightness-110 min-[769px]:px-5 min-[769px]:py-3.5"
          >
            {registerLabel}
          </Link>

          <Link
            href="/login"
            className="flex w-full items-center justify-center rounded-full border-2 border-orange-400/60 bg-transparent px-4 py-3 text-sm font-bold text-orange-100 transition hover:bg-orange-500/10 min-[769px]:px-5 min-[769px]:py-3.5"
          >
            Přihlásit se
          </Link>
        </div>
      </div>
    </div>
  );
}
