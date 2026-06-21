'use client';

import Link from 'next/link';

const NAV = [
  { href: '/pracovnik', label: 'Přehled' },
  { href: '/pracovnik/klienti', label: 'Moji klienti' },
  { href: '/pracovnik/pozvanky', label: 'Pozvánky' },
  { href: '/pracovnik/provize', label: 'Provize' },
  { href: '/pracovnik/statistiky', label: 'Statistiky' },
  { href: '/pracovnik/nastaveni', label: 'Nastavení účtu' },
] as const;

export default function PortalWorkerPanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50">
        <header className="border-b border-zinc-200 bg-white">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#e85d00]">
                XXrealit.cz
              </p>
              <h1 className="text-lg font-bold text-zinc-900">Pracovní panel</h1>
            </div>
            <nav className="flex flex-wrap gap-2">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:border-[#e85d00] hover:text-[#e85d00]"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
