'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  Filter,
  Heart,
  Mail,
  MessageCircle,
  Plus,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import { absoluteShareUrl } from '@/lib/public-share-url';
import { ShareButtons } from '@/components/share/ShareButtons';
import { MessageSellerModal } from '@/components/messages/MessageSellerModal';
import { nestToggleFavorite, type ShortVideo } from '@/lib/nest-client';
import { canCreateProfessionalListingsAndPosts } from '@/lib/roles';
import { ProfessionalOnlyDialog } from '@/components/auth/ProfessionalListingRestriction';

type VideoCardProps = {
  video: ShortVideo;
  /** Mobil shorts: otevře panel filtrů (tlačítko v levém horním rohu videa). */
  onMobileFiltersOpen?: () => void;
  /** Selhání načtení / přehrávání — rodič záznam odfiltruje a případně posune scroll. */
  onVideoBroken?: (videoId: string) => void;
};

const railBtn =
  'inline-flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-white/35 bg-black/65 text-white shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md transition hover:border-orange-400/80 hover:bg-orange-600/95 active:scale-95 disabled:pointer-events-none disabled:opacity-45 lg:border-zinc-200 lg:bg-white lg:text-zinc-800 lg:shadow-md lg:backdrop-blur-none lg:hover:border-orange-300 lg:hover:bg-orange-50 lg:hover:text-orange-900';

/** Obálka / zpráva prodejci — stejná velikost jako rail, výrazný oranžový akcent. */
const railMessageBtn = `${railBtn} border-orange-400/70 bg-black/70 text-orange-100 hover:border-orange-300 hover:bg-orange-600/90 hover:text-white lg:border-orange-300 lg:bg-white lg:text-orange-700 lg:shadow-md lg:hover:border-orange-500 lg:hover:bg-orange-50 lg:hover:text-orange-800`;

