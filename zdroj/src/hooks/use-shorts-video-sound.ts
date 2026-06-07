'use client';

import { useCallback, useEffect, useState, type RefObject } from 'react';
import { isShortsSoundEnabled, setShortsSoundEnabled } from '@/lib/shorts-sound-preference';

type Options = {
  /** Když false, hook neaplikuje zvuk (např. náhled fotky místo videa). */
  enabled?: boolean;
  /** Změna klíče = nové video (feed scroll, jiný inzerát). */
  videoKey?: string;
};

export function useShortsVideoSound(
  videoRef: RefObject<HTMLVideoElement | null>,
  options?: Options,
) {
  const active = options?.enabled ?? true;
  const videoKey = options?.videoKey ?? '';
  const [muted, setMuted] = useState(true);

  const applyMuted = useCallback(
    (nextMuted: boolean) => {
      const el = videoRef.current;
      if (el) {
        el.muted = nextMuted;
        if (!nextMuted) {
          el.volume = 1;
          void el.play().catch(() => {
            el.muted = true;
            setMuted(true);
            setShortsSoundEnabled(false);
          });
        }
      }
      setMuted(nextMuted);
      setShortsSoundEnabled(!nextMuted);
    },
    [videoRef],
  );

  const toggleSound = useCallback(() => {
    applyMuted(!muted);
  }, [applyMuted, muted]);

  useEffect(() => {
    if (!active) return;
    const el = videoRef.current;
    if (!el) return;

    const wantSound = isShortsSoundEnabled();
    if (wantSound) {
      el.muted = false;
      el.volume = 1;
      void el.play()
        .then(() => setMuted(false))
        .catch(() => {
          el.muted = true;
          setMuted(true);
          setShortsSoundEnabled(false);
        });
    } else {
      el.muted = true;
      setMuted(true);
    }
  }, [active, videoKey, videoRef]);

  return { muted, toggleSound, applyMuted };
}
