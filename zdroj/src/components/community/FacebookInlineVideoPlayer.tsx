'use client';

import { useCallback, useRef, useState } from 'react';
import { nestAbsoluteAssetUrl } from '@/lib/api';

type Props = {
  src: string;
  poster?: string | null;
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
  className = '',
  blurred = false,
  showMuteToggle = true,
  muted = false,
  onToggleMute,
  onOpenDetail,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [aspectClass, setAspectClass] = useState('aspect-square max-h-[85vh]');

  const handleUnmute = useCallback(() => {
    const el = videoRef.current;
    if (el) {
      el.muted = false;
      el.volume = 1;
      void el.play().catch(() => {});
    }
    onToggleMute?.();
  }, [onToggleMute]);

  const handleMetadata = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    const portrait = el.videoHeight > el.videoWidth * 1.05;
    setAspectClass(portrait ? 'aspect-[9/16] max-h-[85vh]' : 'aspect-square max-h-[70vh]');
    if (!showMuteToggle || !muted) {
      el.muted = false;
      el.volume = 1;
    }
  }, [muted, showMuteToggle]);

  const video = (
    <div className={`relative w-full overflow-hidden bg-black ${aspectClass} ${className}`.trim()}>
      <video
        ref={videoRef}
        src={nestAbsoluteAssetUrl(src)}
        poster={poster ? nestAbsoluteAssetUrl(poster) : undefined}
        playsInline
        controls
        preload="metadata"
        muted={showMuteToggle ? muted : false}
        onLoadedMetadata={handleMetadata}
        onClick={(e) => {
          if (onOpenDetail) {
            e.preventDefault();
            e.stopPropagation();
            onOpenDetail();
          }
        }}
        onPlay={(e) => {
          const el = e.currentTarget;
          if (!showMuteToggle || !muted) {
            el.muted = false;
            el.volume = 1;
          }
        }}
        className={`absolute inset-0 size-full object-contain ${blurred ? 'blur-sm' : ''}`}
      />
      {showMuteToggle && muted ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleUnmute();
          }}
          className="absolute bottom-3 right-3 z-10 rounded-full border border-white/30 bg-black/70 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur hover:bg-black/85"
        >
          Zapnout zvuk
        </button>
      ) : null}
    </div>
  );

  return video;
}
