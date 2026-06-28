'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import Logo from '@/components/Logo';
import { SiteFooter } from '@/components/legal/SiteFooter';
import { AuthDesktopLiveBackdrop } from '@/components/auth/AuthDesktopLiveBackdrop';
import { FloatingAuthDecorations } from '@/components/auth/FloatingAuthDecorations';
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
 * Sdílený layout pro přihlášení a registraci — logo, živé pozadí, prémiový formulář.
 */
export function AuthPageShell({ variant, children }: AuthPageShellProps) {
  const [previewItems, setPreviewItems] = useState<AuthPortalPreviewItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    void loadAuthPortalPreviewItems(20).then((items) => {
      if (!cancelled) setPreviewItems(items);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="auth-page-shell relative flex min-h-[100dvh] flex-col overflow-x-hidden bg-slate-950 text-zinc-900">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(234,88,12,0.22),transparent_50%),radial-gradient(ellipse_80%_50%_at_100%_50%,rgba(249,115,22,0.08),transparent_45%),radial-gradient(ellipse_60%_40%_at_0%_80%,rgba(251,146,60,0.07),transparent_40%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/35 via-slate-950/15 to-slate-950/55"
        aria-hidden
      />

      <AuthDesktopLiveBackdrop items={previewItems} />

      <div
        className="pointer-events-none absolute inset-0 hidden bg-[radial-gradient(ellipse_60%_50%_at_50%_48%,rgba(15,23,42,0.55),transparent_75%)] lg:block"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 z-[5] bg-[radial-gradient(ellipse_85%_70%_at_50%_42%,rgba(15,23,42,0.62),transparent_68%)] lg:hidden"
        aria-hidden
      />

      <div className="relative z-20 mx-auto flex w-full max-w-6xl flex-1 flex-col px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:justify-center sm:px-6 sm:py-10 md:py-14">
        <Link
          href="/"
          className="mb-3 inline-flex w-fit shrink-0 items-center gap-1.5 text-sm font-medium text-white/75 transition hover:text-white sm:mb-8"
        >
          <span aria-hidden>←</span> Zpět na úvod
        </Link>

        <div className="mx-auto w-[95%] max-w-[520px] flex-1 sm:flex-none">
          <div className="auth-form-interactive auth-form-enter pointer-events-auto relative rounded-[28px] bg-white/92 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.2)] backdrop-blur-lg max-lg:ring-1 max-lg:ring-white/50 sm:p-10 lg:bg-white lg:backdrop-blur-none">
            <header className="relative text-center">
              <div className="relative mx-auto min-h-[11.5rem] max-w-full overflow-visible sm:min-h-[13rem]">
                <FloatingAuthDecorations items={previewItems} />
                <div className="relative z-[30] flex flex-col items-center px-2 pt-1">
                  <div className="flex flex-col items-center gap-4 sm:gap-5">
                    <Logo className="h-12 w-auto sm:h-14 md:h-[4.25rem]" />
                    <span className="text-[13px] font-bold tracking-[2px] text-[#777] sm:text-sm">
                      XXREALIT.CZ
                    </span>
                  </div>

                  <h1 className="mt-6 text-[1.65rem] font-extrabold leading-tight tracking-tight text-zinc-900 sm:mt-8 sm:text-4xl">
                    Vítejte ve světě realit
                  </h1>
                </div>
              </div>

              {variant === 'register' ? (
                <p className="relative z-[30] mt-4 max-w-[380px] mx-auto text-pretty text-base font-extrabold leading-snug tracking-tight text-zinc-900 sm:mt-5 sm:text-xl">
                  Prohlížení inzerátů je plně zdarma
                </p>
              ) : null}

              <p className="relative z-[30] mt-4 mx-auto max-w-[380px] text-pretty text-[15px] leading-[1.7] text-zinc-500 sm:mt-5 sm:text-base">
                {SUBTITLES[variant]}
              </p>
            </header>

            <div className="relative z-40 mt-8 min-w-0 sm:mt-10 [&_a]:pointer-events-auto [&_button]:pointer-events-auto [&_input]:pointer-events-auto [&_select]:pointer-events-auto [&_textarea]:pointer-events-auto">
              {children}
            </div>
          </div>
        </div>
      </div>

      <div className="hidden sm:block">
        <SiteFooter />
      </div>
    </div>
  );
}
