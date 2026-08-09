'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import { captureVideoPosterDataUrl } from '@/lib/video-poster';
import { useFeedVideoAutoplay } from '@/hooks/use-feed-video-autoplay';

type Props = {
  src: string;
  poster?: string | null;
  postId?: string;
  permalinkFallback?: string | null;
  onRefreshSrc?: () => Promise<string | null>;
  feedAutoplay?: boolean;
  className?: string;
  blurred?: boolean;
  showMuteToggle?: boolean;
  muted?: boolean;
  onToggleMute?: () => void;
  onOpenDetail?: () => void;
};

export function FacebookInlineVideoPlayer({
  src,
  poster,
  postId,
  permalinkFallback,
  onRefreshSrc,
  feedAutoplay = false,
  className = '',
  blurred = false,
  showMuteToggle = true,
  muted = true,
  onToggleMute,
  onOpenDetail,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const refreshAttemptedRef = useRef(false);
  const [playbackSrc, setPlaybackSrc] = useState(src);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const [generatedPoster, setGeneratedPoster] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [internalMuted, setInternalMuted] = useState(muted);
  const [loading, setLoading] = useState(true);
  const [playbackError, setPlaybackError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const effectivePoster =
    poster?.trim() ? nestAbsoluteAssetUrl(poster) : generatedPoster;

  const isMuted = onToggleMute ? muted : internalMuted;

  useEffect(() => {
    setPlaybackSrc(src);
    refreshAttemptedRef.current = false;
    setPlaybackError(false);
    setLoading(true);
  }, [src]);

  useEffect(() => {
    setInternalMuted(muted);
  }, [muted]);

  useFeedVideoAutoplay(feedAutoplay, videoRef, postId ?? playbackSrc, isMuted);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = isMuted;
    if (!isMuted) el.volume = 1;
  }, [isMuted, playbackSrc]);

  const handleMetadata = useCallback(
    async (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const el = e.currentTarget;
      setLoading(false);
      setPlaybackError(false);
      if (el.videoWidth > 0 && el.videoHeight > 0) {
        setAspectRatio(el.videoWidth / el.videoHeight);
      }
      if (!poster?.trim() && !generatedPoster) {
        const dataUrl = await captureVideoPosterDataUrl(el, 1);
        if (dataUrl) setGeneratedPoster(dataUrl);
      }
    },
    [poster, generatedPoster],
  );

  const tryRefreshSource = useCallback(async () => {
    if (!onRefreshSrc || refreshAttemptedRef.current) return;
    refreshAttemptedRef.current = true;
    setRefreshing(true);
    try {
      const next = await onRefreshSrc();
      if (next?.trim()) {
        setPlaybackSrc(next);
        setPlaybackError(false);
        setLoading(true);
        return;
      }
    } finally {
      setRefreshing(false);
    }
    setPlaybackError(true);
    setLoading(false);
  }, [onRefreshSrc]);

  const handleVideoError = useCallback(() => {
    setLoading(false);
    void tryRefreshSource();
  }, [tryRefreshSource]);

  const portrait = aspectRatio != null && aspectRatio < 0.85;
  const landscape = aspectRatio != null && aspectRatio > 1.15;
  const showControls = !feedAutoplay || !isMobile;
  const mobileFeedMode = feedAutoplay && isMobile;

  const shellStyle = aspectRatio
    ? { aspectRatio: `${aspectRatio}` }
    : { aspectRatio: portrait ? '9/16' : landscape ? '16/9' : '1' };

  const handleShellClick = () => {
    if (mobileFeedMode && onOpenDetail) {
      onOpenDetail();
    }
  };

  const handleMuteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggleMute) {
      onToggleMute();
    } else {
      setInternalMuted((prev) => !prev);
    }
  };

  return (
    <div
      className={`relative mx-auto w-full max-w-[720px] overflow-hidden bg-zinc-950 ${mobileFeedMode ? 'cursor-pointer' : ''} ${className}`.trim()}
      style={shellStyle}
      onClick={handleShellClick}
      role={mobileFeedMode ? 'button' : undefined}
      tabIndex={mobileFeedMode ? 0 : undefined}
      onKeyDown={
        mobileFeedMode
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenDetail?.();
              }
            }
          : undefined
      }
    >
      {(loading || refreshing) && !playbackError ? (
        <div className="absolute inset-0 z-[1] flex items-center justify-center bg-zinc-950/80">
          {effectivePoster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={effectivePoster} alt="" className="absolute inset-0 size-full object-cover opacity-40" />
          ) : null}
          <span className="relative text-sm font-medium text-white/90">
            {refreshing ? 'Obnovuji video…' : 'Načítám video…'}
          </span>
        </div>
      ) : null}

      {playbackError ? (
        <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center gap-3 bg-zinc-950 p-4 text-center">
          {effectivePoster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={effectivePoster} alt="" className="absolute inset-0 size-full object-cover opacity-25" />
          ) : null}
          <p className="relative text-sm font-medium text-white">
            Video se momentálně nepodařilo načíst.
          </p>
          {permalinkFallback ? (
            <a
              href={permalinkFallback}
              target="_blank"
              rel="noopener noreferrer"
              className="relative rounded-full bg-[#1877F2] px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-[#166fe0]"
              onClick={(e) => e.stopPropagation()}
            >
              Otevřít na Facebooku
            </a>
          ) : null}
        </div>
      ) : (
        <video
          ref={videoRef}
          key={playbackSrc}
          src={nestAbsoluteAssetUrl(playbackSrc)}
          poster={effectivePoster || undefined}
          playsInline
          controls={showControls}
          preload="metadata"
          muted={isMuted}
          loop={feedAutoplay}
          onLoadedMetadata={handleMetadata}
          onCanPlay={() => setLoading(false)}
          onError={handleVideoError}
          onClick={(e) => {
            if (mobileFeedMode && onOpenDetail) {
              e.preventDefault();
              e.stopPropagation();
              onOpenDetail();
            }
          }}
          className={`size-full object-contain ${blurred ? 'blur-sm' : ''} ${mobileFeedMode ? 'pointer-events-none md:pointer-events-auto' : ''}`}
        />
      )}

      {showMuteToggle && !playbackError ? (
        <button
          type="button"
          onClick={handleMuteClick}
          className="absolute bottom-3 right-3 z-10 flex size-9 items-center justify-center rounded-full border border-white/25 bg-black/65 text-white shadow-lg backdrop-blur hover:bg-black/80"
          aria-label={isMuted ? 'Zapnout zvuk' : 'Ztlumit'}
          title={isMuted ? 'Zapnout zvuk' : 'Ztlumit'}
        >
          {isMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </button>
      ) : null}
    </div>
  );
}
