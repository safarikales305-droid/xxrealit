'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import Logo from '@/components/Logo';
import { useAuth } from '@/hooks/use-auth';
import { useMessagesUnreadCount } from '@/hooks/use-messages-unread';
import { nestAbsoluteAssetUrl } from '@/lib/api';

export type ViewMode = 'shorts' | 'classic' | 'posts';

type NavbarProps = {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  onMobileFiltersOpen?: () => void;
};

const navBtn =
  'w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100 md:w-auto md:px-2 md:py-1.5 md:text-center';

export function Navbar({
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  onMobileFiltersOpen,
}: NavbarProps) {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, logout, refresh, apiAccessToken } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const unreadMessages = useMessagesUnreadCount(apiAccessToken);

  const profilePath = '/profil';
  const messagesPath = '/profil/zpravy';
  const isAdmin = user?.role === 'ADMIN';
  const avatarSrc =
    user?.avatar && user.avatar.trim().length > 0
      ? nestAbsoluteAssetUrl(user.avatar)
      : null;

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  function handleLogout() {
    setMenuOpen(false);
    logout();
  }

  function goHome() {
    void (async () => {
      await refresh();
      router.push('/');
      router.refresh();
      setMenuOpen(false);
    })();
  }

  const isShortsMobileCompact = viewMode === 'shorts';

  return (
    <header className="sticky top-0 z-50 w-full max-w-[100vw] shrink-0 border-b border-zinc-200 bg-white pt-[max(0.25rem,env(safe-area-inset-top))] shadow-[0_1px_0_rgba(0,0,0,0.04)]">
      {isShortsMobileCompact && viewMode != null && onViewModeChange != null ? (
        <div className="mx-auto hidden w-full max-w-[100rem] min-w-0 px-3 pb-2 pt-1 max-md:block md:hidden">
          <div className="flex w-full min-w-0 items-center gap-1.5">
            <div className="shrink-0 [&_img]:h-[1.35rem]">
              <Link
                href="/"
                className="outline-none ring-offset-2 ring-offset-white transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[#ff6a00]/45"
                aria-label="XXrealit — domů"
              >
                <Logo />
              </Link>
            </div>
            <div className="no-scrollbar flex min-w-0 flex-1 items-stretch gap-0.5 overflow-x-hidden rounded-lg bg-zinc-100 p-0.5">
              {/*
                Tento řádek se vykreslí jen ve viewMode === 'shorts' — TS jinak zužuje typ a hlásí
                „no overlap“ u porovnání s 'classic' / 'posts'. Aktivní je vždy Shorts.
              */}
              <button
                type="button"
                onClick={() => onViewModeChange('shorts')}
                className="min-w-0 flex-1 truncate rounded-md bg-orange-500 px-1 py-1.5 text-center text-[10px] font-semibold leading-tight text-white shadow-sm transition sm:text-[11px]"
              >
                Shorts
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('classic')}
                className="min-w-0 flex-1 truncate rounded-md px-1 py-1.5 text-center text-[10px] font-semibold leading-tight text-zinc-600 transition hover:text-zinc-900 sm:text-[11px]"
              >
                Klasik
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('posts')}
                className="min-w-0 flex-1 truncate rounded-md px-1 py-1.5 text-center text-[10px] font-semibold leading-tight text-zinc-600 transition hover:text-zinc-900 sm:text-[11px]"
              >
                Příspěvky
              </button>
            </div>
            <button
              type="button"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-800"
              aria-expanded={menuOpen}
              aria-label={menuOpen ? 'Zavřít menu' : 'Otevřít menu'}
              onClick={() => setMenuOpen((o) => !o)}
            >
              {menuOpen ? (
                <span className="text-lg leading-none">×</span>
              ) : (
                <span className="flex flex-col gap-1" aria-hidden>
                  <span className="block h-0.5 w-[1.15rem] rounded-full bg-zinc-700" />
                  <span className="block h-0.5 w-[1.15rem] rounded-full bg-zinc-700" />
                  <span className="block h-0.5 w-[1.15rem] rounded-full bg-zinc-700" />
                </span>
              )}
            </button>
            <Link
              href={!isLoading && isAuthenticated ? profilePath : '/login'}
              className="relative z-[60] flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 text-xs font-bold text-zinc-700 shadow-sm ring-1 ring-orange-500/20 transition hover:ring-orange-500/35 active:scale-[0.98]"
              aria-label={!isLoading && isAuthenticated ? 'Můj profil' : 'Přihlásit'}
            >
              {avatarSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarSrc}
                  alt=""
                  className="size-full rounded-full object-cover object-center"
                  width={36}
                  height={36}
                  decoding="async"
                />
              ) : (
                <span className="flex size-full items-center justify-center rounded-full bg-gradient-to-br from-orange-100 to-zinc-200 text-xs">
                  {user?.email?.trim().charAt(0).toUpperCase() || 'A'}
                </span>
              )}
            </Link>
          </div>
        </div>
      ) : null}

      <div
        className={`mx-auto w-full max-w-[100rem] min-w-0 flex-wrap items-center justify-between gap-x-2 overflow-x-clip px-4 md:min-h-16 md:flex md:gap-3 md:overflow-visible md:px-4 md:py-2.5 ${
          isShortsMobileCompact
            ? 'hidden min-h-12 gap-y-1 py-2 max-md:min-h-0 max-md:py-0 md:flex md:flex-wrap md:items-center'
            : 'flex min-h-14 gap-y-2 py-3'
        }`}
      >
        <div className="flex shrink-0 items-center">
          <Link
            href="/"
            className="outline-none ring-offset-2 ring-offset-white transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[#ff6a00]/45"
            aria-label="XXrealit — domů"
          >
            <Logo />
          </Link>
        </div>

        <div
          className={`relative min-w-0 flex-1 basis-[min(100%,12rem)] sm:min-w-[180px] md:max-w-xl ${
            isShortsMobileCompact ? 'max-md:hidden' : ''
          }`}
        >
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400 md:left-3 md:text-sm">
            ⌕
          </span>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Hledat lokality, projekty…"
            className={`w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 pl-8 text-xs font-medium text-zinc-900 placeholder:text-zinc-400 outline-none transition hover:border-zinc-300 hover:bg-white focus:border-[#ff6a00]/55 focus:bg-white focus:ring-2 focus:ring-[#ff6a00]/15 md:px-3 md:py-2 md:pl-9 md:text-sm lg:text-base ${
              isShortsMobileCompact
                ? 'max-md:px-2.5 max-md:py-1.5 max-md:pl-7 max-md:text-[11px]'
                : ''
            }`}
            aria-label="Hledat"
          />
        </div>

        <div className="flex shrink-0 flex-nowrap items-center gap-2 md:flex-wrap md:gap-3">
          <button
            type="button"
            className={`flex size-10 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-800 md:hidden ${
              isShortsMobileCompact ? 'max-md:hidden' : ''
            }`}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Zavřít menu' : 'Otevřít menu'}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? (
              <span className="text-xl leading-none">×</span>
            ) : (
              <span className="flex flex-col gap-1.5" aria-hidden>
                <span className="block h-0.5 w-5 rounded-full bg-zinc-700" />
                <span className="block h-0.5 w-5 rounded-full bg-zinc-700" />
                <span className="block h-0.5 w-5 rounded-full bg-zinc-700" />
              </span>
            )}
          </button>

          {onMobileFiltersOpen && !isShortsMobileCompact ? (
            <button
              type="button"
              onClick={onMobileFiltersOpen}
              className="rounded-lg bg-orange-500 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-orange-600 md:hidden"
            >
              Filtry
            </button>
          ) : null}

          {viewMode != null && onViewModeChange != null ? (
            <div
              className={`no-scrollbar flex flex-nowrap items-center gap-0.5 overflow-x-auto rounded-xl bg-zinc-100 p-1 sm:max-w-none sm:flex-wrap md:gap-1 ${
                isShortsMobileCompact
                  ? 'max-md:hidden max-w-[min(100%,11.5rem)] max-md:max-w-none md:max-w-none md:p-1'
                  : 'max-w-[min(100%,14rem)]'
              }`}
            >
              <button
                type="button"
                onClick={() => onViewModeChange('shorts')}
                className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition sm:text-xs md:px-3 md:text-sm ${
                  viewMode === 'shorts'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Shorts inzeraty
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('classic')}
                className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition sm:text-xs md:px-3 md:text-sm ${
                  viewMode === 'classic'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Klasik
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('posts')}
                className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition sm:text-xs md:px-3 md:text-sm ${
                  viewMode === 'posts'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Příspěvky
              </button>
            </div>
          ) : null}

          <div className="hidden shrink-0 items-center gap-2 md:flex">
            {isLoading ? (
              <span className="px-2 text-xs text-zinc-400" aria-hidden>
                …
              </span>
            ) : isAuthenticated && user ? (
              <>
                <span
                  className="max-w-[160px] truncate text-xs font-medium text-zinc-600"
                  title={user.email}
                >
                  {user.email}
                </span>
                <button
                  type="button"
                  onClick={() => void goHome()}
                  className="rounded-lg px-2 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-900"
                >
                  Prohlížet nemovitosti
                </button>
                <Link
                  href={profilePath}
                  className="rounded-lg px-2 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-900"
                >
                  Můj profil
                </Link>
                <Link
                  href={messagesPath}
                  className="relative rounded-lg px-2 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-900"
                >
                  Zprávy
                  {unreadMessages > 0 ? (
                    <span className="absolute -right-0.5 -top-0.5 flex min-w-[1.1rem] items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold leading-none text-white">
                      {unreadMessages > 99 ? '99+' : unreadMessages}
                    </span>
                  ) : null}
                </Link>
                {isAdmin ? (
                  <Link
                    href="/admin"
                    className="rounded-lg px-2 py-1.5 text-xs font-semibold text-[#e85d00] transition hover:bg-orange-50"
                  >
                    ➡️ Administrace
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-lg px-2 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-900"
                >
                  Odhlásit
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-lg px-2 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-900"
                >
                  Přihlásit
                </Link>
                <Link
                  href="/registrace"
                  className="rounded-lg px-2 py-1.5 text-xs font-semibold text-[#e85d00] transition hover:bg-orange-50"
                >
                  Registrace
                </Link>
              </>
            )}
          </div>

          {!isLoading && isAuthenticated && !isAdmin ? (
            <>
              <Link
                href="/inzerat/pridat"
                className="hidden items-center gap-2 rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-2.5 text-sm font-bold text-white shadow-[0_8px_28px_-6px_rgba(255,106,0,0.42)] ring-1 ring-white/25 transition hover:brightness-105 active:scale-[0.99] md:inline-flex"
              >
                <Plus className="size-5 shrink-0" strokeWidth={2.5} aria-hidden />
                Přidat inzerát
              </Link>

              {/* Na mobilu ve shorts je „+“ v pravém sloupci videa (VideoCard). */}
              {viewMode !== 'shorts' ? (
                <Link
                  href="/inzerat/pridat"
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] text-base font-semibold text-white shadow-md transition hover:scale-105 active:scale-95 md:hidden"
                  aria-label="Přidat inzerát"
                >
                  +
                </Link>
              ) : null}
            </>
          ) : null}

          <Link
            href={!isLoading && isAuthenticated ? profilePath : '/login'}
            className={`relative z-[60] flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-zinc-100 font-bold text-zinc-700 transition hover:ring-orange-500/35 active:scale-[0.98] md:size-12 md:text-base md:shadow-md md:ring-2 md:ring-orange-500/15 ${
              isShortsMobileCompact
                ? 'hidden size-10 shadow-md ring-1 ring-orange-500/25 md:inline-flex md:size-12 md:ring-2'
                : 'size-12 text-sm shadow-[0_4px_14px_-2px_rgba(0,0,0,0.2)] ring-2 ring-orange-500/15 md:size-12'
            }`}
            aria-label={!isLoading && isAuthenticated ? 'Můj profil' : 'Přihlásit'}
          >
            {avatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarSrc}
                alt=""
                className="size-full rounded-full object-cover object-center"
                width={48}
                height={48}
                decoding="async"
              />
            ) : (
              <span
                className={`flex size-full items-center justify-center rounded-full bg-gradient-to-br from-orange-100 to-zinc-200 md:text-lg ${
                  isShortsMobileCompact ? 'text-sm max-md:text-xs' : 'text-base'
                }`}
              >
                {user?.email?.trim().charAt(0).toUpperCase() || 'A'}
              </span>
            )}
          </Link>
        </div>
      </div>

      {menuOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[90] bg-black/40 md:hidden"
            aria-label="Zavřít menu"
            onClick={() => setMenuOpen(false)}
          />
          <div className="fixed inset-x-0 top-[3.5rem] z-[95] max-h-[min(70vh,calc(100dvh-5rem))] overflow-y-auto border-b border-zinc-200 bg-white px-4 py-4 shadow-lg md:hidden">
            {isLoading ? (
              <p className="text-sm text-zinc-500">Načítání…</p>
            ) : isAuthenticated && user ? (
              <div className="flex flex-col gap-2">
                <p className="truncate text-xs font-medium text-zinc-500">{user.email}</p>
                <button type="button" onClick={() => void goHome()} className={navBtn}>
                  Prohlížet nemovitosti
                </button>
                <Link href={profilePath} className={navBtn} onClick={() => setMenuOpen(false)}>
                  Můj profil
                </Link>
                <Link href={messagesPath} className={navBtn} onClick={() => setMenuOpen(false)}>
                  Zprávy
                  {unreadMessages > 0 ? (
                    <span className="ml-2 rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white">
                      {unreadMessages > 99 ? '99+' : unreadMessages}
                    </span>
                  ) : null}
                </Link>
                {isAdmin ? (
                  <Link href="/admin" className={navBtn} onClick={() => setMenuOpen(false)}>
                    ➡️ Administrace
                  </Link>
                ) : null}
                {!isAdmin ? (
                  <Link href="/inzerat/pridat" className={navBtn} onClick={() => setMenuOpen(false)}>
                    Přidat inzerát
                  </Link>
                ) : null}
                <button type="button" onClick={handleLogout} className={navBtn}>
                  Odhlásit
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Link href="/login" className={navBtn} onClick={() => setMenuOpen(false)}>
                  Přihlásit
                </Link>
                <Link href="/registrace" className={navBtn} onClick={() => setMenuOpen(false)}>
                  Registrace
                </Link>
              </div>
            )}
          </div>
        </>
      ) : null}
    </header>
  );
}
