'use client';

import { useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import type { MediaItem } from './listing-detail-utils';
import { mediaUrl } from './listing-detail-utils';

type Props = {
  title: string;
  media: MediaItem[];
  onOpenLightbox: (index: number) => void;
};

export function ListingDetailGallery({ title, media, onOpenLightbox }: Props) {
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  const images = useMemo(() => media.filter((m) => m.type === 'image'), [media]);
  const videos = useMemo(() => media.filter((m) => m.type === 'video'), [media]);

  const hero = images[0] ?? null;
  const sideSlots = useMemo(() => {
    const slots: Array<MediaItem | 'more' | 'video'> = [];
    if (videos[0]) slots.push(videos[0]);
    for (let i = 1; i < Math.min(4, images.length); i++) slots.push(images[i]);
    while (slots.length < 4) slots.push('more');
    if (images.length > 5) {
      const idx = slots.findIndex((s) => s === 'more');
      if (idx >= 0) slots[idx] = 'more';
    }
    return slots.slice(0, 4);
  }, [images, videos]);

  const extraCount = Math.max(0, images.length - 5);

  if (!hero && videos.length === 0) {
    return (
      <div className="flex min-h-[220px] items-center justify-center rounded-2xl bg-zinc-100 text-sm text-zinc-500 shadow-sm">
        Bez fotografií
      </div>
    );
  }

  function renderThumb(item: MediaItem, className: string, onClick: () => void) {
    if (item.type === 'video') {
      return (
        <button
          type="button"
          onClick={onClick}
          className={`group relative overflow-hidden bg-zinc-900 ${className}`}
          aria-label="Přehrát video"
        >
          <video
            src={mediaUrl(item.url)}
            muted
            playsInline
            className="size-full object-cover opacity-80"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/35 transition group-hover:bg-black/45">
            <span className="flex size-12 items-center justify-center rounded-full bg-white/95 text-zinc-900 shadow-lg">
              <Play className="ml-0.5 size-6 fill-current" aria-hidden />
            </span>
          </span>
        </button>
      );
    }
    if (broken[item.key]) {
      return (
        <div className={`flex items-center justify-center bg-zinc-200 text-xs text-zinc-500 ${className}`}>
          Náhled nedostupný
        </div>
      );
    }
    return (
      <button type="button" onClick={onClick} className={`overflow-hidden ${className}`}>
        <img
          src={mediaUrl(item.url)}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover transition duration-300 hover:scale-105"
          onError={() => setBroken((b) => ({ ...b, [item.key]: true }))}
        />
      </button>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)] md:gap-3">
      {hero ? (
        <button
          type="button"
          onClick={() => onOpenLightbox(0)}
          className="relative min-h-[220px] overflow-hidden rounded-2xl bg-zinc-900 shadow-md md:min-h-[380px] md:row-span-2"
          aria-label="Otevřít galerii"
        >
          {!broken[hero.key] ? (
            <img
              src={mediaUrl(hero.url)}
              alt={title}
              className="size-full object-cover"
              fetchPriority="high"
              onError={() => setBroken((b) => ({ ...b, [hero.key]: true }))}
            />
          ) : (
            <div className="flex size-full items-center justify-center text-sm text-zinc-400">Bez náhledu</div>
          )}
        </button>
      ) : videos[0] ? (
        renderThumb(
          videos[0],
          'relative min-h-[220px] overflow-hidden rounded-2xl shadow-md md:min-h-[380px] md:row-span-2',
          () => onOpenLightbox(media.indexOf(videos[0])),
        )
      ) : null}

      <div className="grid grid-cols-2 gap-2 md:gap-3">
        {sideSlots.map((slot, i) => {
          if (slot === 'more') {
            if (extraCount <= 0) {
              return (
                <div
                  key={`empty-${i}`}
                  className="hidden min-h-[90px] rounded-xl bg-zinc-100 md:block"
                />
              );
            }
            return (
              <button
                key="more"
                type="button"
                onClick={() => onOpenLightbox(4)}
                className="flex min-h-[90px] flex-col items-center justify-center rounded-xl bg-zinc-900/90 text-white shadow-md transition hover:bg-zinc-800 md:min-h-[110px]"
              >
                <span className="text-lg font-bold">+{extraCount}</span>
                <span className="text-xs text-white/80">dalších fotografií</span>
              </button>
            );
          }
          const globalIndex = media.indexOf(slot);
          return (
            <div key={slot.key}>
              {renderThumb(
                slot,
                'min-h-[90px] w-full rounded-xl shadow-sm md:min-h-[110px]',
                () => onOpenLightbox(globalIndex >= 0 ? globalIndex : 0),
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
