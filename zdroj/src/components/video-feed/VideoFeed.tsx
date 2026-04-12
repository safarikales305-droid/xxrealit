'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ShortVideo } from '@/lib/nest-client';
import { isShortVideoPlayable } from '@/lib/feed/loop-feed';
import VideoCard from './VideoCard';

type VideoFeedProps = {
  /** Pořadí z rodiče (např. sdílené video první); bez interního přerovnání. */
  videos: ShortVideo[];
  /** Mobil shorts: otevře stejný panel filtrů jako v klasickém režimu (tlačítko ve videu). */
  onMobileFiltersOpen?: () => void;
};

/**
 * Mobilní shorts: jeden slide = celá výška feedu.
 * Desktop: zaoblený rám.
 * — Odfiltruje neplatná URL, po chybě přehrávání záznam odebere.
 * — Po doscrollování na konec se feed vrátí na začátek (smyčka).
 */
export function VideoFeed({ videos, onMobileFiltersOpen }: VideoFeedProps) {
  const [excludedIds, setExcludedIds] = useState<Set<string>>(() => new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const feedIdsKey = useMemo(() => videos.map((v) => v.id).join('\0'), [videos]);

  useEffect(() => {
    setExcludedIds(new Set());
  }, [feedIdsKey]);

  const validVideos = useMemo(
    () => videos.filter((v) => isShortVideoPlayable(v) && !excludedIds.has(v.id)),
    [videos, excludedIds],
  );

  const onBroken = useCallback((id: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  useLayoutEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const max = root.scrollHeight - root.clientHeight;
    if (max > 0 && root.scrollTop > max) {
      root.scrollTop = max;
    }
  }, [validVideos.length]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    const onScroll = () => {
      const max = root.scrollHeight - root.clientHeight;
      if (max <= 8) return;
      if (root.scrollTop >= max - 4) {
        root.scrollTo({ top: 0, behavior: 'auto' });
      }
    };

    root.addEventListener('scroll', onScroll, { passive: true });
    return () => root.removeEventListener('scroll', onScroll);
  }, [validVideos.length]);

  if (validVideos.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 bg-black px-4 text-center">
        <p className="text-sm font-medium text-white/85">Žádné platné video inzeráty</p>
        <p className="max-w-xs text-xs leading-relaxed text-white/55">
          Záznamy bez funkčního videa jsou skryté. Zkuste upravit filtry nebo se vraťte později.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto overflow-x-hidden overscroll-y-contain pb-[env(safe-area-inset-bottom)] pt-0"
      >
        {validVideos.map((video) => (
          <div
            key={video.id}
            data-video-slide={video.id}
            className="h-full min-h-0 w-full shrink-0 snap-start snap-always overflow-hidden rounded-none bg-black max-md:min-h-[calc(100dvh-3.75rem)] md:rounded-xl"
          >
            <VideoCard
              video={video}
              onMobileFiltersOpen={onMobileFiltersOpen}
              onVideoBroken={onBroken}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
