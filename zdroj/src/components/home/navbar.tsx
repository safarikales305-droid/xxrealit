'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
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
  const { user, isAuthenticated, isLoading, logout, refresh } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const profilePath = '/profil';
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

  return (
    <header className="sticky top-0 z-50 shrink-0 border-b border-zinc-200 bg-white shadow-[0_1px_0_rgba(0,0,0,0.04)]">
      <div className="mx-auto flex min-h-14 w-full max-w-[100rem] flex-wrap items-center gap-x-2 gap-y-2 px-3 py-2 md:min-h-16 md:gap-3 md:px-4 md:py-2.5">
        <Link
          href="/"
          className="shrink-0 outline-none ring-offset-2 ring-offset-white transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[#ff6a00]/45"
          aria-label="XXrealit — domů"
        >
          <img
            src="/logo.png"
            alt="XXrealit"
            className="h-8 w-auto max-w-[140px] object-contain md:h-10 md:max-w-[160px]"
          />
        </Link>

        <div className="relative min-w-0 flex-1 basis-[min(100%,12rem)] sm:min-w-[180px] md:max-w-xl">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400 md:left-3 md:text-sm">
            ⌕
          </span>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Hledat lokality, projekty…"
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 pl-8 text-xs font-medium text-zinc-900 placeholder:text-zinc-400 outline-none transition hover:border-zinc-300 hover:bg-white focus:border-[#ff6a00]/55 focus:bg-white focus:ring-2 focus:ring-[#ff6a00]/15 md:px-3 md:py-2 md:pl-9 md:text-sm lg:text-base"
            aria-label="Hledat"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            className="flex size-10 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-800 md:hidden"
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

          {onMobileFiltersOpen ? (
            <button
              type="button"
              onClick={onMobileFiltersOpen}
              className="rounded-lg bg-orange-500 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-orange-600 md:hidden"
            >
              Filtry
            </button>
          ) : null}

          {viewMode != null && onViewModeChange != null ? (
            <div className="hidden flex-wrap items-center gap-1 rounded-lg bg-zinc-100 p-0.5 sm:flex md:gap-1 md:rounded-xl md:p-1">
              <button
                type="button"
                onClick={() => onViewModeChange('shorts')}
                className={`rounded-md px-2 py-1 text-xs font-medium transition md:rounded-lg md:px-3 md:text-sm ${
                  viewMode === 'shorts'
                    ? 'bg-orange-500 text-white'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                🎬 Shorts
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('classic')}
                className={`rounded-md px-2 py-1 text-xs font-medium transition md:rounded-lg md:px-3 md:text-sm ${
                  viewMode === 'classic'
                    ? 'bg-orange-500 text-white'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                🏠 Klasik
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('posts')}
                className={`rounded-md px-2 py-1 text-xs font-medium transition md:rounded-lg md:px-3 md:text-sm ${
                  viewMode === 'posts'
                    ? 'bg-orange-500 text-white'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                📝 Příspěvky
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
                className="hidden rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-orange-600 md:inline-flex md:text-sm"
              >
                Přidat
              </Link>

              <Link
                href="/inzerat/pridat"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] text-base font-semibold text-white shadow-md transition hover:scale-105 active:scale-95 md:hidden"
                aria-label="Přidat inzerát"
              >
                +
              </Link>
            </>
          ) : null}

          <Link
            href={!isLoading && isAuthenticated ? profilePath : '/login'}
            className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-200 md:size-10 md:text-sm"
            aria-label={!isLoading && isAuthenticated ? 'Můj profil' : 'Přihlásit'}
          >
            {avatarSrc ? (
              <img
                src={avatarSrc}
                alt=""
                className="size-full object-cover"
                width={40}
                height={40}
              />
            ) : (
              user?.email?.trim().charAt(0).toUpperCase() || 'A'
            )}
          </Link>
        </div>
      </div>

      {viewMode != null && onViewModeChange != null ? (
        <div className="flex items-center gap-1 border-t border-zinc-100 bg-white px-3 pb-2 md:hidden">
          <button
            type="button"
            onClick={() => onViewModeChange('shorts')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              viewMode === 'shorts'
                ? 'bg-orange-500 text-white'
                : 'bg-zinc-100 text-zinc-700'
            }`}
          >
            Shorts
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('posts')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              viewMode === 'posts'
                ? 'bg-orange-500 text-white'
                : 'bg-zinc-100 text-zinc-700'
            }`}
          >
            Příspěvky
          </button>
        </div>
      ) : null}

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
