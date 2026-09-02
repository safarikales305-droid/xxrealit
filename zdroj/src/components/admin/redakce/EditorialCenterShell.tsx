'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const TABS = [
  { href: '/admin/redakce', label: 'Přehled', exact: true },
  { href: '/admin/redakce/youtube', label: 'YouTube kanály' },
  { href: '/admin/redakce/rss', label: 'RSS / Aktuality' },
  { href: '/admin/redakce/kategorie', label: 'Kategorie zdrojů' },
  { href: '/admin/redakce/automatizace', label: 'Automatické publikování' },
  { href: '/admin/redakce/facebook-reels', label: 'Facebook Reels' },
  { href: '/admin/redakce/ai-influencer', label: 'AI Influencer' },
  { href: '/admin/redakce/historie', label: 'Historie' },
  { href: '/admin/redakce/nastaveni', label: 'Nastavení' },
] as const;

export function EditorialCenterShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">Redakční centrum</p>
          <h1 className="text-2xl font-bold text-zinc-900">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-zinc-600">{subtitle}</p> : null}
        </div>
        <Link
          href="/admin/aktuality?tab=ai"
          className="text-sm font-medium text-zinc-600 underline hover:text-orange-700"
        >
          AI redakce a články →
        </Link>
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-zinc-200 pb-px">
        {TABS.map((tab) => {
          const active =
            'exact' in tab && tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`shrink-0 rounded-t-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? 'border border-b-white border-zinc-200 bg-white text-orange-700'
                  : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}

export function StatusDot({
  active,
  label,
  title,
}: {
  active: boolean;
  label: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        active ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-600'
      }`}
    >
      <span className={`size-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
      {label}
    </span>
  );
}

export function AutoStatusBanner({
  active,
  error,
  label,
}: {
  active: boolean;
  error?: string | null;
  label: string;
}) {
  const tone = error ? 'border-red-200 bg-red-50 text-red-900' : active
    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
    : 'border-zinc-200 bg-zinc-50 text-zinc-700';
  const status = error ? 'CHYBA' : active ? 'AKTIVNÍ' : 'VYPNUTO';
  return (
    <div className={`rounded-xl border px-4 py-3 ${tone}`} title={error ?? undefined}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="text-lg font-bold">{status}</p>
    </div>
  );
}
