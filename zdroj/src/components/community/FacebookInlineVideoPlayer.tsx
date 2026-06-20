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
  /** Mobilní feed — autoplay při scrollu, bez ovládacích prvků na mobilu. */
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
  feedAutoplay = false,
  className = '',
  blurred = false,
  showMuteToggle = true,
  muted = true,
  onToggleMute,
  onOpenDetail,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const [generatedPoster, setGeneratedPoster] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [internalMuted, setInternalMuted] = useState(muted);

  const effectivePoster =
    poster?.trim() ? nestAbsoluteAssetUrl(poster) : generatedPoster;

  const isMuted = onToggleMute ? muted : internalMuted;

  useEffect(() => {
    setInternalMuted(muted);
  }, [muted]);

  useFeedVideoAutoplay(feedAutoplay, videoRef, postId ?? src, isMuted);

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
  }, [isMuted]);

  const handleMetadata = useCallback(
    async (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const el = e.currentTarget;
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
      <video
        ref={videoRef}
        src={nestAbsoluteAssetUrl(src)}
        poster={effectivePoster || undefined}
        playsInline
        controls={showControls}
        preload="metadata"
        muted={isMuted}
        loop={feedAutoplay}
        onLoadedMetadata={handleMetadata}
        onClick={(e) => {
          if (mobileFeedMode && onOpenDetail) {
            e.preventDefault();
            e.stopPropagation();
            onOpenDetail();
          }
        }}
        className={`size-full object-contain ${blurred ? 'blur-sm' : ''} ${mobileFeedMode ? 'pointer-events-none md:pointer-events-auto' : ''}`}
      />

      {showMuteToggle ? (
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
