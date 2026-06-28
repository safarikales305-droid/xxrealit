'use client';

import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';
import { CyclicFeedViewport, type CyclicFeedNav } from '@/components/feed/CyclicFeedViewport';
import { TipCardBadge } from '@/components/listing/TipBadges';
import { ListingPriceDisplay } from '@/components/pricing/ListingPriceDisplay';
import { useGuestRegistrationGate } from '@/hooks/use-guest-registration-gate';
import { useAuth } from '@/hooks/use-auth';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import { logListingDetailNavigation } from '@/lib/listing-detail-debug';
import { isTipListing } from '@/lib/is-tip-listing';
import { classicListingCoverUrl, type PropertyFeedItem } from '@/types/property';

type Props = {
  items: PropertyFeedItem[];
};

function ClassicMobileCard({
  item,
  coverBroken,
  onCoverBroken,
}: {
  item: PropertyFeedItem;
  coverBroken: boolean;
  onCoverBroken: (id: string) => void;
}) {
  const { isAuthenticated } = useAuth();
  const cover = coverBroken ? null : classicListingCoverUrl(item);
  const coverSrc = cover ? nestAbsoluteAssetUrl(cover) : '';

  return (
    <article className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-[0_8px_32px_-12px_rgba(0,0,0,0.12)]">
      <div className="relative min-h-0 flex-1 bg-zinc-100">
        {isTipListing(item) ? (
          <div className="absolute left-3 top-3 z-10">
            <TipCardBadge />
          </div>
        ) : null}
        {coverSrc ? (
          <img
            src={coverSrc}
            alt={item.title}
            className="h-full w-full object-cover"
            onError={() => onCoverBroken(item.id)}
          />
        ) : (
          <div className="flex h-full min-h-[42dvh] items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 text-sm text-zinc-400">
            Bez náhledu
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-lg font-semibold leading-snug tracking-tight text-zinc-900">
          {item.title}
        </h3>
        <p className="text-sm text-zinc-500">{item.location}</p>
        <ListingPriceDisplay
          as="p"
          price={item.price}
          isAuthenticated={isAuthenticated}
          className="text-xl font-bold tabular-nums text-[#e85d00]"
        />
        <Link
          href={`/nemovitost/${item.id}?source=classic`}
          onClick={() =>
            logListingDetailNavigation('click-open-listing', {
              listingId: item.id,
              targetDetailUrl: `/nemovitost/${encodeURIComponent(item.id)}?source=classic`,
              currentHost: typeof window !== 'undefined' ? window.location.host : '',
              source: 'classic-mobile',
            })
          }
          className="mt-2 inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] py-3.5 text-[15px] font-semibold text-white shadow-[0_6px_24px_-6px_rgba(255,106,0,0.45)] transition active:scale-[0.98]"
        >
          Zobrazit inzerát
        </Link>
      </div>
    </article>
  );
}

export function MobileClassicSwipeFeed({ items }: Props) {
  const { reportGuestListingViewed } = useGuestRegistrationGate();
  const [brokenCoverIds, setBrokenCoverIds] = useState<Record<string, boolean>>({});
  const lastReportedIdRef = useRef<string | null>(null);

  const markCoverBroken = useCallback((id: string) => {
    setBrokenCoverIds((m) => ({ ...m, [id]: true }));
  }, []);

  const handleNavigation = useCallback(
    (nav: CyclicFeedNav) => {
      const item = items[nav.currentIndex];
      if (!item || item.id === lastReportedIdRef.current) return;
      lastReportedIdRef.current = item.id;
      reportGuestListingViewed(item.id);
    },
    [items, reportGuestListingViewed],
  );

  return (
    <CyclicFeedViewport
      items={items}
      getId={(p) => p.id}
      debugLabel="CLASSIC"
      onNavigation={handleNavigation}
      className="flex min-h-[calc(100dvh-7.5rem)] w-full flex-1 touch-pan-y flex-col px-2 pb-4 pt-1"
      viewportClassName="min-h-[calc(100dvh-8rem)] flex-1"
      emptyState={
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
          <p className="text-lg font-semibold text-zinc-700">Žádné výsledky</p>
          <p className="mt-2 max-w-sm text-sm text-zinc-500">
            Zkuste upravit hledání nebo filtry.
          </p>
        </div>
      }
    >
      {(item) => (
        <div className="flex h-full flex-col px-0.5 pb-1">
          <ClassicMobileCard
            item={item}
            coverBroken={Boolean(brokenCoverIds[item.id])}
            onCoverBroken={markCoverBroken}
          />
        </div>
      )}
    </CyclicFeedViewport>
  );
}
