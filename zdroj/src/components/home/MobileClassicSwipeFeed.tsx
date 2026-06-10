'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { TipCardBadge } from '@/components/listing/TipBadges';
import { ListingPriceDisplay } from '@/components/pricing/ListingPriceDisplay';
import { useCyclicFeedNavigation } from '@/hooks/use-cyclic-feed-navigation';
import { useAuth } from '@/hooks/use-auth';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import { isTipListing } from '@/lib/is-tip-listing';
import { classicListingCoverUrl, type PropertyFeedItem } from '@/types/property';

type Props = {
  items: PropertyFeedItem[];
};

export function MobileClassicSwipeFeed({ items }: Props) {
  const { isAuthenticated } = useAuth();
  const [brokenCoverIds, setBrokenCoverIds] = useState<Record<string, boolean>>({});
  const markCoverBroken = useCallback((id: string) => {
    setBrokenCoverIds((m) => ({ ...m, [id]: true }));
  }, []);

  const { currentItem, currentIndex, containerRef, total } = useCyclicFeedNavigation(items, {
    debugLabel: 'CLASSIC',
    getId: (p) => p.id,
  });

  if (!currentItem || total === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-lg font-semibold text-zinc-700">Žádné výsledky</p>
        <p className="mt-2 max-w-sm text-sm text-zinc-500">
          Zkuste upravit hledání nebo filtry.
        </p>
      </div>
    );
  }

  const cover = brokenCoverIds[currentItem.id] ? null : classicListingCoverUrl(currentItem);
  const coverSrc = cover ? nestAbsoluteAssetUrl(cover) : '';

  return (
    <div
      ref={containerRef}
      className="flex min-h-[calc(100dvh-7.5rem)] w-full flex-1 touch-pan-y flex-col px-2 pb-4 pt-1 outline-none"
      tabIndex={-1}
    >
      <article className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-[0_8px_32px_-12px_rgba(0,0,0,0.12)]">
        <div className="relative min-h-[42dvh] flex-1 bg-zinc-100">
          {isTipListing(currentItem) ? (
            <div className="absolute left-3 top-3 z-10">
              <TipCardBadge />
            </div>
          ) : null}
          {coverSrc ? (
            <img
              src={coverSrc}
              alt={currentItem.title}
              className="h-full w-full object-cover"
              onError={() => markCoverBroken(currentItem.id)}
            />
          ) : (
            <div className="flex h-full min-h-[42dvh] items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 text-sm text-zinc-400">
              Bez náhledu
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-2 p-4">
          <h3 className="line-clamp-2 text-lg font-semibold leading-snug tracking-tight text-zinc-900">
            {currentItem.title}
          </h3>
          <p className="text-sm text-zinc-500">{currentItem.location}</p>
          <ListingPriceDisplay
            as="p"
            price={currentItem.price}
            isAuthenticated={isAuthenticated}
            className="text-xl font-bold tabular-nums text-[#e85d00]"
          />
          <Link
            href={`/nemovitost/${currentItem.id}`}
            className="mt-2 inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] py-3.5 text-[15px] font-semibold text-white shadow-[0_6px_24px_-6px_rgba(255,106,0,0.45)] transition active:scale-[0.98]"
          >
            Zobrazit inzerát
          </Link>
          {total > 1 ? (
            <p className="pt-1 text-center text-[11px] font-medium text-zinc-400">
              {currentIndex + 1} / {total} · swipe nahoru = další, dolů = předchozí
            </p>
          ) : null}
        </div>
      </article>
    </div>
  );
}
