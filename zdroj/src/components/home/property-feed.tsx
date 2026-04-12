'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PropertyFeedItem } from '@/types/property';
import { propertyRowPassesVideoFeedGate } from '@/lib/feed/loop-feed';
import { PropertyCard } from './property-card';

function mockLikesForId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return 48 + Math.abs(h % 880);
}

type Props = {
  items: PropertyFeedItem[];
};

export function PropertyFeed({ items }: Props) {
  const [excludedIds, setExcludedIds] = useState<Set<string>>(() => new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [likes, setLikes] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const p of items) init[p.id] = mockLikesForId(p.id);
    return init;
  });
  const containerRef = useRef<HTMLDivElement | null>(null);

  const itemsIdsKey = useMemo(() => items.map((i) => i.id).join('\0'), [items]);

  useEffect(() => {
    setExcludedIds(new Set());
  }, [itemsIdsKey]);

  const gatedItems = useMemo(
    () => items.filter(propertyRowPassesVideoFeedGate),
    [items],
  );

  const feedItems = useMemo(
    () => gatedItems.filter((p) => !excludedIds.has(p.id)),
    [gatedItems, excludedIds],
  );

  const onVideoBroken = useCallback((id: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  useLayoutEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const max = root.scrollHeight - root.clientHeight;
    if (max > 0 && root.scrollTop > max) {
      root.scrollTop = max;
    }
  }, [feedItems.length]);

  useEffect(() => {
    const root = containerRef.current;
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
  }, [feedItems.length]);

  useEffect(() => {
    if (feedItems.length === 0) return;
    setActiveId((prev) =>
      prev && feedItems.some((p) => p.id === prev) ? prev : feedItems[0]!.id,
    );
  }, [feedItems]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const vid = entry.target as HTMLVideoElement;
          const id = vid.dataset.propertyId;
          if (!id) continue;

          if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
            setActiveId(id);
            vid.play().catch(() => undefined);
          } else {
            vid.pause();
          }
        }
      },
      { root, threshold: [0, 0.25, 0.55, 0.85, 1] },
    );

    root
      .querySelectorAll<HTMLVideoElement>('video[data-property-id]')
      .forEach((v) => observer.observe(v));

    return () => observer.disconnect();
  }, [feedItems]);

  const toggleLike = useCallback((id: string) => {
    setLiked((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      const delta = next[id] ? 1 : -1;
      setLikes((l) => ({ ...l, [id]: Math.max(0, (l[id] ?? 0) + delta) }));
      return next;
    });
  }, []);

  if (feedItems.length === 0) {
    return (
      <div className="flex h-[calc(100vh-56px)] max-h-[calc(100vh-56px)] w-full flex-col items-center justify-center gap-2 bg-zinc-950 px-6 text-center md:h-[calc(100vh-64px)] md:max-h-[calc(100vh-64px)]">
        <p className="text-sm font-medium text-white/85">Žádné platné položky ve feedu</p>
        <p className="max-w-xs text-xs leading-relaxed text-white/50">
          Videa bez funkčního souboru jsou skrytá. Upravte filtry nebo zkuste to znovu později.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-[calc(100vh-56px)] max-h-[calc(100vh-56px)] w-full min-h-0 snap-y snap-mandatory overflow-x-hidden overflow-y-scroll scroll-smooth overscroll-y-contain md:h-[calc(100vh-64px)] md:max-h-[calc(100vh-64px)]"
    >
      {feedItems.map((p) => (
        <PropertyCard
          key={p.id + (p.videoUrl ?? '')}
          property={p}
          isActive={activeId === p.id}
          liked={!!liked[p.id]}
          likes={likes[p.id] ?? 0}
          onToggleLike={() => toggleLike(p.id)}
          onVideoBroken={onVideoBroken}
        />
      ))}
    </div>
  );
}
