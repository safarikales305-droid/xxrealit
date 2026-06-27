'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

const NAV = [
  { href: '/pracovnik', label: 'Přehled' },
  { href: '/pracovnik/klienti', label: 'Moji klienti' },
  { href: '/pracovnik/registrace', label: 'Zahájené registrace' },
  { href: '/pracovnik/pozvanky', label: 'Pozvánky' },
  { href: '/pracovnik/kredity', label: 'Kredity klientů' },
  { href: '/pracovnik/provize', label: 'Provize' },
  { href: '/pracovnik/statistiky', label: 'Statistiky' },
  { href: '/pracovnik/poznamky', label: 'Poznámky' },
  { href: '/pracovnik/nastaveni', label: 'Nastavení účtu' },
] as const;

export function PortalWorkerPanelShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { logout } = useAuth();

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#e85d00]">
                XXrealit.cz
              </p>
              <h1 className="text-lg font-bold text-zinc-900">Pracovní panel</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/"
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-700 hover:border-[#e85d00] hover:text-[#e85d00]"
              >
                Přejít na web
              </Link>
              <button
                type="button"
                onClick={() => logout()}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Odhlásit se
              </button>
            </div>
          </div>
          <nav className="mt-3 flex flex-wrap gap-2">
            {NAV.map((item) => {
              const active =
                item.href === '/pracovnik'
                  ? pathname === '/pracovnik'
                  : pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? 'border-[#e85d00] bg-orange-50 text-[#e85d00]'
                      : 'border-zinc-200 text-zinc-700 hover:border-[#e85d00] hover:text-[#e85d00]'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
