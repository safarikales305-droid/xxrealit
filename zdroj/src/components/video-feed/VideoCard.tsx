'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import type { ShortVideo } from '@/lib/nest-client';
import { LikeButton } from './LikeButton';

type VideoCardProps = {
  video: ShortVideo;
  liked: boolean;
  onToggleLike: () => void;
  bindContainerRef?: (el: HTMLElement | null) => void;
};

function VideoCardBase({
  video,
  liked,
  onToggleLike,
  bindContainerRef,
}: VideoCardProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    const media = videoRef.current;
    if (!root || !media) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.7) {
          void media.play().catch(() => undefined);
        } else {
          media.pause();
        }
      },
      { threshold: [0, 0.3, 0.7, 1] },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const caption = String(video.description ?? video.content ?? '').trim();
  const shouldTruncate = caption.length > 130;
  const shownCaption =
    shouldTruncate && !expanded ? `${caption.slice(0, 130)}...` : caption;

  return (
    <article
      ref={(el) => {
        rootRef.current = el;
        bindContainerRef?.(el);
      }}
      className="relative h-[calc(100dvh-9rem)] snap-start overflow-hidden rounded-xl bg-black md:h-[calc(100dvh-6rem)]"
    >
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        loop
        controls
        preload="metadata"
        className="w-full h-full object-cover"
        onError={(e) => console.log('VIDEO ERROR', e)}
        onLoadedData={() => console.log('VIDEO LOADED')}
      >
        <source
          src={nestAbsoluteAssetUrl(video.videoUrl ?? video.url ?? '')}
          type="video/mp4"
        />
      </video>

      <div className="absolute bottom-4 right-4 z-20">
        <LikeButton liked={liked} onToggle={onToggleLike} />
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 text-white">
        <p className="text-sm font-semibold">
          {String(
            (video.user?.name ?? video.user?.email ?? 'Autor') || 'Autor',
          )}
        </p>
        {caption ? (
          <div className="mt-1 text-sm leading-relaxed">
            <p className="whitespace-pre-wrap">{shownCaption}</p>
            {shouldTruncate ? (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-1 text-xs font-semibold text-orange-300"
              >
                {expanded ? 'Show less' : 'Show more'}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export const VideoCard = memo(VideoCardBase);
