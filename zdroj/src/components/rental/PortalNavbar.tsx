'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

export function PortalNavbar() {
  const router = useRouter();

  async function handleLogout() {
    try {
      localStorage.removeItem('user');
    } catch {
      /* ignore */
    }
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      /* ignore */
    }
    router.push('/login');
    router.refresh();
  }

  const linkClass =
    'rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900';

  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200/80 bg-white/90 shadow-sm backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/dashboard"
          className="text-lg font-bold tracking-tight text-[#e85d00] transition hover:text-[#ff6a00]"
        >
          XXrealit
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link href="/dashboard" className={linkClass}>
            Dashboard
          </Link>
          <Link href="/nemovitosti" className={linkClass}>
            Nemovitosti
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className={`${linkClass} text-red-600 hover:bg-red-50 hover:text-red-700`}
          >
            Odhlásit
          </button>
        </nav>
      </div>
    </header>
  );
}
