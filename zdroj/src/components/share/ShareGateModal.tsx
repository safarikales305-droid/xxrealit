'use client';

import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import type { ShareGateVideoPublic } from '@/lib/share-gate';

type Props = {
  video: ShareGateVideoPublic;
  onContinue: () => void;
};

export function ShareGateModal({ video, onContinue }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(video.minWatchSeconds);
  const canContinue = secondsLeft <= 0;

  useEffect(() => {
    setSecondsLeft(video.minWatchSeconds);
  }, [video.id, video.minWatchSeconds]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [secondsLeft]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = muted;
    if (!muted) {
      el.volume = 1;
    }
    void el.play().catch(() => undefined);
  }, [muted, video.videoUrl]);

  function toggleSound() {
    setMuted((m) => !m);
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={video.title}
    >
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        <video
          ref={videoRef}
          src={video.videoUrl}
          poster={video.posterUrl ?? undefined}
          className="h-full w-full object-contain"
          autoPlay
          muted={muted}
          playsInline
          loop
          preload="auto"
        />

        <button
          type="button"
          onClick={toggleSound}
          className="absolute right-[max(12px,env(safe-area-inset-right))] top-[max(12px,env(safe-area-inset-top))] z-10 inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-white/35 bg-black/70 px-3 py-2 text-xs font-bold text-white shadow-lg backdrop-blur-md transition hover:bg-black/85 active:scale-[0.98]"
          aria-label={muted ? 'Zapnout zvuk' : 'Vypnout zvuk'}
          aria-pressed={!muted}
        >
          {muted ? (
            <>
              <VolumeX className="size-4 shrink-0" strokeWidth={2.25} aria-hidden />
              <span className="hidden sm:inline">🔇 Zvuk vypnutý</span>
              <span className="sm:hidden" aria-hidden>
                🔇
              </span>
            </>
          ) : (
            <>
              <Volume2 className="size-4 shrink-0" strokeWidth={2.25} aria-hidden />
              <span className="hidden sm:inline">🔊 Zvuk zapnutý</span>
              <span className="sm:hidden" aria-hidden>
                🔊
              </span>
            </>
          )}
        </button>
      </div>

      <div className="shrink-0 border-t border-white/10 bg-gradient-to-t from-black via-zinc-950 to-zinc-950 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
        <p className="text-center text-sm font-semibold text-white/90">{video.title}</p>
        <p className="mt-2 text-center text-xs text-white/65">
          {canContinue
            ? 'Můžete pokračovat na inzerát.'
            : `Pokračovat můžete za ${secondsLeft} s`}
        </p>
        <button
          type="button"
          disabled={!canContinue}
          onClick={onContinue}
          className="mt-4 flex w-full min-h-[48px] items-center justify-center rounded-full border-2 border-orange-200/90 bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-4 py-3 text-sm font-extrabold text-white shadow-[0_8px_26px_rgba(255,80,0,0.38)] transition enabled:hover:brightness-110 enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {canContinue ? video.buttonText : `Počkejte ${secondsLeft} s`}
        </button>
      </div>
    </div>
  );
}
