'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const NAV = [
  { href: '/profil/komunikace', label: 'Přehled', exact: true },
  { href: '/profil/komunikace/whatsapp', label: 'WhatsApp' },
  { href: '/profil/komunikace/emaily', label: 'E-maily' },
  { href: '/profil/marketing', label: 'Marketing' },
  { href: '/profil/kontakty', label: 'Kontakty' },
];

export function CommunicationShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
          Komunikační centrum
        </p>
        <h1 className="mt-1 text-2xl font-bold text-zinc-900">{title}</h1>
      </div>

      <nav className="flex flex-wrap gap-2">
        {NAV.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                active
                  ? 'bg-[#ff6a00] text-white'
                  : 'border border-zinc-200 bg-white text-zinc-700 hover:border-orange-200'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
