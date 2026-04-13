'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import type { PropertyFeedItem } from '@/types/property';
import { useAuth } from '@/hooks/use-auth';
import { canCreateProfessionalListingsAndPosts } from '@/lib/roles';
import { ProfessionalOnlyDialog } from '@/components/auth/ProfessionalListingRestriction';
import { propertyFeedPrimaryVideoSrc, propertyRowPassesVideoFeedGate } from '@/lib/feed/loop-feed';
import { propertyListingHasVideo } from '@/lib/property-feed-filters';

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
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();
  const [professionalOnlyOpen, setProfessionalOnlyOpen] = useState(false);
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

  const markBroken = useCallback((id: string) => {
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

    const videos = root.querySelectorAll<HTMLVideoElement>(
      'video[data-property-id]',
    );
    videos.forEach((v) => observer.observe(v));

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

  const actionBtn =
    'flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/35 text-xl shadow-lg backdrop-blur-md transition duration-200 hover:scale-110 hover:border-white/35 hover:bg-black/50 active:scale-95';

  function handleHeaderAddListing() {
    if (isLoading) return;
    const path = '/inzerat/pridat';
    if (!isAuthenticated || !user) {
      router.push(`/prihlaseni?redirect=${encodeURIComponent(path)}`);
      return;
    }
    if (!canCreateProfessionalListingsAndPosts(user.role)) {
      setProfessionalOnlyOpen(true);
      return;
    }
    router.push(path);
  }

  if (feedItems.length === 0) {
    return (
      <div className="relative flex h-svh w-full flex-col items-center justify-center gap-2 bg-black px-6 text-center">
        <p className="text-sm font-medium text-white/85">Žádné platné položky ve feedu</p>
        <p className="max-w-xs text-xs text-white/50">
          Videa bez funkčního souboru jsou skrytá. Zkuste upravit filtry.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-svh w-full bg-black">
      <header className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <span className="pointer-events-auto text-sm font-semibold tracking-wide text-white/90">
          Realitka
        </span>
        <button
          type="button"
          onClick={handleHeaderAddListing}
          className="pointer-events-auto rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-md transition hover:scale-105 hover:bg-white/20"
        >
          + Přidat
        </button>
      </header>

      <div
        ref={containerRef}
        className="h-svh w-full snap-y snap-mandatory overflow-y-scroll scroll-smooth"
      >
        {feedItems.map((p) => {
          const isActive = activeId === p.id;
          const videoSrc = propertyFeedPrimaryVideoSrc(p);
          const wantsVideo = propertyListingHasVideo(p);

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
                {videoSrc ? (
                  <video
                    data-property-id={p.id}
                    muted
                    playsInline
                    autoPlay
                    loop
                    controls
                    preload="metadata"
                    className="w-full h-full object-cover"
                    onError={() => markBroken(p.id)}
                  >
                    <source src={videoSrc} type="video/mp4" />
                  </video>
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-zinc-900 to-zinc-950 text-zinc-500">
                    <span className="text-sm">
                      {wantsVideo ? 'Video se nepodařilo načíst' : 'Bez videa'}
                    </span>
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

      <ProfessionalOnlyDialog
        open={professionalOnlyOpen}
        onClose={() => setProfessionalOnlyOpen(false)}
      />
    </div>
  );
}
