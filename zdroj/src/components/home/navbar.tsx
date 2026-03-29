'use client';

import Link from 'next/link';

export type ViewMode = 'shorts' | 'classic';

type NavbarProps = {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  onMobileFiltersOpen?: () => void;
};

export function Navbar({
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  onMobileFiltersOpen,
}: NavbarProps) {
  return (
    <header className="sticky top-0 z-50 shrink-0 border-b border-zinc-200 bg-white shadow-[0_1px_0_rgba(0,0,0,0.04)]">
      <div className="mx-auto flex min-h-14 w-full max-w-[100rem] flex-wrap items-center gap-x-2 gap-y-2 px-3 py-2 md:min-h-16 md:gap-3 md:px-4 md:py-2.5">
        {/* Logo */}
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

        {/* Search — grows, wraps cleanly */}
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

        {/* Actions — shrink-0, wrap as a group */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
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
            <div className="flex flex-wrap items-center gap-1 rounded-lg bg-zinc-100 p-0.5 md:gap-1 md:rounded-xl md:p-1">
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
                🏠 Klasicky
              </button>
            </div>
          ) : null}

          <Link
            href="/create"
            className="hidden rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-orange-600 md:inline-flex md:text-sm"
          >
            Přidat
          </Link>

          <Link
            href="/create"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] text-base font-semibold text-white shadow-md transition hover:scale-105 active:scale-95 md:hidden"
            aria-label="Přidat inzerát"
          >
            +
          </Link>

          <button
            type="button"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-100 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-200 md:size-10 md:text-sm"
            aria-label="Profil"
          >
            A
          </button>
        </div>
      </div>
    </header>
  );
}
