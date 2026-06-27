'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Logo from '@/components/Logo';
import type { PortalPresentationSection } from '@/lib/portal-presentation';

const DESKTOP_VISIBLE = 6;

type Props = {
  navSections: PortalPresentationSection[];
  onCtaClick: (anchor: string, label: string) => void;
};

export function PresentationHeader({ navSections, onCtaClick }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const { primary, overflow } = useMemo(() => {
    const primaryItems = navSections.slice(0, DESKTOP_VISIBLE);
    const overflowItems = navSections.slice(DESKTOP_VISIBLE);
    return { primary: primaryItems, overflow: overflowItems };
  }, [navSections]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [moreOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [mobileOpen]);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  const navLinkClass =
    'whitespace-nowrap rounded-lg px-2 py-1 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-[#ff6a00] xl:text-[13px]';

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 border-b border-zinc-200/90 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm transition-shadow ${
          scrolled ? 'shadow-md' : 'shadow-sm'
        }`}
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" className="inline-flex shrink-0 items-center" aria-label="XXREALIT — domů">
            <Logo className="h-7 w-auto sm:h-8" />
          </Link>

          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-0.5 lg:flex" aria-label="Sekce stránky">
            {primary.map((s) => (
              <a key={s.anchor} href={`#${s.anchor}`} className={navLinkClass} title={s.title}>
                {s.title.length > 16 ? `${s.title.slice(0, 14)}…` : s.title}
              </a>
            ))}
            {overflow.length > 0 ? (
              <div ref={moreRef} className="relative">
                <button
                  type="button"
                  onClick={() => setMoreOpen((o) => !o)}
                  className={`${navLinkClass} inline-flex items-center gap-1`}
                  aria-expanded={moreOpen}
                  aria-haspopup="true"
                >
                  Více
                  <span className="text-[10px]" aria-hidden>
                    ▾
                  </span>
                </button>
                {moreOpen ? (
                  <div className="absolute right-0 top-full z-50 mt-1 min-w-[12rem] rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
                    {overflow.map((s) => (
                      <a
                        key={s.anchor}
                        href={`#${s.anchor}`}
                        className="block px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-orange-50 hover:text-[#ff6a00]"
                        onClick={() => setMoreOpen(false)}
                      >
                        {s.icon ? `${s.icon} ` : ''}
                        {s.title}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </nav>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Link
              href="/login"
              className="hidden rounded-full px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 sm:inline sm:text-sm"
            >
              Přihlásit
            </Link>
            <Link
              href="/registrace"
              onClick={() => onCtaClick('header', 'Registrace')}
              className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:opacity-95 sm:px-4 sm:text-sm"
            >
              Registrovat
            </Link>
            <button
              type="button"
              className="inline-flex size-10 items-center justify-center rounded-xl border border-zinc-200 text-zinc-800 transition hover:bg-zinc-50 lg:hidden"
              aria-label={mobileOpen ? 'Zavřít menu' : 'Otevřít menu'}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((o) => !o)}
            >
              {mobileOpen ? (
                <span className="text-xl leading-none">×</span>
              ) : (
                <span className="flex flex-col gap-1" aria-hidden>
                  <span className="block h-0.5 w-5 rounded-full bg-zinc-800" />
                  <span className="block h-0.5 w-5 rounded-full bg-zinc-800" />
                  <span className="block h-0.5 w-5 rounded-full bg-zinc-800" />
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="Navigace">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Zavřít menu"
            onClick={closeMobile}
          />
          <aside className="absolute inset-y-0 right-0 flex w-[min(100%,20rem)] flex-col bg-white shadow-2xl motion-safe:animate-[app-sheet-in_0.28s_ease-out]">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
              <span className="text-sm font-bold text-zinc-900">Menu</span>
              <button
                type="button"
                onClick={closeMobile}
                className="rounded-lg px-2 py-1 text-sm font-semibold text-zinc-500 hover:bg-zinc-100"
                aria-label="Zavřít"
              >
                Zavřít
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3" aria-label="Sekce stránky">
              <ul className="space-y-1">
                {navSections.map((s) => (
                  <li key={s.anchor}>
                    <a
                      href={`#${s.anchor}`}
                      className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-orange-50 hover:text-[#ff6a00]"
                      onClick={closeMobile}
                    >
                      {s.icon ? <span aria-hidden>{s.icon}</span> : null}
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="space-y-2 border-t border-zinc-200 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Link
                href="/login"
                onClick={closeMobile}
                className="block w-full rounded-full border border-zinc-200 py-2.5 text-center text-sm font-semibold text-zinc-800"
              >
                Přihlásit
              </Link>
              <Link
                href="/registrace"
                onClick={() => {
                  onCtaClick('header-mobile', 'Registrace');
                  closeMobile();
                }}
                className="block w-full rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] py-2.5 text-center text-sm font-bold text-white"
              >
                Registrovat
              </Link>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
