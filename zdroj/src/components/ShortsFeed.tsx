'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Mail } from 'lucide-react';
import { CommentsPlaceholder } from '@/components/feed/comments-placeholder';
import { MessageSellerModal } from '@/components/messages/MessageSellerModal';
import { useAuth } from '@/hooks/use-auth';
import { toPublicApiUrl } from '@/lib/public-api';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import type { PropertyFeedItem } from '@/types/property';
import { isPropertyFeedVideoPlayable, propertyFeedPrimaryVideoSrc } from '@/lib/feed/loop-feed';

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

function formatViewsCount(value: number | null | undefined): string {
  const n = Math.max(0, Math.trunc(value ?? 0));
  if (n < 1000) return n.toLocaleString('cs-CZ');
  if (n < 10_000) {
    const oneDecimal = Math.floor(n / 100) / 10;
    return `${oneDecimal.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} tis.`;
  }
  const thousands = Math.floor(n / 1000);
  return `${thousands.toLocaleString('cs-CZ')} tis.`;
}

type Clip = PropertyFeedItem & { src: string };
type CompanyAd = {
  id: string;
  imageUrl: string;
  title: string;
  description: string;
  ctaText: string;
  targetUrl: string;
  company?: { name?: string | null };
};

type Props = {
  items: PropertyFeedItem[];
};

/**
 * TikTok-style vertical feed pro shorts z API (nemovitosti).
 */
