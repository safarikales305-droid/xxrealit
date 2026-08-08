'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { type MouseEvent, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import Logo from '@/components/Logo';
import {
  AppMobileMenuPanel,
  menuIcons,
  type AppMobileMenuItem,
} from '@/components/ui/AppMobileMenuPanel';
import { useAuth } from '@/hooks/use-auth';
import { useMessagesUnreadCount } from '@/hooks/use-messages-unread';
import { useNotificationsUnreadCount } from '@/hooks/use-notifications-unread';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import { imageCropToStyle } from '@/components/profile/image-crop-editor-modal';
import { canAccessCommunication } from '@/lib/communication-roles';
import {
  buildPortalContentTabs,
  PortalContentTypeTabs,
} from '@/components/navigation/PortalContentTypeTabs';

export type ViewMode = 'shorts' | 'classic' | 'posts';

import type { ListingLocationOption } from '@/lib/listing-locations';

type NavbarProps = {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  locationHints?: ListingLocationOption[];
  onLocationHintSelect?: (label: string) => void;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  onMobileFiltersOpen?: () => void;
  activePostsCategoryLabel?: string;
};

const mobileMenuBtn =
  'flex size-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200/90 bg-zinc-50 text-zinc-800 shadow-sm transition active:scale-95 hover:bg-white md:hidden';

