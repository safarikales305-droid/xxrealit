'use client';

import type { MediaItem } from './listing-detail-utils';
import { mediaUrl } from './listing-detail-utils';

type Props = {
  open: boolean;
  media: MediaItem[];
  index: number;
  title: string;
  onClose: () => void;
  onIndexChange: (i: number) => void;
};

export function ListingDetailLightbox({
  open,
  media,
  index,
  title,
  onClose,
  onIndexChange,
}: Props) {
  if (!open) return null;

  const item = media[index];
  const images = media.filter((m) => m.type === 'image');
  const imageOnlyIndex = item?.type === 'image' ? images.indexOf(item) : 0;

  return (
    <div className="fixed inset-0 z-[220] flex flex-col bg-black/95 p-4" role="dialog" aria-modal="true">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="truncate text-sm text-white/80">
          {title} · {index + 1} / {media.length}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
        >
          Zavřít
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center">
        {item?.type === 'video' ? (
          <video
            key={item.key}
            src={mediaUrl(item.url)}
            controls
            playsInline
            autoPlay
            className="max-h-[75vh] w-full max-w-5xl rounded-xl"
          />
        ) : item ? (
          <img
            src={mediaUrl(item.url)}
            alt={title}
            className="max-h-[75vh] w-full max-w-5xl rounded-xl object-contain"
          />
        ) : null}
      </div>
      {media.length > 1 ? (
        <div className="mt-4 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => onIndexChange(Math.max(0, index - 1))}
            disabled={index <= 0}
            className="rounded-full bg-white/10 px-4 py-2 text-sm text-white disabled:opacity-30"
          >
            Předchozí
          </button>
          <button
            type="button"
            onClick={() => onIndexChange(Math.min(media.length - 1, index + 1))}
            disabled={index >= media.length - 1}
            className="rounded-full bg-white/10 px-4 py-2 text-sm text-white disabled:opacity-30"
          >
            Další
          </button>
        </div>
      ) : null}
      {images.length > 1 && item?.type === 'image' ? (
        <div className="mt-3 flex justify-center gap-1 overflow-x-auto pb-2">
          {images.map((img, i) => (
            <button
              key={img.key}
              type="button"
              onClick={() => onIndexChange(media.indexOf(img))}
              className={`size-14 shrink-0 overflow-hidden rounded-lg border-2 ${
                i === imageOnlyIndex ? 'border-orange-500' : 'border-transparent opacity-70'
              }`}
            >
              <img src={mediaUrl(img.url)} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
