'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

export type PortalContentTabId = 'shorts' | 'reality' | 'accommodation' | 'posts';

export type PortalContentTab = {
  id: PortalContentTabId;
  label: string;
  emoji?: string;
  href?: string;
  onSelect?: () => void;
};

type Props = {
  tabs: PortalContentTab[];
  activeId: PortalContentTabId;
  sticky?: boolean;
  embedded?: boolean;
  className?: string;
};

const TAB_BASE =
  'inline-flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[14px] px-3 py-2.5 text-[14px] font-semibold leading-none transition sm:px-3.5 sm:text-[15px]';

const TAB_ACTIVE =
  'bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] text-white shadow-md shadow-orange-500/25';

const TAB_INACTIVE =
  'border border-zinc-200/90 bg-white text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50';

export function PortalContentTypeTabs({
  tabs,
  activeId,
  sticky = false,
  embedded = false,
  className = '',
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Partial<Record<PortalContentTabId, HTMLElement | null>>>({});

  useEffect(() => {
    const node = tabRefs.current[activeId];
    if (!node || !scrollerRef.current) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeId]);

  const inner = (
    <div
      ref={scrollerRef}
      role="tablist"
      aria-label="Hlavní sekce portálu"
      className="no-scrollbar flex items-stretch gap-2 overflow-x-auto scroll-smooth px-3 py-2 md:px-4"
      style={{ scrollbarWidth: 'none' }}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        const content = (
          <>
            {tab.emoji ? <span aria-hidden>{tab.emoji}</span> : null}
            <span>{tab.label}</span>
          </>
        );
        const className = `${TAB_BASE} ${active ? TAB_ACTIVE : TAB_INACTIVE}`;

        if (tab.href) {
          return (
            <Link
              key={tab.id}
              ref={(el) => {
                tabRefs.current[tab.id] = el;
              }}
              href={tab.href}
              role="tab"
              aria-selected={active}
              className={className}
            >
              {content}
            </Link>
          );
        }

        return (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[tab.id] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={tab.onSelect}
            className={className}
          >
            {content}
          </button>
        );
      })}
    </div>
  );

  if (embedded) {
    return <div className={className}>{inner}</div>;
  }

  return (
    <div
      className={`${
        sticky
          ? 'sticky top-[var(--header-offset,3.5rem)] z-40 border-b border-zinc-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80'
          : 'border-b border-zinc-200 bg-white'
      } ${className}`}
    >
      <div className="mx-auto max-w-[100rem]">{inner}</div>
    </div>
  );
}

export function buildPortalContentTabs(options: {
  viewMode?: 'shorts' | 'classic' | 'posts';
  onViewModeChange?: (mode: 'shorts' | 'classic' | 'posts') => void;
  accommodationActive?: boolean;
}): { tabs: PortalContentTab[]; activeId: PortalContentTabId } {
  const { viewMode, onViewModeChange, accommodationActive } = options;

  const tabs: PortalContentTab[] = [
    {
      id: 'shorts',
      label: 'Shorts',
      emoji: '🎬',
      href: onViewModeChange ? undefined : '/?tab=shorts',
      onSelect: onViewModeChange ? () => onViewModeChange('shorts') : undefined,
    },
    {
      id: 'reality',
      label: 'Reality',
      emoji: '🏠',
      href: onViewModeChange ? undefined : '/?tab=classic',
      onSelect: onViewModeChange ? () => onViewModeChange('classic') : undefined,
    },
    {
      id: 'accommodation',
      label: 'Ubytování',
      emoji: '🛏',
      href: '/ubytovani',
    },
    {
      id: 'posts',
      label: 'Příspěvky',
      emoji: '💬',
      href: onViewModeChange ? undefined : '/?tab=posts',
      onSelect: onViewModeChange ? () => onViewModeChange('posts') : undefined,
    },
  ];

  let activeId: PortalContentTabId = 'reality';
  if (accommodationActive) activeId = 'accommodation';
  else if (viewMode === 'shorts') activeId = 'shorts';
  else if (viewMode === 'posts') activeId = 'posts';
  else if (viewMode === 'classic') activeId = 'reality';

  return { tabs, activeId };
}
