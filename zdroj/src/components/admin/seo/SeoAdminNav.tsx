'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type SeoNavItem = {
  href: string;
  label: string;
  exact?: boolean;
};

const NAV: SeoNavItem[] = [
  { href: '/admin/seo', label: 'Dashboard', exact: true },
  { href: '/admin/seo/stranky', label: 'SEO stránky' },
  { href: '/admin/seo/generator', label: 'Generátor obsahu' },
  { href: '/admin/seo/firmy', label: 'SEO firmy' },
  { href: '/admin/seo/lokality', label: 'Lokality ČR' },
  { href: '/admin/seo/sitemap', label: 'Sitemap' },
  { href: '/admin/seo/search-console', label: 'Search Console' },
  { href: '/admin/seo/indexace', label: 'Indexace' },
  { href: '/admin/seo/redirects', label: 'Přesměrování 301' },
  { href: '/admin/seo/chyby', label: 'Chyby SEO' },
  { href: '/admin/seo/interni-odkazy', label: 'Interní odkazy' },
  { href: '/admin/seo/robots', label: 'Robots.txt' },
  { href: '/admin/seo/metadata', label: 'Metadata' },
  { href: '/admin/seo/open-graph', label: 'Open Graph' },
  { href: '/admin/seo/strukturovana-data', label: 'Strukturovaná data' },
  { href: '/admin/seo/kanonicke-url', label: 'Kanonické URL' },
  { href: '/admin/seo/audit', label: 'SEO Audit' },
  { href: '/admin/seo/vykon', label: 'Výkon' },
  { href: '/admin/seo/historie', label: 'Historie změn' },
];

export function SeoAdminNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex flex-wrap gap-1 rounded-2xl border border-zinc-200 bg-white p-2">
      {NAV.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              active
                ? 'bg-orange-600 text-white'
                : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
