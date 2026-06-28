'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ListingPriceDisplay } from '@/components/pricing/ListingPriceDisplay';
import { listingDetailHref } from '@/lib/listing-detail-navigation';
import { classicListingCoverUrl, type PropertyFeedItem } from '@/types/property';
import { nestAbsoluteAssetUrl } from '@/lib/api';

type Props = {
  items: PropertyFeedItem[];
  isAuthenticated: boolean;
};

export function ListingSimilarCarousel({ items, isAuthenticated }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  if (items.length === 0) return null;

  function scroll(dir: -1 | 1) {
    scrollRef.current?.scrollBy({ left: dir * 280, behavior: 'smooth' });
  }

  return (
    <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-zinc-900">Podobné nabídky</h2>
        <div className="hidden gap-1 sm:flex">
          <button
            type="button"
            onClick={() => scroll(-1)}
            className="rounded-full border border-zinc-200 p-2 hover:bg-zinc-50"
            aria-label="Předchozí"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            className="rounded-full border border-zinc-200 p-2 hover:bg-zinc-50"
            aria-label="Další"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => {
          const thumb = classicListingCoverUrl(item);
          const src = thumb ? nestAbsoluteAssetUrl(thumb) : null;
          return (
            <Link
              key={item.id}
              href={listingDetailHref(item.id, 'classic')}
              className="w-[260px] shrink-0 snap-start overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition hover:border-orange-200 hover:shadow-md"
            >
              <div className="relative aspect-[4/3] bg-zinc-100">
                {src ? (
                  <img src={src} alt="" loading="lazy" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-xs text-zinc-400">
                    Bez fotky
                  </div>
                )}
              </div>
              <div className="p-3">
                <p className="line-clamp-2 text-sm font-semibold text-zinc-900">{item.title}</p>
                <p className="mt-1 text-xs text-zinc-500">{item.location}</p>
                <ListingPriceDisplay
                  as="p"
                  price={item.price}
                  isAuthenticated={isAuthenticated}
                  className="mt-2 text-sm font-bold text-[#e85d00]"
                  labelClassName="sr-only"
                />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
