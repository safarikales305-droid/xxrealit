'use client';

import { useEffect, useRef } from 'react';
import { resolveShortsPosterUrl } from '@/lib/feed/shorts-poster-url';
import { ShortsSlideVideo } from '@/components/shorts/ShortsSlideVideo';
import { useShortsVideoSound } from '@/hooks/use-shorts-video-sound';

export type ShortsClipSoundControl = {
  muted: boolean;
  toggleSound: () => void;
};

type Props = {
  clipId: string;
  src: string;
  isActive: boolean;
  posterUrl?: string;
  imageUrl?: string | null;
  images?: string[] | null;
  onError?: (clipId: string, error?: unknown) => void;
  /** Zvuk se zobrazuje v pravém sloupci — rodič dostane stav pro rail tlačítko. */
  onSoundReady?: (control: ShortsClipSoundControl) => void;
};

export function ShortsFeedClipVideo({
  clipId,
  src,
  isActive,
  posterUrl,
  imageUrl,
  images,
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

  const resolvedPoster =
    posterUrl?.trim() ||
    resolveShortsPosterUrl({ imageUrl, images, posterUrl, thumbnailUrl: imageUrl });

  return (
    <ShortsSlideVideo
      clipId={clipId}
      src={src}
      posterUrl={resolvedPoster}
      isActive={isActive}
      muted={muted}
      loop
      controls
      videoRef={videoRef}
      onError={onError}
    />
  );
}
