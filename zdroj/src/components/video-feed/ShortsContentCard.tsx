'use client';

import Link from 'next/link';
import { useState } from 'react';
import { YoutubeLazyPlayer } from '@/components/community/YoutubeLazyPlayer';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import {
  formatShortsDate,
  SHORTS_BADGE_LABELS,
  type ShortsFeedItem,
} from '@/lib/shorts-feed';

type Props = {
  item: ShortsFeedItem;
  isActive: boolean;
};

export function ShortsContentCard({ item, isActive }: Props) {
  const p = item.payload;
  const title = String(p.title ?? '');
  const teaser = String(p.teaser ?? '').trim();
  const sourceName = String(p.sourceName ?? 'XXREALIT');
  const href = String(p.href ?? '#');
  const imageUrl = typeof p.imageUrl === 'string' ? p.imageUrl : '';
  const categoryLabel = String(p.categoryLabel ?? SHORTS_BADGE_LABELS[item.contentType]);
  const publishedLabel = formatShortsDate(item.publishedAt);
  const [imgError, setImgError] = useState(false);

  if (item.contentType === 'youtube') {
    const videoId = String(p.youtubeVideoId ?? '');
    const thumb = String(p.youtubeThumbnailUrl ?? imageUrl);
    return (
      <div className="relative flex h-full min-h-0 w-full flex-col bg-[#0a0a0a] text-white lg:bg-zinc-50 lg:text-zinc-900">
        <span className="absolute left-3 top-3 z-20 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm lg:bg-white/90 lg:text-zinc-800">
          {SHORTS_BADGE_LABELS.youtube}
        </span>
        <div className="flex min-h-0 flex-1 flex-col justify-center px-3 py-4 md:px-6">
          <div className="mx-auto w-full max-w-lg">
            {isActive ? (
              <YoutubeLazyPlayer
                videoId={videoId}
                title={title}
                thumbnailUrl={thumb}
                embeddable={p.youtubeEmbeddable !== false}
                watchUrl={href.startsWith('http') ? href : undefined}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumb}
                alt={title}
                className="aspect-video w-full rounded-xl object-cover"
                loading="lazy"
              />
            )}
          </div>
        </div>
        <div className="shrink-0 space-y-2 bg-gradient-to-t from-black/90 via-black/70 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8 lg:from-white lg:via-white lg:to-transparent">
          <p className="text-xs text-white/70 lg:text-zinc-500">{sourceName}</p>
          <h2 className="line-clamp-2 text-lg font-bold leading-snug">{title}</h2>
          {teaser ? <p className="line-clamp-3 text-sm text-white/80 lg:text-zinc-600">{teaser}</p> : null}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {publishedLabel ? (
              <span className="text-xs text-white/60 lg:text-zinc-500">{publishedLabel}</span>
            ) : null}
            <Link
              href={href}
              className="ml-auto inline-flex rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-2 text-sm font-semibold text-white shadow-md transition hover:opacity-95"
            >
              Otevřít detail
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const resolvedImg = imageUrl ? nestAbsoluteAssetUrl(imageUrl) : '';
  if (!resolvedImg || imgError) return null;

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#0a0a0a] text-white lg:bg-zinc-50 lg:text-zinc-900">
      <span className="absolute left-3 top-3 z-20 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm lg:bg-white/90 lg:text-zinc-800">
        {SHORTS_BADGE_LABELS[item.contentType]}
      </span>
      <div className="relative min-h-0 flex-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={resolvedImg}
          alt={title}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setImgError(true)}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent lg:from-zinc-900/80" />
      </div>
      <div className="absolute inset-x-0 bottom-0 z-10 space-y-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-16">
        <p className="text-xs font-medium uppercase tracking-wide text-orange-300 lg:text-orange-600">
          {categoryLabel}
        </p>
        <h2 className="line-clamp-3 text-xl font-bold leading-snug">{title}</h2>
        {teaser ? <p className="line-clamp-3 text-sm text-white/85 lg:text-zinc-600">{teaser}</p> : null}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-white/65 lg:text-zinc-500">{sourceName}</span>
          {publishedLabel ? (
            <span className="text-xs text-white/50 lg:text-zinc-400">· {publishedLabel}</span>
          ) : null}
          <Link
            href={href}
            className="ml-auto inline-flex rounded-full border border-white/40 bg-white/10 px-5 py-2 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20 lg:border-orange-200 lg:bg-orange-50 lg:text-orange-800 lg:hover:bg-orange-100"
          >
            Číst více
          </Link>
        </div>
      </div>
    </div>
  );
}