export default function VideoCard({
  video,
  onMobileFiltersOpen,
  onVideoBroken,
}: VideoCardProps) {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, apiAccessToken } = useAuth();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState(false);
  const [muted, setMuted] = useState(true);
  const [liked, setLiked] = useState(Boolean(video.liked));
  const [likeBusy, setLikeBusy] = useState(false);
  const [sellerModalOpen, setSellerModalOpen] = useState(false);
  const [sellerActionHint, setSellerActionHint] = useState<string | null>(null);
  const [desktopPreviewUrl, setDesktopPreviewUrl] = useState<string | null>(null);
  const [professionalOnlyOpen, setProfessionalOnlyOpen] = useState(false);

  const src = nestAbsoluteAssetUrl(video.videoUrl ?? video.url ?? '').trim();

  const galleryPhotoUrls = useMemo(() => {
    const raw: string[] = [];
    for (const u of video.images ?? []) {
      if (typeof u === 'string' && u.trim()) raw.push(nestAbsoluteAssetUrl(u).trim());
    }
    const primary = (video.imageUrl ?? '').trim();
    if (primary) raw.unshift(nestAbsoluteAssetUrl(primary).trim());
    const seen = new Set<string>();
    return raw.filter((u) => {
      if (!u || seen.has(u)) return false;
      seen.add(u);
      return true;
    });
  }, [video.id, video.imageUrl, video.images]);

  useEffect(() => {
    setLiked(Boolean(video.liked));
  }, [video.id, video.liked]);

  useEffect(() => {
    setError(false);
  }, [video.id]);

  useEffect(() => {
    setDesktopPreviewUrl(null);
  }, [video.id]);

  useEffect(() => {
    if (!src) onVideoBroken?.(video.id);
  }, [src, video.id, onVideoBroken]);

  useEffect(() => {
    if (!desktopPreviewUrl || !videoRef.current) return;
    videoRef.current.pause();
  }, [desktopPreviewUrl]);

  useEffect(() => {
    if (!videoRef.current) return;

    const vid = videoRef.current;

    const tryPlay = () => {
      if (desktopPreviewUrl) {
        vid.pause();
        return;
      }
      vid.muted = muted;
      vid.play().catch(() => {
        /* autoplay blocked */
      });
    };

    tryPlay();

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!vid) return;

        if (entry.isIntersecting) {
          tryPlay();
        } else {
          vid.pause();
        }
      },
      { threshold: 0.6 },
    );

    observer.observe(vid);

    return () => observer.disconnect();
  }, [muted, video.id, error, desktopPreviewUrl]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  if (!src) {
    return (
      <div className="flex h-full min-h-[50dvh] w-full flex-col items-center justify-center bg-black px-4 text-center text-sm text-white/55 lg:bg-white lg:text-zinc-500">
        Chybí video soubor
      </div>
    );
  }

  const shareTitle = (video.title ?? 'Inzerát').trim().slice(0, 120) || 'Inzerát';
  /** Veřejný deep link do hlavního shorts feedu (stejné UI jako TikTok režim na úvodní stránce). */
  const shareUrl = absoluteShareUrl(
    `/?tab=shorts&video=${encodeURIComponent(video.id)}`,
  );
  const city = (video.city ?? '').trim();

  const listingPath = `/nemovitost/${encodeURIComponent(video.id)}?from=shorts`;

  const ownerId = (video.userId ?? video.user?.id ?? '').trim();
  const isOwner = Boolean(
    user?.id && ownerId && String(user.id).trim() === String(ownerId).trim(),
  );
  const coverStill =
    ((video.images ?? []).find((u) => typeof u === 'string' && u.trim()) ?? '').trim() ||
    (video.imageUrl ?? '').trim() ||
    null;
  const priceNum = Number(video.price ?? 0);

  function redirectToLogin() {
    const path =
      typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search}`
        : '/';
    router.push(`/prihlaseni?redirect=${encodeURIComponent(path)}`);
  }

  const addListingPath = '/inzerat/pridat';
  const canPostProfessionalListing = canCreateProfessionalListingsAndPosts(user?.role);

  function goAddListing(e: MouseEvent<HTMLButtonElement>) {
    // On mobile inside swipeable feed prevent tap-through to underlying video/gestures.
    e.preventDefault();
    e.stopPropagation();
    if (isLoading) return;
    if (!isAuthenticated || !user) {
      router.push(`/prihlaseni?redirect=${encodeURIComponent(addListingPath)}`);
      return;
    }
    if (!canPostProfessionalListing) {
      setProfessionalOnlyOpen(true);
      return;
    }
    router.push(addListingPath);
  }

  function handleOpenListing() {
    if (!user) {
      router.push(`/prihlaseni?redirect=${encodeURIComponent(listingPath)}`);
      return;
    }
    router.push(listingPath);
  }

  function handleWriteSeller() {
    if (!isAuthenticated || !apiAccessToken) {
      redirectToLogin();
      return;
    }
    if (isOwner) {
      setSellerActionHint('Toto je váš vlastní inzerát.');
      window.setTimeout(() => setSellerActionHint(null), 5000);
      return;
    }
    setSellerModalOpen(true);
  }

  function handleFavoriteClick() {
    if (!apiAccessToken) {
      redirectToLogin();
      return;
    }
    setLikeBusy(true);
    void nestToggleFavorite(video.id, liked, apiAccessToken).then((r) => {
      setLikeBusy(false);
      if (r.ok && typeof r.favorited === 'boolean') setLiked(r.favorited);
    });
  }

  function handleReplayVideo() {
    setDesktopPreviewUrl(null);
    const v = videoRef.current;
    if (!v || error) return;
    v.currentTime = 0;
    v.muted = muted;
    void v.play().catch(() => {
      /* autoplay */
    });
  }

  /** Mobilní overlay pod videem (černé pozadí). */
  function renderMobileListingInfo() {
    return (
      <div className="space-y-2 max-md:space-y-2 sm:space-y-3">
        <div className="rounded-xl border border-white/15 bg-black/50 px-3 py-2 shadow-lg backdrop-blur-md max-md:px-2.5 max-md:py-1.5 sm:px-4">
          <div className="line-clamp-2 text-sm font-semibold leading-snug sm:text-base">
            {video.title ?? ''}
          </div>
          {city ? <div className="mt-0.5 text-xs text-white/85 sm:text-sm">{city}</div> : null}
          <div className="mt-1 text-base font-bold tabular-nums max-md:text-[15px] sm:text-lg">
            <span
              className={
                isAuthenticated ? 'text-orange-100' : 'blur-[6px] select-none opacity-90'
              }
            >
              {Number(video.price ?? 0).toLocaleString('cs-CZ')} Kč
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleWriteSeller}
          className="flex w-full max-w-full items-center justify-center gap-1.5 rounded-full border-2 border-orange-200/90 bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-3 py-2 text-[13px] font-extrabold leading-tight tracking-tight text-white shadow-[0_8px_26px_rgba(255,80,0,0.38)] transition hover:brightness-110 active:scale-[0.99] max-md:min-h-[44px] sm:gap-2 sm:px-4 sm:py-3 sm:text-sm sm:shadow-[0_14px_40px_rgba(255,80,0,0.45)]"
        >
          <MessageCircle className="size-5 shrink-0 sm:size-6" strokeWidth={2.25} aria-hidden />
          Napsat prodejci
        </button>
        {sellerActionHint ? (
          <p className="text-center text-xs font-medium text-amber-200" role="status">
            {sellerActionHint}
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleOpenListing}
          className="flex w-full max-w-full items-center justify-center rounded-full border-2 border-white/50 bg-white/15 px-4 py-2 text-[13px] font-extrabold leading-tight tracking-tight text-white shadow-md backdrop-blur-md transition hover:border-orange-200/80 hover:bg-orange-600/25 active:scale-[0.99] max-md:min-h-[44px] sm:px-6 sm:py-3 sm:text-base sm:shadow-lg"
        >
          Zobrazit inzerát
        </button>
      </div>
    );
  }

  function renderActionRail(options: { desktopLightShare?: boolean }) {
    const { desktopLightShare } = options;
    return (
      <>
        <button
          type="button"
          disabled={likeBusy}
          onClick={handleFavoriteClick}
          className={`${railBtn} ${
            liked
              ? 'border-orange-400/90 bg-orange-600/90 text-white lg:border-orange-500 lg:bg-orange-500 lg:text-white'
              : ''
          }`}
          aria-label={liked ? 'Odebrat z oblíbených' : 'Přidat do oblíbených'}
        >
          <Heart
            className={`size-6 ${liked ? 'fill-white text-white lg:fill-white lg:text-white' : ''}`}
            strokeWidth={liked ? 0 : 2.25}
          />
        </button>

        <button
          type="button"
          onClick={handleWriteSeller}
          className={railMessageBtn}
          aria-label="Napsat prodejci"
          title="Napsat prodejci"
        >
          <Mail className="size-6" strokeWidth={2.25} aria-hidden />
        </button>

        <ShareButtons
          title={shareTitle}
          url={shareUrl}
          variant={desktopLightShare ? 'lightRail' : 'videoRail'}
        />

        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          className={railBtn}
          aria-label={muted ? 'Zapnout zvuk' : 'Ztlumit'}
        >
          {muted ? (
            <VolumeX className="size-6" strokeWidth={2.25} />
          ) : (
            <Volume2 className="size-6" strokeWidth={2.25} />
          )}
        </button>

        {!isLoading && isAuthenticated && user ? (
          <button
            type="button"
            onClick={goAddListing}
            className={`${railBtn} touch-manipulation border-orange-400/85 bg-gradient-to-br from-[#ff6a00]/95 to-[#ff3c00]/95 text-white hover:brightness-110 lg:border-orange-400 lg:bg-gradient-to-br lg:from-[#ff6a00] lg:to-[#ff3c00] lg:text-white lg:hover:brightness-110`}
            aria-label="Přidat inzerát"
          >
            <Plus className="size-6" strokeWidth={2.5} aria-hidden />
          </button>
        ) : null}
      </>
    );
  }

  return (
    <div className="relative isolate flex h-full min-h-0 w-full flex-col bg-black lg:bg-white">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row lg:items-stretch lg:justify-center lg:gap-8 lg:overflow-visible lg:px-8 lg:py-8">
        {/* Desktop: levý panel — miniatury, info, přehrát znovu, CTA */}
        <div className="hidden min-h-0 w-full min-w-0 max-w-[360px] shrink-0 flex-col gap-5 overflow-y-auto lg:flex lg:w-[min(100%,340px)] lg:min-w-[260px] lg:pt-1">
          {galleryPhotoUrls.length > 0 ? (
            <div className="flex flex-wrap gap-2" aria-label="Fotografie inzerátu">
              {galleryPhotoUrls.map((url, index) => {
                const active = desktopPreviewUrl === url;
                return (
                  <button
                    key={`${url}-${index}`}
                    type="button"
                    onClick={() => setDesktopPreviewUrl((prev) => (prev === url ? null : url))}
                    className={`relative size-[4.25rem] shrink-0 overflow-hidden rounded-lg border-2 transition sm:size-[4.5rem] ${
                      active
                        ? 'border-orange-500 ring-2 ring-orange-400/35'
                        : 'border-zinc-200 hover:border-zinc-400'
                    }`}
                    aria-pressed={active}
                    aria-label={active ? 'Zobrazit video' : `Náhled fotografie ${index + 1}`}
                  >
                    <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm">
            <div className="line-clamp-3 text-base font-semibold leading-snug text-zinc-900">
              {video.title ?? ''}
            </div>
            {city ? <div className="mt-1 text-sm text-zinc-600">{city}</div> : null}
            <div className="mt-2 text-lg font-bold tabular-nums text-zinc-900">
              <span
                className={
                  isAuthenticated ? 'text-orange-600' : 'blur-[6px] select-none opacity-90'
                }
              >
                {Number(video.price ?? 0).toLocaleString('cs-CZ')} Kč
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleReplayVideo}
            disabled={Boolean(error)}
            className="inline-flex w-full max-w-full items-center justify-center gap-2 rounded-full border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 shadow-sm transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-900 disabled:pointer-events-none disabled:opacity-45"
          >
            <RotateCcw className="size-4 shrink-0" strokeWidth={2.25} aria-hidden />
            Přehrát znovu
          </button>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={handleWriteSeller}
              className="flex w-full items-center justify-center gap-2 rounded-full border-2 border-orange-200/90 bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-4 py-3 text-sm font-bold text-white shadow-[0_8px_26px_rgba(255,80,0,0.32)] transition hover:brightness-110 active:scale-[0.99]"
            >
              <MessageCircle className="size-5 shrink-0" strokeWidth={2.25} aria-hidden />
              Napsat inzerentovi
            </button>
            {sellerActionHint ? (
              <p className="text-left text-xs font-medium text-amber-800" role="status">
                {sellerActionHint}
              </p>
            ) : null}
            <button
              type="button"
              onClick={handleOpenListing}
              className="flex w-full items-center justify-center rounded-full border-2 border-zinc-300 bg-white px-4 py-3 text-sm font-bold text-zinc-800 shadow-sm transition hover:border-orange-300 hover:bg-zinc-50 active:scale-[0.99]"
            >
              Zobrazit inzerát
            </button>
          </div>
        </div>

        {/* Střed: video (9:16) */}
        <div className="relative flex min-h-0 flex-1 flex-col lg:max-w-[min(480px,min(46vw,calc((min(88vh,100dvh-9rem))*9/16+2rem)))] lg:shrink-0 lg:items-center lg:justify-center">
          <div
            className="relative min-h-0 flex-1 overflow-hidden lg:flex lg:h-[min(88vh,calc(100dvh-9rem))] lg:w-[min(100%,calc(min(88vh,100dvh-9rem)*9/16))] lg:max-w-[min(420px,42vw)] lg:flex-none lg:shrink-0 lg:items-center lg:justify-center lg:rounded-xl lg:border lg:border-zinc-200 lg:bg-zinc-950 lg:shadow-[0_24px_70px_rgba(0,0,0,0.18)]"
          >
            {desktopPreviewUrl ? (
              <>
                <img
                  src={desktopPreviewUrl}
                  alt=""
                  className="absolute inset-0 z-[1] box-border h-full w-full object-contain"
                />
                <div className="pointer-events-auto absolute left-3 top-3 z-[20] hidden lg:block">
                  <button
                    type="button"
                    onClick={handleReplayVideo}
                    className="rounded-full border border-white/35 bg-black/75 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md transition hover:bg-black/90"
                  >
                    Přehrát video
                  </button>
                </div>
              </>
            ) : null}

            {!error ? (
              <video
                ref={videoRef}
                src={src}
                muted={muted}
                playsInline
                loop
                autoPlay
                preload="metadata"
                className={`absolute inset-0 box-border h-full w-full object-cover ${desktopPreviewUrl ? 'lg:opacity-0 lg:pointer-events-none' : ''} lg:object-contain`}
                onError={() => {
                  setError(true);
                  onVideoBroken?.(video.id);
                }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-black text-sm text-white/50">
                Video se nepodařilo načíst
              </div>
            )}

            {onMobileFiltersOpen ? (
              <button
                type="button"
                onClick={onMobileFiltersOpen}
                className="pointer-events-auto absolute left-[max(0.5rem,env(safe-area-inset-left))] top-[max(0.5rem,env(safe-area-inset-top))] z-[36] inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-white/45 bg-black/60 px-3 py-2 text-xs font-semibold text-white shadow-[0_6px_24px_rgba(0,0,0,0.35)] backdrop-blur-md transition hover:bg-black/75 active:scale-[0.98] lg:hidden"
                aria-label="Filtry"
              >
                <Filter className="size-4 shrink-0" strokeWidth={2.25} aria-hidden />
                Filtry
              </button>
            ) : null}

            {/* Mobil: akce přes video */}
            <div className="pointer-events-auto absolute right-2 z-[35] flex flex-col items-center gap-2.5 max-lg:top-[3.85rem] max-lg:bottom-[calc(13.25rem+env(safe-area-inset-bottom,0px))] max-lg:justify-center sm:right-4 lg:hidden">
              {renderActionRail({ desktopLightShare: false })}
            </div>

            {/* Mobil: spodní info vůči videu */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[25] lg:hidden">
              <div className="bg-gradient-to-t from-black via-black/95 to-black/25 px-3 pt-10 pr-[4rem] text-white shadow-[0_-12px_40px_rgba(0,0,0,0.45)] max-[1023px]:pb-[max(2rem,calc(env(safe-area-inset-bottom,0px)+1.5rem))] sm:px-4 sm:pr-24 sm:pt-14">
                <div className="pointer-events-auto mx-auto max-w-lg sm:max-w-lg">
                  {renderMobileListingInfo()}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Desktop: akce vpravo vedle videa */}
        <div className="pointer-events-auto z-[35] hidden w-auto shrink-0 flex-col items-center justify-center gap-3 self-center lg:flex">
          {renderActionRail({ desktopLightShare: true })}
        </div>
      </div>

      <MessageSellerModal
        open={sellerModalOpen}
        onClose={() => setSellerModalOpen(false)}
        propertyId={video.id}
        listingTitle={(video.title ?? 'Inzerát').trim() || 'Inzerát'}
        price={priceNum}
        location={city || 'Neuvedeno'}
        coverImageUrl={coverStill}
        token={apiAccessToken}
        onSent={(conversationId) => {
          router.push(`/profil/zpravy/${conversationId}`);
        }}
      />

      <ProfessionalOnlyDialog
        open={professionalOnlyOpen}
        onClose={() => setProfessionalOnlyOpen(false)}
      />
    </div>
  );
}
