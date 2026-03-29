'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PropertyFeedItem } from '@/types/property';

const PRICE_FMT = new Intl.NumberFormat('cs-CZ', {
  style: 'currency',
  currency: 'CZK',
  maximumFractionDigits: 0,
});

function mockLikesForId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return 40 + Math.abs(h % 920);
}

type Props = {
  items: PropertyFeedItem[];
};

export function PropertyReelsFeed({ items }: Props) {
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

    const videos = root.querySelectorAll<HTMLVideoElement>(
      'video[data-property-id]',
    );
    videos.forEach((v) => observer.observe(v));

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

  const actionBtn =
    'flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/35 text-xl shadow-lg backdrop-blur-md transition duration-200 hover:scale-110 hover:border-white/35 hover:bg-black/50 active:scale-95';

  return (
    <div className="relative h-svh w-full bg-black">
      <header className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <span className="pointer-events-auto text-sm font-semibold tracking-wide text-white/90">
          Realitka
        </span>
        <Link
          href="/create"
          className="pointer-events-auto rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-md transition hover:scale-105 hover:bg-white/20"
        >
          + Přidat
        </Link>
      </header>

      <div
        ref={containerRef}
        className="h-svh w-full snap-y snap-mandatory overflow-y-scroll scroll-smooth"
      >
        {items.map((p) => {
          const isActive = activeId === p.id;
          return (
            <section
              key={p.id}
              className="relative flex h-svh w-full shrink-0 snap-start snap-always items-stretch justify-center"
            >
              <div
                className={`relative h-full w-full max-w-lg overflow-hidden shadow-2xl transition-[transform,box-shadow] duration-500 ease-out md:max-w-xl lg:max-w-lg ${
                  isActive
                    ? 'scale-[1.02] shadow-violet-500/10 ring-1 ring-white/10'
                    : 'scale-100'
                }`}
              >
                {p.videoUrl ? (
                  <video
                    data-property-id={p.id}
                    className="h-full w-full object-cover"
                    src={p.videoUrl}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    onError={(e) => console.error('VIDEO LOAD ERROR', e)}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-zinc-900 to-zinc-950 text-zinc-500">
                    <span className="text-sm">Bez videa</span>
                  </div>
                )}

                <div
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent"
                  aria-hidden
                />

                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-4 pr-[4.5rem] pt-32">
                  <h2 className="text-2xl font-bold leading-tight tracking-tight text-white drop-shadow-lg md:text-3xl">
                    {p.title}
                  </h2>
                  <p className="mt-2 text-base font-medium text-white/85">
                    {p.location}
                  </p>
                  <p className="mt-1 text-xl font-bold text-emerald-300 drop-shadow-md">
                    {PRICE_FMT.format(p.price)}
                  </p>
                </div>

                <div className="absolute bottom-[max(5rem,env(safe-area-inset-bottom))] right-3 z-10 flex flex-col items-center gap-5">
                  <div className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      aria-label="To se mi líbí"
                      onClick={() => toggleLike(p.id)}
                      className={`${actionBtn} ${liked[p.id] ? 'text-red-400' : 'text-white'}`}
                    >
                      {liked[p.id] ? '❤️' : '🤍'}
                    </button>
                    <span className="text-xs font-semibold tabular-nums text-white/90">
                      {likes[p.id] ?? 0}
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label="Komentáře"
                    className={actionBtn}
                  >
                    💬
                  </button>
                  <button
                    type="button"
                    aria-label="Uložit"
                    className={actionBtn}
                  >
                    🔖
                  </button>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
