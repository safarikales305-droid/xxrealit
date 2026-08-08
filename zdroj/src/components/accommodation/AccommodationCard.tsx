'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Heart, MapPin, Star } from 'lucide-react';
import {
  ACCOMMODATION_TYPE_LABELS,
  formatAccommodationPrice,
  type AccommodationItem,
} from '@/lib/accommodation-client';

type Props = {
  item: AccommodationItem;
  onFavorite?: (id: string) => void;
  favoriting?: boolean;
};

export function AccommodationCard({ item, onFavorite, favoriting }: Props) {
  const highlights = [
    item.wifi ? 'Wi-Fi' : null,
    item.breakfast ? 'Snídaně' : null,
    item.parking ? 'Parkování' : null,
    item.wellness ? 'Wellness' : null,
    item.pool ? 'Bazén' : null,
  ].filter(Boolean) as string[];

  return (
    <article className="group overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition hover:shadow-md">
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-zinc-100">
        {item.coverPhoto ? (
          <Image
            src={item.coverPhoto}
            alt={item.name}
            fill
            className="object-cover transition group-hover:scale-[1.02]"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-zinc-400">Bez fotografie</div>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-zinc-800 shadow">
          {ACCOMMODATION_TYPE_LABELS[item.type] ?? item.type}
        </span>
        {onFavorite ? (
          <button
            type="button"
            disabled={favoriting}
            onClick={() => onFavorite(item.id)}
            className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full bg-white/95 shadow transition hover:scale-105 disabled:opacity-50"
            aria-label="Oblíbené"
          >
            <Heart
              className={`size-4 ${item.favorited ? 'fill-red-500 text-red-500' : 'text-zinc-700'}`}
            />
          </button>
        ) : null}
      </div>

      <div className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-zinc-900">{item.name}</h3>
            <p className="mt-0.5 flex items-center gap-1 text-sm text-zinc-600">
              <MapPin className="size-3.5 shrink-0" />
              <span className="truncate">
                {item.city}
                {item.region ? ` · ${item.region}` : ''}
              </span>
            </p>
          </div>
          {item.stars ? (
            <span className="shrink-0 text-xs font-medium text-amber-600">{item.stars}★</span>
          ) : null}
        </div>

        {item.rating != null ? (
          <p className="flex items-center gap-1 text-sm">
            <Star className="size-4 fill-amber-400 text-amber-400" />
            <span className="font-semibold text-zinc-900">{item.rating.toFixed(1)}</span>
            <span className="text-zinc-500">({item.reviewCount} recenzí)</span>
          </p>
        ) : null}

        {highlights.length > 0 ? (
          <p className="line-clamp-1 text-xs text-zinc-600">{highlights.join(' · ')}</p>
        ) : null}

        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-sm font-bold text-zinc-900">{formatAccommodationPrice(item)}</p>
          <Link
            href={`/ubytovani/${item.slug}`}
            className="rounded-lg bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-95"
          >
            Detail
          </Link>
        </div>
      </div>
    </article>
  );
}

export function AccommodationCardSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <div className="aspect-[16/10] bg-zinc-200" />
      <div className="space-y-3 p-4">
        <div className="h-4 w-3/4 rounded bg-zinc-200" />
        <div className="h-3 w-1/2 rounded bg-zinc-200" />
        <div className="h-3 w-full rounded bg-zinc-200" />
        <div className="h-8 w-full rounded bg-zinc-200" />
      </div>
    </div>
  );
}
