'use client';

import { X } from 'lucide-react';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import { hostnameFromUrl } from '@/lib/extract-first-url';

export type LinkPreviewData = {
  url: string;
  title: string;
  description: string;
  image: string | null;
  siteName: string;
  failed?: boolean;
};

type Props = {
  preview: LinkPreviewData;
  onRemove?: () => void;
  compact?: boolean;
};

export function LinkPreviewCard({ preview, onRemove, compact = false }: Props) {
  const href = preview.url.trim();
  const imageSrc = preview.image?.trim()
    ? nestAbsoluteAssetUrl(preview.image.trim())
    : '';
  const domain = preview.siteName?.trim() || hostnameFromUrl(href);
  const title = preview.title?.trim() || domain;
  const description = preview.description?.trim() || '';

  return (
    <div className="relative mt-3 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50">
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="absolute right-2 top-2 z-10 flex size-8 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70"
          aria-label="Odstranit náhled odkazu"
        >
          <X className="size-4" />
        </button>
      ) : null}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="block transition hover:bg-zinc-100/80"
      >
        {imageSrc ? (
          <div className={`w-full overflow-hidden bg-zinc-200 ${compact ? 'max-h-40' : 'max-h-56'}`}>
            <img
              src={imageSrc}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
        ) : null}
        <div className="space-y-1 px-3 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            {domain}
          </p>
          <p className={`font-semibold text-zinc-900 ${compact ? 'text-sm line-clamp-2' : 'text-base line-clamp-2'}`}>
            {title}
          </p>
          {description ? (
            <p className={`text-zinc-600 ${compact ? 'text-xs line-clamp-2' : 'text-sm line-clamp-3'}`}>
              {description}
            </p>
          ) : null}
        </div>
      </a>
    </div>
  );
}
