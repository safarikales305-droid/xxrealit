'use client';

import { useEffect, useRef } from 'react';
import { nestAbsoluteAssetUrl } from '@/lib/api';

type SoundTrack = {
  fileUrl: string;
  previewUrl?: string | null;
  title?: string;
};

type Props = {
  soundTrack: SoundTrack | null | undefined;
  videoSelector?: string;
};

/** Přehraje zvuk k video příspěvku (video zůstane ztlumené, zvuk jde z audio tracku). */
export function PostSoundAudio({ soundTrack }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const audioUrl = soundTrack
    ? nestAbsoluteAssetUrl(soundTrack.previewUrl || soundTrack.fileUrl)
    : null;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    audio.loop = true;
    void audio.play().catch(() => undefined);
    return () => {
      audio.pause();
    };
  }, [audioUrl]);

  if (!audioUrl) return null;

  return (
    <audio ref={audioRef} src={audioUrl} preload="auto" className="sr-only" aria-hidden>
      <track kind="captions" />
    </audio>
  );
}