export function Navbar({
  searchQuery,
  onSearchChange,
  locationHints = [],
  onLocationHintSelect,
  viewMode,
  onViewModeChange,
  onMobileFiltersOpen,
  activePostsCategoryLabel,
}: NavbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const isAccommodationSection = pathname?.startsWith('/ubytovani');
  const { user, isAuthenticated, isLoading, logout, apiAccessToken } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const unreadMessages = useMessagesUnreadCount(apiAccessToken);
  const unreadNotifications = useNotificationsUnreadCount(apiAccessToken);
  const totalUnreadBadge = unreadMessages + unreadNotifications;

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

  function handleAddListingClick(e?: MouseEvent<HTMLElement>) {
    e?.preventDefault();
    e?.stopPropagation();
    if (isLoading) return;
    if (!isAuthenticated || !user) {
      router.push(`/prihlaseni?redirect=${encodeURIComponent('/inzerat/pridat')}`);
      return;
    }
    router.push('/inzerat/pridat');
  }

  const isShortsMobileCompact = viewMode === 'shorts';

  const portalTabs = useMemo(() => {
    if (viewMode == null || onViewModeChange == null) return null;
    return buildPortalContentTabs({
      viewMode,
      onViewModeChange,
      accommodationActive: isAccommodationSection,
    });
  }, [viewMode, onViewModeChange, isAccommodationSection]);

  const mobileMenuItems = useMemo(() => {
    if (isLoading) return [];
    if (isAuthenticated && user) {
      const items: AppMobileMenuItem[] = [
        {
          key: 'profile',
          label: 'Můj profil',
          href: profilePath,
          icon: menuIcons.profile,
        },
        {
          key: 'messages',
          label: 'Zprávy',
          href: messagesPath,
          icon: menuIcons.messages,
          badge: unreadMessages,
        },
      ];
      if (canAccessCommunication(user.role)) {
        items.push({
          key: 'communication',
          label: 'Komunikace',
          href: '/profil/komunikace',
          icon: menuIcons.messages,
        });
      }
      if (isAdmin) {
        items.push({
          key: 'admin',
          label: 'Administrace',
          href: '/admin',
          icon: menuIcons.admin,
        });
      }
      items.push({
        key: 'add',
        label: 'Přidat inzerát',
        icon: menuIcons.add,
        onClick: () => handleAddListingClick(),
      });
      items.push({
        key: 'logout',
        label: 'Odhlásit',
        icon: menuIcons.logout,
        variant: 'danger' as const,
        onClick: () => handleLogout(),
      });
      return items;
    }
    return [
      {
        key: 'about',
        label: 'O portálu',
        href: '/o-portalu',
        icon: menuIcons.profile,
      },
      {
        key: 'login',
        label: 'Přihlásit',
        href: '/login',
        icon: menuIcons.login,
      },
      {
        key: 'register',
        label: 'Registrace',
        href: '/registrace',
        icon: menuIcons.register,
      },
    ] satisfies AppMobileMenuItem[];
  }, [
    isLoading,
    isAuthenticated,
    user,
    profilePath,
    messagesPath,
    unreadMessages,
    totalUnreadBadge,
    isAdmin,
  ]);

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
            <div className="flex-1" />
            <button
              type="button"
              className={mobileMenuBtn}
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
                  style={imageCropToStyle(user?.avatarCrop ?? null)}
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
          {portalTabs ? (
            <PortalContentTypeTabs
              embedded
              tabs={portalTabs.tabs}
              activeId={portalTabs.activeId}
              className="-mx-3 mt-2"
            />
          ) : null}
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
            onChange={(e) => {
              onSearchChange(e.target.value);
              setLocationOpen(true);
            }}
            onFocus={() => setLocationOpen(true)}
            onBlur={() => window.setTimeout(() => setLocationOpen(false), 180)}
            placeholder="Hledat lokality, projekty…"
            className={`w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 pl-8 text-xs font-medium text-zinc-900 placeholder:text-zinc-400 outline-none transition hover:border-zinc-300 hover:bg-white focus:border-[#ff6a00]/55 focus:bg-white focus:ring-2 focus:ring-[#ff6a00]/15 md:px-3 md:py-2 md:pl-9 md:text-sm lg:text-base ${
              isShortsMobileCompact
                ? 'max-md:px-2.5 max-md:py-1.5 max-md:pl-7 max-md:text-[11px]'
                : ''
            }`}
            aria-label="Hledat"
          />
          {locationOpen && locationHints.length > 0 && searchQuery.trim() ? (
            <ul className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-64 overflow-y-auto rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
              {locationHints.map((hint) => (
                <li key={`${hint.city}-${hint.district}-${hint.region}`}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-zinc-800 hover:bg-orange-50"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onLocationHintSelect?.(hint.label || hint.city);
                      setLocationOpen(false);
                    }}
                  >
                    <span>{hint.label}</span>
                    <span className="text-xs text-zinc-500">{hint.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-nowrap items-center gap-2 md:flex-wrap md:gap-3">
          <button
            type="button"
            className={`${mobileMenuBtn} size-10 ${isShortsMobileCompact ? 'max-md:hidden' : ''}`}
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

          {portalTabs ? (
            <div className="hidden shrink-0 md:block">
              <PortalContentTypeTabs
                embedded
                tabs={portalTabs.tabs}
                activeId={portalTabs.activeId}
              />
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
                  title={user.name ?? 'Uživatel'}
                >
                  {user.name?.trim() || 'Uživatel'}
                </span>
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
                  {totalUnreadBadge > 0 ? (
                    <span className="absolute -right-0.5 -top-0.5 flex min-w-[1.1rem] items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold leading-none text-white">
                      {totalUnreadBadge > 99 ? '99+' : totalUnreadBadge}
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
                  href="/o-portalu"
                  className="hidden rounded-lg px-2 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-900 lg:inline"
                >
                  O portálu
                </Link>
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

          {!isLoading && isAuthenticated && user ? (
            <>
              <button
                type="button"
                onClick={handleAddListingClick}
                className="hidden items-center gap-2 rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-2.5 text-sm font-bold text-white shadow-[0_8px_28px_-6px_rgba(255,106,0,0.42)] ring-1 ring-white/25 transition hover:brightness-105 active:scale-[0.99] md:inline-flex"
              >
                <Plus className="size-5 shrink-0" strokeWidth={2.5} aria-hidden />
                Přidat inzerát
              </button>

              {/* Na mobilu ve shorts je „+“ v pravém sloupci videa (VideoCard); mimo shorts zůstává rychlá volba v hlavičce. */}
              {viewMode !== 'shorts' ? (
                <button
                  type="button"
                  onClick={handleAddListingClick}
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] text-base font-semibold text-white shadow-md transition hover:scale-105 active:scale-95 md:hidden"
                  aria-label="Přidat inzerát"
                >
                  +
                </button>
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
                style={imageCropToStyle(user?.avatarCrop ?? null)}
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
                {(user?.name?.trim().charAt(0) || 'U').toUpperCase()}
              </span>
            )}
          </Link>
        </div>
      </div>

      {portalTabs && !isShortsMobileCompact ? (
        <div className="mx-auto w-full max-w-[100rem] md:hidden">
          <PortalContentTypeTabs embedded tabs={portalTabs.tabs} activeId={portalTabs.activeId} />
        </div>
      ) : null}

      <AppMobileMenuPanel
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        userName={isAuthenticated && user ? user.name?.trim() || 'Uživatel' : null}
        isLoading={isLoading}
        items={mobileMenuItems}
      />
    </header>
  );
}
