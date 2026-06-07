'use client';

import { useRef } from 'react';
import { ShortsSoundToggle } from '@/components/shorts/ShortsSoundToggle';
import { useShortsVideoSound } from '@/hooks/use-shorts-video-sound';

type Props = {
  clipId: string;
  src: string;
  isActive: boolean;
  onError: () => void;
};

export function ShortsFeedClipVideo({ clipId, src, isActive, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { muted, toggleSound } = useShortsVideoSound(videoRef, {
    enabled: true,
    videoKey: `${clipId}:${src}:${isActive ? 'on' : 'off'}`,
  });

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
        onError={onError}
      >
        <source src={src} type="video/mp4" />
      </video>
      <ShortsSoundToggle muted={muted} onToggle={toggleSound} />
    </div>
  );
}
