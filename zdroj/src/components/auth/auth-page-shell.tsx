'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import Logo from '@/components/Logo';
import { SiteFooter } from '@/components/legal/SiteFooter';
import { AuthDesktopLiveBackdrop } from '@/components/auth/AuthDesktopLiveBackdrop';
import { AuthMobileStoriesPreview } from '@/components/auth/AuthMobileStoriesPreview';
import {
  loadAuthPortalPreviewItems,
  type AuthPortalPreviewItem,
} from '@/lib/auth-portal-preview';

export type AuthShellVariant = 'login' | 'register';

const SUBTITLES: Record<AuthShellVariant, string> = {
  login:
    'Přihlaste se a sledujte nabídky, videoprohlídky i nové příležitosti.',
  register:
    'Vytvořte si účet a objevujte nabídky, videoprohlídky i nové příležitosti na jednom místě.',
};

type AuthPageShellProps = {
  variant: AuthShellVariant;
  children: ReactNode;
};

/**
 * Sdílený layout pro přihlášení a registraci — logo, carousel, kompaktní formulář.
 */
export function AuthPageShell({ variant, children }: AuthPageShellProps) {
  const [previewItems, setPreviewItems] = useState<AuthPortalPreviewItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    void loadAuthPortalPreviewItems(14).then((items) => {
      if (!cancelled) setPreviewItems(items);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-x-hidden bg-slate-950 text-zinc-900">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(234,88,12,0.22),transparent_50%),radial-gradient(ellipse_80%_50%_at_100%_50%,rgba(249,115,22,0.08),transparent_45%),radial-gradient(ellipse_60%_40%_at_0%_80%,rgba(251,146,60,0.07),transparent_40%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/40 via-slate-950/20 to-slate-950"
        aria-hidden
      />

      <AuthDesktopLiveBackdrop items={previewItems} />

      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_65%_55%_at_50%_48%,rgba(15,23,42,0.72),transparent_72%)]"
        aria-hidden
      />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:justify-center sm:px-6 sm:py-10 md:py-14">
        <Link
          href="/"
          className="mb-2 inline-flex w-fit shrink-0 items-center gap-1.5 text-sm font-medium text-white/70 transition hover:text-white sm:mb-6"
        >
          <span aria-hidden>←</span> Zpět na úvod
        </Link>

        <div className="mx-auto w-full max-w-lg flex-1 sm:flex-none">
          <div className="rounded-[1.35rem] border border-white/15 bg-white/[0.97] p-4 shadow-[0_32px_64px_-24px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:rounded-[1.75rem] sm:p-7 md:p-9 md:rounded-[2rem]">
            <header className="flex flex-col items-center text-center">
              <div className="flex items-center gap-2.5 sm:flex-col sm:gap-3">
                <div className="rounded-xl bg-gradient-to-br from-[#ff6a00]/12 to-[#ff3c00]/5 px-3 py-2 ring-1 ring-orange-500/15 sm:rounded-2xl sm:px-5 sm:py-3.5">
                  <Logo className="h-8 w-auto sm:h-11 md:h-12" />
                </div>
                <span className="text-base font-bold tracking-tight text-zinc-900 sm:text-lg md:text-xl">
                  xxrealit
                </span>
              </div>

              <h1 className="mt-3 max-w-md text-xl font-bold tracking-tight text-zinc-900 sm:mt-6 sm:text-3xl md:text-4xl">
                Vítejte ve světě realit
              </h1>

              {variant === 'register' ? (
                <p className="mt-2 max-w-md text-pretty text-sm font-extrabold leading-snug tracking-tight text-zinc-900 sm:mt-4 sm:text-lg md:text-xl">
                  Prohlížení inzerátů je plně zdarma
                </p>
              ) : null}

              <p className="mt-2 hidden max-w-md text-pretty text-sm leading-relaxed text-zinc-600 sm:mt-3 sm:block sm:text-[15px]">
                {SUBTITLES[variant]}
              </p>
            </header>

            <AuthMobileStoriesPreview items={previewItems} variant={variant} />

            <div className="mt-3 min-w-0 sm:mt-6">{children}</div>
          </div>
        </div>
      </div>

      <div className="hidden sm:block">
        <SiteFooter />
      </div>
    </div>
  );
}
