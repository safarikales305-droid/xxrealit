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
 * Sdílený layout pro přihlášení a registraci — logo, formulář a živý náhled portálu.
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

      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-6xl flex-col justify-center px-4 py-10 sm:px-6 sm:py-14 md:py-16">
        <Link
          href="/"
          className="mb-6 inline-flex w-fit items-center gap-1.5 text-sm font-medium text-white/70 transition hover:text-white"
        >
          <span aria-hidden>←</span> Zpět na úvod
        </Link>

        <div className="mx-auto w-full max-w-lg">
          <div className="rounded-[1.75rem] border border-white/15 bg-white/[0.97] p-7 shadow-[0_32px_64px_-24px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-9 md:p-10 md:rounded-[2rem]">
            <div className="flex flex-col items-center text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="rounded-2xl bg-gradient-to-br from-[#ff6a00]/12 to-[#ff3c00]/5 px-5 py-3.5 ring-1 ring-orange-500/15">
                  <Logo className="h-11 w-auto sm:h-12 md:h-14" />
                </div>
                <span className="text-lg font-bold tracking-tight text-zinc-900 md:text-xl">
                  xxrealit
                </span>
              </div>
              <h1 className="mt-6 max-w-md text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl md:text-4xl md:leading-tight">
                Vítejte ve světě realit
              </h1>
              {variant === 'register' ? (
                <p className="mt-4 max-w-md text-pretty text-base font-extrabold leading-snug tracking-tight text-zinc-900 sm:mt-5 sm:text-lg md:text-xl">
                  Prohlížení inzerátů je plně zdarma
                </p>
              ) : null}
              <p
                className={`max-w-md text-pretty text-sm leading-relaxed text-zinc-600 sm:text-[15px] ${
                  variant === 'register' ? 'mt-3 sm:mt-4' : 'mt-3'
                }`}
              >
                {SUBTITLES[variant]}
              </p>

              <AuthMobileStoriesPreview items={previewItems} />
            </div>

            <div className="mt-8">{children}</div>
          </div>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
