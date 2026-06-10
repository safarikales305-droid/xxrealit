'use client';

import { useEffect, useRef } from 'react';
import { useShortsVideoSound } from '@/hooks/use-shorts-video-sound';

export type ShortsClipSoundControl = {
  muted: boolean;
  toggleSound: () => void;
};

type Props = {
  clipId: string;
  src: string;
  isActive: boolean;
  onError?: (clipId: string, error?: unknown) => void;
  /** Zvuk se zobrazuje v pravém sloupci — rodič dostane stav pro rail tlačítko. */
  onSoundReady?: (control: ShortsClipSoundControl) => void;
};

export function ShortsFeedClipVideo({
  clipId,
  src,
  isActive,
  onError,
  onSoundReady,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { muted, toggleSound } = useShortsVideoSound(videoRef, {
    enabled: true,
    videoKey: `${clipId}:${src}:${isActive ? 'on' : 'off'}`,
  });

  const onSoundReadyRef = useRef(onSoundReady);
  onSoundReadyRef.current = onSoundReady;

  useEffect(() => {
    onSoundReadyRef.current?.({ muted, toggleSound });
  }, [muted, toggleSound]);

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <video
        ref={videoRef}
        data-clip-id={clipId}
        muted={muted}
        playsInline
        autoPlay
        loop
        controls
        preload="metadata"
        className="h-full w-full object-cover"
        onError={(event) => onError?.(clipId, event)}
      >
        <source src={src} type="video/mp4" />
      </video>
    </div>
  );
}
