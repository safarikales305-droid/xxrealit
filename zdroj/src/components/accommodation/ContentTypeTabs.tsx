'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  buildPortalContentTabs,
  PortalContentTypeTabs,
} from '@/components/navigation/PortalContentTypeTabs';

type Props = {
  activeTab?: 'shorts' | 'classic' | 'accommodation' | 'posts';
};

export function ContentTypeTabs({ activeTab }: Props) {
  const pathname = usePathname() ?? '/';
  const accommodationActive = pathname.startsWith('/ubytovani');

  let resolvedActive = activeTab;
  if (accommodationActive) resolvedActive = 'accommodation';

  const { tabs, activeId } = buildPortalContentTabs({
    accommodationActive,
    viewMode:
      resolvedActive === 'shorts'
        ? 'shorts'
        : resolvedActive === 'posts'
          ? 'posts'
          : resolvedActive === 'accommodation'
            ? undefined
            : 'classic',
  });

  return <PortalContentTypeTabs tabs={tabs} activeId={activeId} sticky />;
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
