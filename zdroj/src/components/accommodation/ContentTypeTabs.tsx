'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Clapperboard, Home, Hotel, MessageCircle } from 'lucide-react';

const TABS = [
  { href: '/?tab=shorts', label: 'Shorts', icon: Clapperboard, match: (p: string) => p === '/' },
  { href: '/?tab=classic', label: 'Reality', icon: Home, match: (p: string) => p === '/' },
  { href: '/ubytovani', label: 'Ubytování', icon: Hotel, match: (p: string) => p.startsWith('/ubytovani') },
  { href: '/?tab=posts', label: 'Příspěvky', icon: MessageCircle, match: (p: string) => p === '/' },
] as const;

type Props = {
  activeTab?: 'shorts' | 'classic' | 'accommodation' | 'posts';
};

export function ContentTypeTabs({ activeTab }: Props) {
  const pathname = usePathname() ?? '/';

  function isActive(tab: (typeof TABS)[number]) {
    if (tab.label === 'Ubytování') return pathname.startsWith('/ubytovani');
    if (activeTab === 'shorts' && tab.label === 'Shorts') return pathname === '/';
    if (activeTab === 'classic' && tab.label === 'Reality') return pathname === '/';
    if (activeTab === 'posts' && tab.label === 'Příspěvky') return pathname === '/';
    return false;
  }

  return (
    <div className="sticky top-[var(--header-offset,3.5rem)] z-40 border-b border-zinc-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="no-scrollbar mx-auto flex max-w-[100rem] gap-1 overflow-x-auto px-3 py-2 md:px-4">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(tab);
          return (
            <Link
              key={tab.label}
              href={tab.href}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition sm:text-sm ${
                active
                  ? 'bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] text-white shadow-sm'
                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
              }`}
            >
              <Icon className="size-3.5 shrink-0 sm:size-4" aria-hidden />
              <span className="whitespace-nowrap">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function AccommodationCategoryChips({
  active,
  basePath = '/ubytovani',
}: {
  active?: string;
  basePath?: string;
}) {
  const categories = [
    { slug: '', label: 'Vše' },
    { slug: 'hotely', label: 'Hotely' },
    { slug: 'apartmany', label: 'Apartmány' },
    { slug: 'penziony', label: 'Penziony' },
    { slug: 'chaty', label: 'Chaty' },
    { slug: 'chalupy', label: 'Chalupy' },
    { slug: 'wellness', label: 'Wellness' },
    { slug: 'kempy', label: 'Kempy' },
    { slug: 'luxusni', label: 'Luxusní' },
    { slug: 'u-more', label: 'U moře' },
    { slug: 'hory', label: 'Hory' },
    { slug: 'mesto', label: 'Město' },
  ];

  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
      {categories.map((c) => {
        const href = c.slug ? `${basePath}/${c.slug}` : basePath;
        const isActive = (active ?? '') === c.slug;
        return (
          <Link
            key={c.slug || 'vse'}
            href={href}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition sm:text-sm ${
              isActive
                ? 'border-orange-300 bg-orange-50 text-orange-800'
                : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300'
            }`}
          >
            {c.label}
          </Link>
        );
      })}
    </div>
  );
}
