'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PropertyFeedItem } from '@/types/property';
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
  const [activeId, setActiveId] = useState<string | null>(
    items[0]?.id ?? null,
  );
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [likes, setLikes] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const p of items) init[p.id] = mockLikesForId(p.id);
    return init;
  });

  const containerRef = useRef<HTMLDivElement | null>(null);

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
  }, [items]);

  const toggleLike = useCallback((id: string) => {
    setLiked((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      const delta = next[id] ? 1 : -1;
      setLikes((l) => ({ ...l, [id]: Math.max(0, (l[id] ?? 0) + delta) }));
      return next;
    });
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="h-[calc(100vh-56px)] max-h-[calc(100vh-56px)] w-full min-h-0 snap-y snap-mandatory overflow-x-hidden overflow-y-scroll scroll-smooth overscroll-y-contain md:h-[calc(100vh-64px)] md:max-h-[calc(100vh-64px)]"
    >
      {items.map((p) => (
        <PropertyCard
          key={p.id + (p.videoUrl ?? '')}
          property={p}
          isActive={activeId === p.id}
          liked={!!liked[p.id]}
          likes={likes[p.id] ?? 0}
          onToggleLike={() => toggleLike(p.id)}
        />
      ))}
    </div>
  );
}