export function ShortsFeed({ items }: Props) {
  const router = useRouter();
  const { user, isAuthenticated, apiAccessToken } = useAuth();
  const [sellerClip, setSellerClip] = useState<Clip | null>(null);
  const [sellerActionHint, setSellerActionHint] = useState<string | null>(null);
  const [brokenClipIds, setBrokenClipIds] = useState<Set<string>>(() => new Set());
  const [adsByClipId, setAdsByClipId] = useState<Record<string, CompanyAd | null>>({});
  const [adPanelOpenByClipId, setAdPanelOpenByClipId] = useState<Record<string, boolean>>({});
  const [hasSeenAdClipIds, setHasSeenAdClipIds] = useState<Set<string>>(() => new Set());
  const [brokenAdImageByClipId, setBrokenAdImageByClipId] = useState<Record<string, boolean>>({});
  const [adInteractionTick, setAdInteractionTick] = useState(0);
  const lastAdShownAtRef = useRef(0);

  const itemsIdsKey = useMemo(() => items.map((i) => i.id).join('\0'), [items]);

  useEffect(() => {
    setBrokenClipIds(new Set());
  }, [itemsIdsKey]);

  useEffect(() => {
    setAdsByClipId({});
    setAdPanelOpenByClipId({});
    setHasSeenAdClipIds(new Set());
    setBrokenAdImageByClipId({});
  }, [itemsIdsKey]);

  const clips = useMemo<Clip[]>(() => {
    return items
      .filter((item) => !brokenClipIds.has(item.id))
      .filter((item) => isPropertyFeedVideoPlayable(item))
      .map((item) => ({
        ...item,
        src: propertyFeedPrimaryVideoSrc(item),
      }))
      .filter((item): item is Clip => item.src.length > 0);
  }, [items, brokenClipIds]);

  const [activeId, setActiveId] = useState<string | null>(
    clips[0]?.id ?? null,
  );
  const [mutedById, setMutedById] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const c of clips) init[c.id] = true;
    return init;
  });
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [likes, setLikes] = useState<Record<string, number>>({});

  const containerRef = useRef<HTMLDivElement | null>(null);

  const markClipBroken = useCallback((id: string) => {
    setBrokenClipIds((prev) => {
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
  }, [clips.length]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const onScroll = () => {
      setAdInteractionTick((v) => v + 1);
      const max = root.scrollHeight - root.clientHeight;
      if (max <= 8) return;
      if (root.scrollTop >= max - 4) {
        root.scrollTo({ top: 0, behavior: 'auto' });
      }
    };

    root.addEventListener('scroll', onScroll, { passive: true });
    return () => root.removeEventListener('scroll', onScroll);
  }, [clips.length]);

  useEffect(() => {
    setActiveId(clips[0]?.id ?? null);
    const m: Record<string, boolean> = {};
    for (const c of clips) m[c.id] = true;
    setMutedById(m);

    const likeInit: Record<string, number> = {};
    const likedInit: Record<string, boolean> = {};
    for (const c of clips) {
      likeInit[c.id] = c.likeCount ?? mockLikesForId(c.id);
      if (typeof c.liked === 'boolean') {
        likedInit[c.id] = c.liked;
      }
    }
    setLikes(likeInit);
    setLiked(likedInit);
  }, [clips]);

  useEffect(() => {
    let cancelled = false;
    const ids = clips.map((x) => x.id).slice(0, 40);
    if (ids.length === 0) return;

    const run = async () => {
      try {
        const qs = encodeURIComponent(ids.join(','));
        const res = await fetch(toPublicApiUrl(`/company-ads/for-feed?propertyIds=${qs}`), {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = (await res.json().catch(() => ({}))) as Record<string, CompanyAd | null>;
        if (!cancelled) setAdsByClipId(data ?? {});
      } catch {
        if (cancelled) return;
      }
    };
    void run();

    return () => {
      cancelled = true;
    };
  }, [clips]);

  useEffect(() => {
    for (const [propertyId, ad] of Object.entries(adsByClipId)) {
      if (!ad) continue;
      // eslint-disable-next-line no-console
      console.info('[company-ad-image] render URL', {
        propertyId,
        adId: ad.id,
        imageUrl: ad.imageUrl,
      });
    }
  }, [adsByClipId]);

  useEffect(() => {
    if (!activeId) return;
    const ad = adsByClipId[activeId];
    if (!ad) return;
    if (hasSeenAdClipIds.has(activeId)) return;

    const now = Date.now();
    const dueInMs = Math.max(0, 12_000 - (now - lastAdShownAtRef.current));
    const timer = window.setTimeout(() => {
      setAdPanelOpenByClipId((prev) => ({ ...prev, [activeId]: true }));
      setHasSeenAdClipIds((prev) => new Set(prev).add(activeId));
      lastAdShownAtRef.current = Date.now();
    }, 2_500 + dueInMs);

    return () => window.clearTimeout(timer);
  }, [activeId, adsByClipId, hasSeenAdClipIds, adInteractionTick]);

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

  const toggleLike = useCallback(async (propertyId: string) => {
    let previousLiked = false;
    let previousCount = 0;
    setLiked((prev) => {
      previousLiked = !!prev[propertyId];
      return { ...prev, [propertyId]: !previousLiked };
    });
    setLikes((prev) => {
      previousCount = prev[propertyId] ?? 0;
      return {
        ...prev,
        [propertyId]: Math.max(
          0,
          previousCount + (previousLiked ? -1 : 1),
        ),
      };
    });

    try {
      const res = await fetch(toPublicApiUrl(`/properties/${propertyId}/like`), {
        method: 'POST',
      });
      const data = (await res.json()) as {
        liked?: boolean;
        likeCount?: number;
      };
      if (!res.ok) {
        setLiked((prev) => ({ ...prev, [propertyId]: previousLiked }));
        setLikes((prev) => ({ ...prev, [propertyId]: previousCount }));
        return;
      }
      if (typeof data.liked === 'boolean') {
        const v = data.liked;
        setLiked((prev) => ({ ...prev, [propertyId]: v }));
      }
      if (typeof data.likeCount === 'number') {
        const n = data.likeCount;
        setLikes((prev) => ({ ...prev, [propertyId]: n }));
      }
    } catch {
      setLiked((prev) => ({ ...prev, [propertyId]: previousLiked }));
      setLikes((prev) => ({ ...prev, [propertyId]: previousCount }));
    }
  }, []);

  const toggleMuted = useCallback((id: string) => {
    setMutedById((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleWriteSeller = useCallback(
    (clip: Clip) => {
      if (!isAuthenticated || !apiAccessToken) {
        const path =
          typeof window !== 'undefined'
            ? `${window.location.pathname}${window.location.search}`
            : '/';
        router.push(`/prihlaseni?redirect=${encodeURIComponent(path)}`);
        return;
      }
      const ownerListingUserId = (clip.userId ?? '').trim();
      const isListingOwner = Boolean(
        user?.id &&
          ownerListingUserId &&
          String(user.id).trim() === String(ownerListingUserId).trim(),
      );
      if (isListingOwner) {
        setSellerActionHint('Toto je váš vlastní inzerát.');
        window.setTimeout(() => setSellerActionHint(null), 5000);
        return;
      }
      setSellerClip(clip);
    },
    [apiAccessToken, isAuthenticated, router, user?.id],
  );

  if (clips.length === 0) {
    return (
      <div className="flex h-full min-h-[40dvh] w-full flex-col items-center justify-center gap-2 bg-black px-6 text-center">
        <p className="text-sm font-medium text-white/85">Žádné platné video inzeráty</p>
        <p className="max-w-xs text-xs leading-relaxed text-white/55">
          Všechna videa selhala nebo chybí odkaz. Zkuste upravit filtry nebo obnovit stránku později.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-0 w-full snap-y snap-mandatory overflow-x-hidden overflow-y-scroll scroll-smooth overscroll-y-contain"
    >
      {sellerActionHint ? (
        <div
          className="pointer-events-none fixed bottom-28 left-1/2 z-[60] max-w-sm -translate-x-1/2 rounded-xl border border-white/20 bg-black/80 px-4 py-2 text-center text-xs font-semibold text-amber-100 shadow-lg backdrop-blur-md sm:bottom-32"
          role="status"
        >
          {sellerActionHint}
        </div>
      ) : null}
      {clips.map((c) => {
        const isActive = activeId === c.id;
        const muted = mutedById[c.id] !== false;
        const showProfileLink = !!c.userId;
        const ad = adsByClipId[c.id] ?? null;
        const isAdOpen = Boolean(ad && adPanelOpenByClipId[c.id]);

        return (
          <section
            key={c.id + c.src}
            className="relative isolate box-border h-screen w-full max-w-full shrink-0 snap-start snap-always overflow-hidden overflow-x-hidden bg-black"
            onClick={() => setAdInteractionTick((v) => v + 1)}
          >
            {showProfileLink ? (
              <div className="pointer-events-auto absolute left-3 top-20 z-20 md:left-4 md:top-24">
                <Link
                  href={`/profile/${c.userId}`}
                  className="inline-flex rounded-full border border-white/25 bg-black/45 px-3 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur-md transition hover:bg-black/55"
                >
                  Profil
                </Link>
              </div>
            ) : null}

            <div className="absolute inset-0 flex items-center justify-center">
              <video
                data-clip-id={c.id}
                muted={muted}
                playsInline
                autoPlay
                loop
                controls
                preload="metadata"
                className="w-full h-full object-cover"
                onError={() => markClipBroken(c.id)}
              >
                <source src={c.src} type="video/mp4" />
              </video>
            </div>
            <div className="pointer-events-none absolute right-3 top-3 z-[26] sm:right-4 sm:top-4">
              <div className="rounded-xl bg-black/60 px-3 py-2 text-sm font-bold text-white shadow-lg sm:px-4 sm:py-2.5 sm:text-base">
                {`👁 ${formatViewsCount(c.viewsCount)}`}
              </div>
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

            <div className="absolute bottom-24 right-5 z-10 flex flex-col items-center gap-5 sm:bottom-28 sm:right-7">
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  aria-label="Líbí se mi"
                  onClick={() => void toggleLike(c.id)}
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
              <div className="flex flex-col items-center gap-1">
                <span
                  className={`${glowBtnBase} pointer-events-none opacity-90`}
                  aria-hidden
                >
                  💬
                </span>
                <CommentsPlaceholder />
              </div>
              <button
                type="button"
                aria-label="Napsat prodejci"
                title="Napsat prodejci"
                onClick={() => handleWriteSeller(c)}
                className={glowBtnBase}
              >
                <Mail className="size-6" strokeWidth={2.25} aria-hidden />
              </button>
            </div>
            {ad ? (
              <>
                <aside
                  className={`absolute inset-x-0 bottom-4 z-20 hidden px-5 md:block md:px-6 lg:px-8 ${
                    isAdOpen
                      ? 'translate-y-0 opacity-100'
                      : 'pointer-events-none translate-y-3 opacity-0'
                  } transition-all duration-300`}
                  aria-hidden={!isAdOpen}
                >
                  <div className="mx-auto w-full max-w-[34rem] rounded-2xl border border-white/25 bg-black/72 p-2.5 shadow-2xl backdrop-blur-md">
                    <button
                      type="button"
                      aria-label="Zavřít reklamu"
                      onClick={() =>
                        setAdPanelOpenByClipId((prev) => ({ ...prev, [c.id]: false }))
                      }
                      className="absolute right-7 top-2 rounded-full bg-black/55 px-2 py-0.5 text-xs text-white/90 lg:right-9"
                    >
                      ×
                    </button>
                    <div className="flex items-center gap-2.5">
                      {brokenAdImageByClipId[c.id] ? (
                        <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-[10px] text-white/70">
                          Bez náhledu
                        </div>
                      ) : (
                        <img
                          src={nestAbsoluteAssetUrl(ad.imageUrl)}
                          alt={ad.title}
                          className="h-14 w-20 shrink-0 rounded-lg object-cover"
                          loading="lazy"
                          onError={(e) => {
                            setBrokenAdImageByClipId((prev) => ({ ...prev, [c.id]: true }));
                            // eslint-disable-next-line no-console
                            console.error('[company-ad-image] render failed', {
                              propertyId: c.id,
                              adId: ad.id,
                              src: e.currentTarget.currentSrc || ad.imageUrl,
                            });
                          }}
                        />
                      )}
                      <div className="min-w-0 flex-1 pr-14">
                        <p className="truncate text-[9px] uppercase tracking-[0.1em] text-white/55">
                          {ad.company?.name ?? 'Stavební firma'}
                        </p>
                        <h3 className="mt-0.5 line-clamp-1 text-[13px] font-semibold text-white">{ad.title}</h3>
                        <p className="line-clamp-1 text-[11px] text-white/75">{ad.description}</p>
                      </div>
                      <a
                        href={ad.targetUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-semibold text-black transition hover:bg-amber-400"
                      >
                        {ad.ctaText}
                      </a>
                    </div>
                  </div>
                </aside>
                <aside
                  className={`absolute right-0 top-1/2 z-30 w-[min(84vw,22rem)] -translate-y-1/2 rounded-l-2xl border border-white/20 bg-black/80 p-3 shadow-2xl backdrop-blur-md transition-transform duration-500 md:hidden ${
                    isAdOpen ? 'translate-x-0' : 'translate-x-[105%]'
                  }`}
                  aria-hidden={!isAdOpen}
                >
                  <button
                    type="button"
                    aria-label="Zavřít reklamu"
                    onClick={() =>
                      setAdPanelOpenByClipId((prev) => ({ ...prev, [c.id]: false }))
                    }
                    className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white/90"
                  >
                    ×
                  </button>
                  {brokenAdImageByClipId[c.id] ? (
                    <div className="flex h-28 w-full items-center justify-center rounded-xl bg-zinc-800 text-xs text-white/70">
                      Obrázek reklamy se nepodařilo načíst
                    </div>
                  ) : (
                    <img
                      src={nestAbsoluteAssetUrl(ad.imageUrl)}
                      alt={ad.title}
                      className="h-28 w-full rounded-xl object-cover"
                      loading="lazy"
                      onError={(e) => {
                        setBrokenAdImageByClipId((prev) => ({ ...prev, [c.id]: true }));
                        // eslint-disable-next-line no-console
                        console.error('[company-ad-image] render failed', {
                          propertyId: c.id,
                          adId: ad.id,
                          src: e.currentTarget.currentSrc || ad.imageUrl,
                        });
                      }}
                    />
                  )}
                  <p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-white/60">
                    {ad.company?.name ?? 'Stavební firma'}
                  </p>
                  <h3 className="mt-1 text-sm font-semibold text-white">{ad.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-white/80">{ad.description}</p>
                  <a
                    href={ad.targetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-amber-400"
                  >
                    {ad.ctaText}
                  </a>
                </aside>
              </>
            ) : null}
          </section>
        );
      })}
      {sellerClip ? (
        <MessageSellerModal
          open={Boolean(sellerClip)}
          onClose={() => setSellerClip(null)}
          propertyId={sellerClip.id}
          listingTitle={(sellerClip.title ?? 'Inzerát').trim() || 'Inzerát'}
          price={sellerClip.price}
          location={sellerClip.location}
          coverImageUrl={
            sellerClip.imageUrl?.trim() ||
            sellerClip.images?.find((u) => u.trim()) ||
            null
          }
          token={apiAccessToken}
          onSent={(conversationId) => {
            setSellerClip(null);
            router.push(`/profil/zpravy/${conversationId}`);
          }}
        />
      ) : null}
    </div>
  );
}
