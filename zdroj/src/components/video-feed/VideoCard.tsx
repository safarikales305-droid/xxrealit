'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Heart, Volume2, VolumeX } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import { absoluteShareUrl } from '@/lib/public-share-url';
import { ShareButtons } from '@/components/share/ShareButtons';
import { nestToggleFavorite, type ShortVideo } from '@/lib/nest-client';

type VideoCardProps = {
  video: ShortVideo;
};

export default function VideoCard({ video }: VideoCardProps) {
  const router = useRouter();
  const { isAuthenticated, apiAccessToken } = useAuth();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState(false);
  const [muted, setMuted] = useState(true);
  const [liked, setLiked] = useState(Boolean(video.liked));
  const [likeBusy, setLikeBusy] = useState(false);

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

      <div className="pointer-events-auto absolute right-3 bottom-28 z-20 flex flex-col gap-3">
        <button
          type="button"
          disabled={likeBusy || !apiAccessToken}
          onClick={() => {
            if (!apiAccessToken) return;
            setLikeBusy(true);
            void nestToggleFavorite(video.id, liked, apiAccessToken).then((r) => {
              setLikeBusy(false);
              if (r.ok && typeof r.favorited === 'boolean') setLiked(r.favorited);
            });
          }}
          className="flex size-11 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white shadow-lg backdrop-blur-sm disabled:opacity-40"
          aria-label="Oblíbené"
        >
          <Heart className={`size-5 ${liked ? 'fill-rose-500 text-rose-500' : ''}`} />
        </button>
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          className="flex size-11 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white shadow-lg backdrop-blur-sm"
          aria-label={muted ? 'Zapnout zvuk' : 'Ztlumit'}
        >
          {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
        </button>
        <div className="flex justify-center">
          <ShareButtons
            title={shareTitle}
            url={shareUrl}
            className="border-white/25 bg-black/45 text-white backdrop-blur-sm"
          />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pb-6 pr-20 text-white sm:pr-24">
        <div className="space-y-1">
          <div className="text-sm font-medium">{video.title ?? ''}</div>
          {city ? <div className="text-xs opacity-90">{city}</div> : null}
          <div className="text-lg font-bold">
            <span
              className={
                isAuthenticated ? '' : 'blur-[6px] select-none opacity-90'
              }
            >
              {Number(video.price ?? 0).toLocaleString('cs-CZ')} Kč
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              router.push(`/nemovitost/${encodeURIComponent(video.id)}?from=shorts`)
            }
            className="pointer-events-auto mt-2 inline-flex items-center rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-black"
          >
            Zobrazit inzerát
          </button>
        </div>
      </div>

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black text-white">
          Video failed to load
        </div>
      )}
    </div>
  );
}
