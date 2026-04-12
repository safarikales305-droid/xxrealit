'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Heart, MessageCircle, Volume2, VolumeX } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import { absoluteShareUrl } from '@/lib/public-share-url';
import { ShareButtons } from '@/components/share/ShareButtons';
import { MessageSellerModal } from '@/components/messages/MessageSellerModal';
import { nestToggleFavorite, type ShortVideo } from '@/lib/nest-client';

type VideoCardProps = {
  video: ShortVideo;
};

const railBtn =
  'inline-flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-white/35 bg-black/65 text-white shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md transition hover:border-orange-400/80 hover:bg-orange-600/95 active:scale-95 disabled:pointer-events-none disabled:opacity-45';

export default function VideoCard({ video }: VideoCardProps) {
  const router = useRouter();
  const { user, isAuthenticated, apiAccessToken } = useAuth();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState(false);
  const [muted, setMuted] = useState(true);
  const [liked, setLiked] = useState(Boolean(video.liked));
  const [likeBusy, setLikeBusy] = useState(false);
  const [sellerModalOpen, setSellerModalOpen] = useState(false);

  useEffect(() => {
    setLiked(Boolean(video.liked));
  }, [video.id, video.liked]);

  useEffect(() => {
    if (!videoRef.current) return;

    const vid = videoRef.current;

    const tryPlay = () => {
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
  }, [muted]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  const src = nestAbsoluteAssetUrl(video.videoUrl ?? video.url ?? '');
  if (!src) {
    return <div className="text-white">Missing video</div>;
  }

  const shareTitle = (video.title ?? 'Inzerát').trim().slice(0, 120) || 'Inzerát';
  const shareUrl = absoluteShareUrl(`/nemovitost/${encodeURIComponent(video.id)}`);
  const city = (video.city ?? '').trim();

  const listingPath = `/nemovitost/${encodeURIComponent(video.id)}?from=shorts`;

  const ownerId = (video.userId ?? video.user?.id ?? '').trim();
  const isOwner = Boolean(user?.id && ownerId && user.id === ownerId);
  const canContactSeller = Boolean(ownerId) && !isOwner;
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

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-black">
      <video
        ref={videoRef}
        src={src}
        muted={muted}
        playsInline
        loop
        autoPlay
        preload="metadata"
        className="aspect-[9/16] h-full w-full max-h-[100dvh] object-cover"
        onError={() => {
          setError(true);
        }}
      />

      {/* Pravý sloup — zpráva prodejci, oblíbené, sdílet, zvuk (vysoký kontrast, oranžový akcent) */}
      <div className="pointer-events-auto absolute right-2 top-1/2 z-[35] flex -translate-y-1/2 flex-col items-center gap-3 sm:right-4">
        {canContactSeller ? (
          <button
            type="button"
            onClick={handleWriteSeller}
            className="flex max-w-[6.25rem] flex-col items-center gap-1.5 rounded-2xl border-2 border-orange-400/90 bg-gradient-to-b from-[#ff7a1a] to-[#ff3c00] px-2.5 py-3 text-center text-white shadow-[0_12px_40px_rgba(255,90,0,0.45)] transition hover:brightness-110 active:scale-[0.97]"
            aria-label="Odeslat zprávu prodejci"
          >
            <MessageCircle className="size-7 shrink-0 drop-shadow-sm" strokeWidth={2.25} aria-hidden />
            <span className="text-[10px] font-extrabold leading-[1.2] tracking-tight">
              Odeslat zprávu prodejci
            </span>
          </button>
        ) : null}

        <button
          type="button"
          disabled={likeBusy}
          onClick={handleFavoriteClick}
          className={`${railBtn} ${liked ? 'border-orange-400/90 bg-orange-600/90 text-white' : ''}`}
          aria-label={liked ? 'Odebrat z oblíbených' : 'Přidat do oblíbených'}
        >
          <Heart
            className={`size-6 ${liked ? 'fill-white text-white' : ''}`}
            strokeWidth={liked ? 0 : 2.25}
          />
        </button>

        <ShareButtons title={shareTitle} url={shareUrl} variant="videoRail" />

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
      </div>

      {/* Spodní panel — silnější překryv, primární CTA */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[25]">
        <div className="bg-gradient-to-t from-black via-black/85 to-black/20 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-20 pr-[4.5rem] text-white sm:pr-24 sm:pb-8 sm:pt-24">
          <div className="pointer-events-auto mx-auto max-w-lg space-y-3">
            <div className="rounded-xl border border-white/10 bg-black/35 px-3 py-2 shadow-lg backdrop-blur-md sm:px-4">
              <div className="text-sm font-semibold leading-snug sm:text-base">{video.title ?? ''}</div>
              {city ? <div className="mt-0.5 text-xs text-white/85 sm:text-sm">{city}</div> : null}
              <div className="mt-1 text-lg font-bold tabular-nums sm:text-xl">
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
              onClick={handleOpenListing}
              className="flex w-full min-h-[52px] items-center justify-center rounded-full border-2 border-orange-300/90 bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-6 py-3.5 text-base font-extrabold tracking-tight text-white shadow-[0_14px_40px_rgba(255,80,0,0.45)] transition hover:brightness-110 active:scale-[0.99] sm:text-lg"
            >
              Zobrazit inzerát
            </button>

            {canContactSeller ? (
              <button
                type="button"
                onClick={handleWriteSeller}
                className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-full border-2 border-white/40 bg-white/12 px-4 py-3 text-sm font-bold text-white shadow-lg backdrop-blur-md transition hover:border-orange-300/80 hover:bg-orange-600/35 sm:text-base"
              >
                <MessageCircle className="size-5 shrink-0 sm:size-6" strokeWidth={2.25} aria-hidden />
                Odeslat zprávu prodejci
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {canContactSeller ? (
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
      ) : null}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black text-white">
          Video failed to load
        </div>
      )}
    </div>
  );
}
