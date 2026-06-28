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

type GallerySlot =
  | { type: 'media'; item: MediaItem; index: number }
  | { type: 'more' };

function mediaIndexMap(media: MediaItem[]): Map<string, number> {
  const map = new Map<string, number>();
  media.forEach((m, i) => map.set(m.key, i));
  return map;
}

export function ListingDetailGallery({ title, media, onOpenLightbox }: Props) {
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  const indexByKey = useMemo(() => mediaIndexMap(media), [media]);

  const images = useMemo(() => media.filter((m) => m.type === 'image'), [media]);
  const videos = useMemo(() => media.filter((m) => m.type === 'video'), [media]);

  const hero = images[0] ?? null;
  const heroIndex = hero != null ? (indexByKey.get(hero.key) ?? 0) : 0;

  const sideSlots = useMemo((): GallerySlot[] => {
    const slots: GallerySlot[] = [];

    const firstVideo = videos[0];
    if (firstVideo) {
      const idx = indexByKey.get(firstVideo.key) ?? 0;
      slots.push({ type: 'media', item: firstVideo, index: idx });
    }

    for (let i = 1; i < Math.min(4, images.length); i++) {
      const item = images[i];
      const idx = indexByKey.get(item.key) ?? 0;
      slots.push({ type: 'media', item, index: idx });
    }

    while (slots.length < 4) {
      slots.push({ type: 'more' });
    }

    return slots.slice(0, 4);
  }, [images, videos, indexByKey]);

  const extraCount = Math.max(0, images.length - 5);

  if (!hero && videos.length === 0) {
    return (
      <div className="flex min-h-[220px] items-center justify-center rounded-2xl bg-zinc-100 text-sm text-zinc-500 shadow-sm">
        Bez fotografií
      </div>
    );
  }

  function renderVideoThumb(item: MediaItem, className: string, index: number) {
    return (
      <button
        type="button"
        onClick={() => onOpenLightbox(index)}
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

  function renderImageThumb(item: MediaItem, className: string, index: number) {
    if (broken[item.key]) {
      return (
        <div className={`flex items-center justify-center bg-zinc-200 text-xs text-zinc-500 ${className}`}>
          Náhled nedostupný
        </div>
      );
    }
    return (
      <button type="button" onClick={() => onOpenLightbox(index)} className={`overflow-hidden ${className}`}>
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

  function renderMediaThumb(slot: Extract<GallerySlot, { type: 'media' }>, className: string) {
    const { item, index } = slot;
    if (item.type === 'video') {
      return renderVideoThumb(item, className, index);
    }
    return renderImageThumb(item, className, index);
  }

  const firstVideo = videos[0];
  const firstVideoIndex =
    firstVideo != null ? (indexByKey.get(firstVideo.key) ?? 0) : 0;

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)] md:gap-3">
      {hero ? (
        <button
          type="button"
          onClick={() => onOpenLightbox(heroIndex)}
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
      ) : firstVideo ? (
        renderVideoThumb(
          firstVideo,
          'relative min-h-[220px] overflow-hidden rounded-2xl shadow-md md:min-h-[380px] md:row-span-2',
          firstVideoIndex,
        )
      ) : null}

      <div className="grid grid-cols-2 gap-2 md:gap-3">
        {sideSlots.map((slot, i) => {
          if (slot.type === 'more') {
            if (extraCount <= 0) {
              return (
                <div
                  key={`gallery-empty-${i}`}
                  className="hidden min-h-[90px] rounded-xl bg-zinc-100 md:block"
                />
              );
            }
            return (
              <button
                key="gallery-more"
                type="button"
                onClick={() => onOpenLightbox(Math.min(4, images.length - 1))}
                className="flex min-h-[90px] flex-col items-center justify-center rounded-xl bg-zinc-900/90 text-white shadow-md transition hover:bg-zinc-800 md:min-h-[110px]"
              >
                <span className="text-lg font-bold">+{extraCount}</span>
                <span className="text-xs text-white/80">dalších fotografií</span>
              </button>
            );
          }

          return (
            <div key={`gallery-side-${slot.item.key}`}>
              {renderMediaThumb(
                slot,
                'min-h-[90px] w-full rounded-xl shadow-sm md:min-h-[110px]',
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
