'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PropertyFeedItem } from '@/types/property';
import { resolveShortsPublicSrc } from '@/lib/video-url';

const PRICE_FMT = new Intl.NumberFormat('cs-CZ', {
  style: 'currency',
  currency: 'CZK',
  maximumFractionDigits: 0,
});

const glowBtnBase =
  'relative flex size-14 shrink-0 items-center justify-center rounded-full border border-white/20 bg-gradient-to-br from-[#ff6a00]/45 to-[#ff3c00]/40 text-xl text-white shadow-[0_0_24px_-2px_rgba(255,106,0,0.55),0_0_16px_-4px_rgba(255,60,0,0.35),inset_0_1px_0_0_rgba(255,255,255,0.2)] backdrop-blur-xl transition duration-300 ease-out hover:scale-110 hover:border-white/35 active:scale-95';

function mockLikesForId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return 48 + Math.abs(h % 880);
}

type Clip = PropertyFeedItem & { src: string };

type Props = {
  items: PropertyFeedItem[];
};

/**
 * TikTok-style vertical feed: videos load only from `public/videos` via `/videos/...`.
 */
export function ShortsFeed({ items }: Props) {
  const clips = useMemo<Clip[]>(() => {
    return items.map((item, index) => ({
      ...item,
      src: resolveShortsPublicSrc(item, index),
    }));
  }, [items]);

  const [activeId, setActiveId] = useState<string | null>(
    clips[0]?.id ?? null,
  );
  const [mutedById, setMutedById] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const c of clips) init[c.id] = true;
    return init;
  });
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [likes, setLikes] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const c of clips) init[c.id] = mockLikesForId(c.id);
    return init;
  });

  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setActiveId(clips[0]?.id ?? null);
    const m: Record<string, boolean> = {};
    for (const c of clips) m[c.id] = true;
    setMutedById(m);
    setLikes(() => {
      const init: Record<string, number> = {};
      for (const c of clips) init[c.id] = mockLikesForId(c.id);
      return init;
    });
    setLiked({});
  }, [clips]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const vid = entry.target as HTMLVideoElement;
          const id = vid.dataset.clipId;
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
      .querySelectorAll<HTMLVideoElement>('video[data-clip-id]')
      .forEach((v) => observer.observe(v));

    return () => observer.disconnect();
  }, [clips]);

  const toggleLike = useCallback((id: string) => {
    setLiked((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      const delta = next[id] ? 1 : -1;
      setLikes((l) => ({ ...l, [id]: Math.max(0, (l[id] ?? 0) + delta) }));
      return next;
    });
  }, []);

  const toggleMuted = useCallback((id: string) => {
    setMutedById((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  if (clips.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="h-full min-h-0 w-full snap-y snap-mandatory overflow-x-hidden overflow-y-scroll scroll-smooth overscroll-y-contain"
    >
      {clips.map((c) => {
        const isActive = activeId === c.id;
        const muted = mutedById[c.id] !== false;

        return (
          <section
            key={c.id + c.src}
            className="relative isolate box-border h-screen w-full max-w-full shrink-0 snap-start snap-always overflow-hidden overflow-x-hidden bg-black"
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <video
                data-clip-id={c.id}
                src={c.src}
                autoPlay
                muted={muted}
                loop
                playsInline
                preload="metadata"
                className="h-full w-full object-cover"
                onError={() =>
                  console.error('[ShortsFeed] video error', c.src)
                }
              />
            </div>

            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-transparent"
              aria-hidden
            />

            <div
              className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${
                isActive ? 'opacity-100' : 'opacity-0'
              }`}
              aria-hidden
            >
              <div className="absolute inset-0 bg-gradient-to-t from-[#ff6a00]/[0.1] via-transparent to-[#ff3c00]/[0.05]" />
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-6 pb-20 pt-44 pr-[5rem] sm:px-8 sm:pb-[4.5rem] sm:pr-[5.5rem]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70 drop-shadow-lg">
                Nemovitost
              </p>
              <h2 className="mt-3 max-w-[min(100%,24rem)] text-[1.7rem] font-semibold leading-[1.12] tracking-[-0.035em] text-white drop-shadow-lg sm:max-w-xl sm:text-[1.85rem]">
                {c.title}
              </h2>
              <p className="mt-3.5 text-[15px] font-medium leading-relaxed text-white/90 drop-shadow-lg">
                {c.location}
              </p>
              <p className="mt-3 bg-gradient-to-r from-[#ffb366] via-[#ff8c42] to-[#ff6a00] bg-clip-text text-[1.45rem] font-bold tabular-nums tracking-[-0.02em] text-transparent sm:text-[1.6rem] [filter:drop-shadow(0_2px_10px_rgba(0,0,0,0.5))]">
                {PRICE_FMT.format(c.price)}
              </p>
            </div>

            <div className="absolute bottom-24 right-5 z-10 flex flex-col items-center gap-6 sm:bottom-28 sm:right-7">
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  aria-label="Líbí se mi"
                  onClick={() => toggleLike(c.id)}
                  className={`${glowBtnBase} ${
                    liked[c.id]
                      ? 'border-rose-400/60 from-rose-500/50 to-[#ff3c00]/45'
                      : ''
                  }`}
                >
                  {liked[c.id] ? '❤️' : '🤍'}
                </button>
                <span className="text-[11px] font-bold tabular-nums text-white drop-shadow-lg">
                  {likes[c.id] ?? 0}
                </span>
              </div>
              <button
                type="button"
                aria-label={muted ? 'Zapnout zvuk' : 'Vypnout zvuk'}
                onClick={() => toggleMuted(c.id)}
                className={glowBtnBase}
              >
                {muted ? '🔇' : '🔊'}
              </button>
              <button type="button" aria-label="Komentáře" className={glowBtnBase}>
                💬
              </button>
              <button type="button" aria-label="Kontakt" className={glowBtnBase}>
                📩
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
