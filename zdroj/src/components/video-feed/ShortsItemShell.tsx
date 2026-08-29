'use client';

import type { ReactNode } from 'react';
import { DesktopShortsNavButtons } from '@/components/shorts/shorts-feed-nav-context';

type ShortsItemShellProps = {
  badge?: ReactNode;
  leftPanel?: ReactNode;
  center: ReactNode;
  mobileOverlay?: ReactNode;
  rightRail?: ReactNode;
};

export function ShortsItemShell({
  badge,
  leftPanel,
  center,
  mobileOverlay,
  rightRail,
}: ShortsItemShellProps) {
  return (
    <div className="relative isolate flex h-full max-h-full min-h-0 w-full flex-col overflow-hidden bg-black lg:bg-white">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row lg:items-stretch lg:justify-center lg:gap-8 lg:overflow-hidden lg:px-8 lg:py-8">
        {leftPanel ? (
          <div className="hidden min-h-0 w-full min-w-0 max-w-[360px] shrink-0 flex-col gap-4 overflow-hidden lg:flex lg:w-[min(100%,340px)] lg:min-w-[260px] lg:pt-1">
            {leftPanel}
          </div>
        ) : null}

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden lg:max-w-[min(480px,min(46vw,calc((min(88vh,100dvh-9rem))*9/16+2rem)))] lg:shrink-0 lg:items-center lg:justify-center">
          <div className="shorts-video-stage relative min-h-0 flex-1 overflow-hidden max-lg:max-h-full lg:flex lg:h-[min(88vh,calc(100dvh-9rem))] lg:w-[min(100%,calc(min(88vh,100dvh-9rem)*9/16))] lg:max-w-[min(420px,42vw)] lg:flex-none lg:shrink-0 lg:items-center lg:justify-center lg:rounded-xl lg:border lg:border-zinc-200 lg:bg-zinc-950 lg:shadow-[0_24px_70px_rgba(0,0,0,0.18)]">
            {badge ? (
              <div className="pointer-events-none absolute left-3 top-3 z-20 lg:left-4 lg:top-4">{badge}</div>
            ) : null}
            {center}
            {mobileOverlay ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[20] lg:hidden">
                {mobileOverlay}
              </div>
            ) : null}
          </div>
        </div>

        <DesktopShortsNavButtons className="self-center" />

        {rightRail ?? (
          <div className="hidden w-[3.5rem] shrink-0 lg:block" aria-hidden />
        )}
      </div>
    </div>
  );
}
