'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

type YoutubeLazyPlayerProps = {
  videoId: string;
  title?: string;
  thumbnailUrl?: string | null;
  embeddable?: boolean;
  watchUrl?: string | null;
  className?: string;
  /** Vyplní vertikální Shorts stage (9:16) místo klasického 16:9 boxu. */
  fillStage?: boolean;
};

export function YoutubeLazyPlayer({
  videoId,
  title,
  thumbnailUrl,
  embeddable = true,
  watchUrl,
  className = 'rounded-xl',
  fillStage = false,
}: YoutubeLazyPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const safeId = VIDEO_ID_RE.test(videoId) ? videoId : '';
  const thumb =
    thumbnailUrl?.trim() ||
    (safeId ? `https://i.ytimg.com/vi/${safeId}/hqdefault.jpg` : '');
  const embedSrc = safeId
    ? `https://www.youtube-nocookie.com/embed/${safeId}?autoplay=1&rel=0&modestbranding=1`
    : '';
  const external = watchUrl?.trim() || (safeId ? `https://www.youtube.com/watch?v=${safeId}` : '');

  if (!safeId) {
    return (
      <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-600">
        Video již není dostupné.
      </p>
    );
  }

  if (!embeddable) {
    return (
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-900">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={title ?? 'YouTube video'} className="aspect-video w-full object-cover opacity-80" />
        ) : null}
        <div className="space-y-2 p-4 text-sm text-white">
          <p>Video nelze přehrát přímo na XXREALIT.</p>
          {external ? (
            <a
              href={external}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex font-semibold text-orange-300 hover:underline"
            >
              Otevřít na YouTube
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  const stageClass = fillStage
    ? 'relative h-full w-full overflow-hidden bg-black'
    : `relative aspect-video w-full overflow-hidden bg-black ${className}`;

  if (playing) {
    return (
      <div className={stageClass}>
        <iframe
          src={embedSrc}
          title={title ?? 'YouTube video'}
          className="absolute inset-0 block h-full w-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      className={
        fillStage
          ? 'group relative block h-full w-full overflow-hidden bg-zinc-900'
          : `group relative block aspect-video w-full overflow-hidden bg-zinc-900 ${className}`
      }
      aria-label={title ? `Přehrát video: ${title}` : 'Přehrát YouTube video'}
    >
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumb}
          alt={title ?? 'YouTube video náhled'}
          className="h-full w-full object-cover transition group-hover:scale-[1.02]"
        />
      ) : (
        <div className="h-full w-full bg-zinc-800" />
      )}
      <span className="absolute inset-0 bg-black/25 transition group-hover:bg-black/35" />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition group-hover:scale-105">
          <Play className="ml-1 size-8 fill-current" />
        </span>
      </span>
    </button>
  );
}
