'use client';

import { useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import { FacebookAuthButton } from '@/components/auth/FacebookAuthButton';
import type { PublicRegistrationGateSettings } from '@/lib/registration-gate';
import { GuestGateAuthPanel } from './GuestGateAuthPanel';
import { LoopingVideoWithSound } from './LoopingVideoWithSound';

type Props = {
  settings: PublicRegistrationGateSettings;
};

type AuthMode = 'login' | 'register' | null;

export function GuestShortsRegistrationGateModal({ settings }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const returnTo = `${pathname ?? '/'}${searchParams?.toString() ? `?${searchParams.toString()}` : ''}`;
  const [authMode, setAuthMode] = useState<AuthMode>(null);

  const isVideo = settings.gateType.toUpperCase() === 'VIDEO';
  const bannerSrc = settings.bannerImageUrl
    ? nestAbsoluteAssetUrl(settings.bannerImageUrl)
    : '';
  const videoSrc = settings.videoUrl ? nestAbsoluteAssetUrl(settings.videoUrl) : '';

  return (
    <>
      <div
        className="registration-gate-overlay fixed inset-0 z-[9999] flex flex-col items-stretch justify-end bg-black/55 backdrop-blur-[2px] sm:items-center sm:justify-center sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-registration-gate-title"
      >
        <div className="registration-gate-modal relative flex w-full max-w-[430px] flex-col overflow-hidden bg-zinc-950 sm:max-h-[min(90vh,820px)] sm:rounded-[28px] sm:shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
          {isVideo && videoSrc ? (
            <div className="pointer-events-none relative h-[min(52dvh,calc(100dvh-240px))] shrink-0 overflow-hidden bg-black sm:h-[min(58dvh,520px)]">
              <LoopingVideoWithSound
                src={videoSrc}
                className="h-full w-full"
                videoClassName="pointer-events-none h-full w-full object-cover"
                muteButtonClassName="pointer-events-auto"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-4 pb-3 pt-10 sm:px-5 sm:pb-4 sm:pt-14">
                <h2
                  id="guest-registration-gate-title"
                  className="text-xl font-bold text-white drop-shadow-md sm:text-2xl"
                >
                  {settings.title}
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-white/90 sm:mt-2 sm:text-sm">
                  {settings.description}
                </p>
              </div>
            </div>
          ) : (
            <div
              className="relative flex h-[min(52dvh,calc(100dvh-240px))] shrink-0 flex-col justify-end bg-gradient-to-br from-[#ff6a00] via-[#ff4500] to-[#c41e00] p-5 sm:h-[min(58dvh,520px)] sm:p-6"
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
                  className="text-xl font-bold text-white drop-shadow-md sm:text-2xl"
                >
                  {settings.title}
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-white/90 sm:mt-3 sm:text-sm">
                  {settings.description}
                </p>
              </div>
            </div>
          )}

          <div className="relative z-30 shrink-0 space-y-2.5 border-t border-orange-500/20 bg-zinc-950 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:space-y-3 sm:px-5 sm:py-4">
            <button
              type="button"
              onClick={() => setAuthMode('register')}
              className="flex w-full items-center justify-center rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-4 py-3 text-sm font-bold text-white shadow-lg shadow-orange-900/40 transition hover:brightness-110 sm:px-5 sm:py-3.5"
            >
              Registrovat
            </button>
            <button
              type="button"
              onClick={() => setAuthMode('login')}
              className="flex w-full items-center justify-center rounded-full border-2 border-orange-400/60 bg-transparent px-4 py-3 text-sm font-bold text-orange-100 transition hover:bg-orange-500/10 sm:px-5 sm:py-3.5"
            >
              Přihlásit
            </button>
            <FacebookAuthButton
              label="Přihlásit přes Facebook"
              event="facebook_login_click"
              className="[&_button]:rounded-full [&_button]:py-3 sm:[&_button]:py-3.5"
            />
          </div>
        </div>
      </div>

      {authMode ? (
        <GuestGateAuthPanel
          mode={authMode}
          returnTo={returnTo}
          onClose={() => setAuthMode(null)}
          onSwitchMode={setAuthMode}
        />
      ) : null}
    </>
  );
}
