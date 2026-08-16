'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import Logo from '@/components/Logo';
import { useAuth } from '@/hooks/use-auth';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import { imageCropToStyle } from '@/components/profile/image-crop-editor-modal';
import type { PortalContentTab, PortalContentTabId } from '@/components/navigation/PortalContentTypeTabs';

export type PublicHeaderActiveSection = PortalContentTabId | 'profiles' | 'none';

type PublicHeaderProps = {
  activeSection?: PublicHeaderActiveSection;
  showSearch?: boolean;
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
  compact?: boolean;
};

const PROFILES_HREF = '/profesionalove';

const TAB_BASE =
  'inline-flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[14px] px-3 py-2 text-[13px] font-semibold leading-none transition sm:px-3.5 sm:text-[14px]';

const TAB_ACTIVE =
  'bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] text-white shadow-md shadow-orange-500/25';

const TAB_INACTIVE =
  'border border-zinc-200/90 bg-white text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50';

function resolveActiveSection(pathname: string | null): PublicHeaderActiveSection {
  if (!pathname) return 'reality';
  if (pathname.startsWith('/ubytovani')) return 'accommodation';
  if (
    pathname.startsWith('/firmy') ||
    pathname.startsWith('/profesionalove') ||
    pathname.startsWith('/profily') ||
    pathname.startsWith('/makleri') ||
    pathname.startsWith('/makler/') ||
    pathname.startsWith('/profile/')
  ) {
    return 'profiles';
  }
  if (
    pathname.startsWith('/prispevky') ||
    pathname.startsWith('/prispevek') ||
    pathname.startsWith('/video/')
  ) {
    return 'posts';
  }
  if (pathname.startsWith('/shorts')) return 'shorts';
  if (
    pathname.startsWith('/nemovitost') ||
    pathname.startsWith('/inzerat') ||
    pathname.startsWith('/reality')
  ) {
    return 'reality';
  }
  return 'reality';
}

export function PublicHeader({
  activeSection,
  showSearch = false,
  searchQuery = '',
  onSearchChange,
  compact = false,
}: PublicHeaderProps) {
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading } = useAuth();
  const resolvedActive = activeSection ?? resolveActiveSection(pathname);

  const portalTabs: PortalContentTab[] = useMemo(
    () => [
      { id: 'shorts', label: 'Shorts', emoji: '🎬', href: '/?tab=shorts' },
      { id: 'reality', label: 'Reality', emoji: '🏠', href: '/?tab=classic' },
      { id: 'accommodation', label: 'Ubytování', emoji: '🛏', href: '/ubytovani' },
      { id: 'posts', label: 'Příspěvky', emoji: '💬', href: '/?tab=posts' },
    ],
    [],
  );

  const profilesActive = resolvedActive === 'profiles';
  const contentActiveId: PortalContentTabId =
    resolvedActive === 'profiles' || resolvedActive === 'none' ? 'reality' : resolvedActive;

  const avatarSrc =
    user?.avatar && user.avatar.trim().length > 0 ? nestAbsoluteAssetUrl(user.avatar) : null;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-200 bg-white/95 pt-[max(0.25rem,env(safe-area-inset-top))] shadow-[0_1px_0_rgba(0,0,0,0.04)] backdrop-blur supports-[backdrop-filter]:bg-white/90">
      <div
        className={`mx-auto flex w-full max-w-[100rem] items-center justify-between gap-2 px-3 md:px-4 ${
          compact ? 'min-h-12 py-2' : 'min-h-14 py-2.5 md:min-h-16'
        }`}
      >
        <Link href="/" className="shrink-0" aria-label="XXREALIT — domů">
          <Logo />
        </Link>

        {showSearch && onSearchChange ? (
          <div className="relative hidden min-w-0 flex-1 md:block md:max-w-md">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Hledat profily, firmy, lokality…"
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 pl-8 text-sm outline-none focus:border-orange-400 focus:bg-white"
            />
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400">
              ⌕
            </span>
          </div>
        ) : (
          <div className="hidden flex-1 lg:block" />
        )}

        <div className="hidden items-center gap-2 lg:flex">
          {portalTabs.map((tab) => {
            const active = tab.id === contentActiveId && !profilesActive;
            return (
              <Link
                key={tab.id}
                href={tab.href!}
                className={`${TAB_BASE} ${active ? TAB_ACTIVE : TAB_INACTIVE}`}
              >
                {tab.emoji ? <span aria-hidden>{tab.emoji}</span> : null}
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          <Link
            href={PROFILES_HREF}
            className={`${TAB_BASE} ${profilesActive ? TAB_ACTIVE : TAB_INACTIVE}`}
          >
            <span aria-hidden>👥</span>
            <span>Profesionálové a firmy</span>
          </Link>
          <Link
            href="/o-portalu"
            className="rounded-lg px-2 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
          >
            O portálu
          </Link>
          {!isLoading && isAuthenticated ? (
            <Link
              href="/profil"
              className="rounded-lg px-2 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
            >
              Můj profil
            </Link>
          ) : (
            <Link
              href="/prihlaseni"
              className="rounded-lg px-2 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
            >
              Přihlásit
            </Link>
          )}
        </div>

        <Link
          href={!isLoading && isAuthenticated ? '/profil' : '/prihlaseni'}
          className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 lg:size-10"
          aria-label={!isLoading && isAuthenticated ? 'Můj profil' : 'Přihlásit'}
        >
          {avatarSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarSrc}
              alt=""
              className="size-full object-cover"
              style={imageCropToStyle(user?.avatarCrop ?? null)}
            />
          ) : (
            <span className="text-xs font-bold text-zinc-600">
              {(user?.name?.trim().charAt(0) || 'A').toUpperCase()}
            </span>
          )}
        </Link>
      </div>

      <div className="border-t border-zinc-100 lg:hidden">
        <div className="mx-auto max-w-[100rem]">
          <div
            className="no-scrollbar flex items-stretch gap-2 overflow-x-auto scroll-smooth px-3 py-2 md:px-4"
            style={{ scrollbarWidth: 'none' }}
          >
            {portalTabs.map((tab) => {
              const active = tab.id === contentActiveId && !profilesActive;
              return (
                <Link
                  key={tab.id}
                  href={tab.href!}
                  className={`${TAB_BASE} ${active ? TAB_ACTIVE : TAB_INACTIVE}`}
                >
                  {tab.emoji ? <span aria-hidden>{tab.emoji}</span> : null}
                  <span>{tab.label}</span>
                </Link>
              );
            })}
            <Link
              href={PROFILES_HREF}
              className={`${TAB_BASE} lg:hidden ${profilesActive ? TAB_ACTIVE : TAB_INACTIVE}`}
            >
              <span aria-hidden>👥</span>
              <span>Lidé a firmy</span>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
