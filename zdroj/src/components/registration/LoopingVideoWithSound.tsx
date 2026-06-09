'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Props = {
  src: string;
  className?: string;
  videoClassName?: string;
  showNativeControls?: boolean;
};

export function LoopingVideoWithSound({
  src,
  className = '',
  videoClassName = 'h-full w-full object-cover',
  showNativeControls = false,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  const tryPlay = useCallback(async () => {
    const el = videoRef.current;
    if (!el) return;

    el.loop = true;
    el.muted = false;
    el.volume = 1;

    try {
      await el.play();
      setMuted(el.muted);
      return;
    } catch {
      el.muted = true;
      setMuted(true);
      try {
        await el.play();
      } catch {
        /* autoplay blocked */
      }
    }
  }, []);

  useEffect(() => {
    void tryPlay();
  }, [src, tryPlay]);

  const toggleMute = () => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    if (!el.muted) el.volume = 1;
    setMuted(el.muted);
    void el.play().catch(() => {});
  };

  return (
    <div className={`relative ${className}`.trim()}>
      <video
        ref={videoRef}
        src={src}
        loop
        playsInline
        controls={showNativeControls}
        className={videoClassName}
        onLoadedData={() => void tryPlay()}
      />
      <button
        type="button"
        onClick={toggleMute}
        className="absolute right-3 top-3 z-10 rounded-full border border-white/25 bg-black/55 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur transition hover:bg-black/75"
        aria-label={muted ? 'Zapnout zvuk' : 'Vypnout zvuk'}
      >
        {muted ? '🔇 Zvuk vypnutý' : '🔊 Zvuk zapnutý'}
      </button>
    </div>
  );
}
