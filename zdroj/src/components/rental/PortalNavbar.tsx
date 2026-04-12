'use client';

import Link from 'next/link';
import Logo from '@/components/Logo';
import { useAuth } from '@/hooks/use-auth';
import { nestAbsoluteAssetUrl } from '@/lib/api';

export function PortalNavbar() {
  const { user, isLoading, logout } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const linkClass =
    'rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 sm:px-3 sm:text-sm';

  const avatarSrc =
    user?.avatar && user.avatar.trim().length > 0
      ? nestAbsoluteAssetUrl(user.avatar)
      : null;

  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200/80 bg-white/90 pt-[max(0px,env(safe-area-inset-top))] shadow-sm backdrop-blur-md">
      <div className="mx-auto flex min-h-14 max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 sm:h-14 sm:flex-nowrap sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center outline-none ring-offset-2 ring-offset-white transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[#ff6a00]/45"
          aria-label="xxrealit.cz — domů"
        >
          <Logo className="h-7 w-auto sm:h-8" />
        </Link>

        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:flex-nowrap sm:gap-3">
          <nav className="flex flex-wrap items-center justify-end gap-0.5 sm:gap-1">
            {isAdmin ? (
              <Link href="/admin" className={linkClass}>
                Administrace
              </Link>
            ) : null}
            <Link href="/" className={linkClass}>
              Nástěnka
            </Link>
            <button
              type="button"
              onClick={() => logout()}
              className={`${linkClass} text-red-600 hover:bg-red-50 hover:text-red-700`}
            >
              Odhlásit se
            </button>
          </nav>

          <Link
            href={user ? '/profil' : '/login'}
            className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-zinc-200 bg-zinc-100 text-sm font-semibold text-zinc-700 shadow-sm ring-1 ring-zinc-200/80 transition hover:border-orange-300/60 hover:ring-orange-400/25 sm:size-11"
            aria-label={user ? 'Můj profil' : 'Přihlásit'}
          >
            {isLoading ? (
              <span className="size-full animate-pulse bg-zinc-200" aria-hidden />
            ) : avatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarSrc}
                alt=""
                className="size-full object-cover object-center"
                width={44}
                height={44}
                decoding="async"
              />
            ) : (
              <span className="flex size-full items-center justify-center bg-gradient-to-br from-orange-100 to-zinc-200 text-sm sm:text-base">
                {user?.email?.trim().charAt(0).toUpperCase() ?? '?'}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
