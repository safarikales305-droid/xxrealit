'use client';

import { useCallback, useRef } from 'react';
import { nestAbsoluteAssetUrl } from '@/lib/api';

type Props = {
  src: string;
  poster?: string | null;
  className?: string;
  blurred?: boolean;
  showMuteToggle?: boolean;
  muted?: boolean;
  onToggleMute?: () => void;
};

export function FacebookInlineVideoPlayer({
  src,
  poster,
  className = '',
  blurred = false,
  showMuteToggle = true,
  muted = false,
  onToggleMute,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleUnmute = useCallback(() => {
    const el = videoRef.current;
    if (el) {
      el.muted = false;
      el.volume = 1;
      void el.play().catch(() => {});
    }
    onToggleMute?.();
  }, [onToggleMute]);

  return (
    <div className={`relative ${className}`.trim()}>
      <video
        ref={videoRef}
        src={nestAbsoluteAssetUrl(src)}
        poster={poster ? nestAbsoluteAssetUrl(poster) : undefined}
        playsInline
        controls
        preload="metadata"
        muted={showMuteToggle ? muted : false}
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          el.muted = false;
          el.volume = 1;
        }}
        onPlay={(e) => {
          const el = e.currentTarget;
          if (!showMuteToggle || !muted) {
            el.muted = false;
            el.volume = 1;
          }
        }}
        className={`h-full w-full object-contain ${blurred ? 'blur-sm' : ''}`}
      />
      {showMuteToggle && muted ? (
        <button
          type="button"
          onClick={handleUnmute}
          className="absolute bottom-3 right-3 z-10 rounded-full border border-white/30 bg-black/70 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur hover:bg-black/85"
        >
          Zapnout zvuk
        </button>
      ) : null}
    </div>
  );
}
