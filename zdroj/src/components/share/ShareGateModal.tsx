'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import type { ShareGateVideoPublic } from '@/lib/share-gate';
import {
  isShareGateSoundEnabled,
  setShareGateSoundEnabled,
} from '@/lib/share-gate-sound-preference';

type Props = {
  video: ShareGateVideoPublic;
  onContinue: () => void;
};

export function ShareGateModal({ video, onContinue }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
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

  const applyMutedState = useCallback((nextMuted: boolean, persist = true) => {
    const el = videoRef.current;
    if (el) {
      el.muted = nextMuted;
      if (!nextMuted) {
        el.volume = 1;
      }
    }
    setMuted(nextMuted);
    if (persist) {
      setShareGateSoundEnabled(!nextMuted);
    }
    if (!nextMuted) {
      setAutoplayBlocked(false);
    }
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    let cancelled = false;
    const wantSound = isShareGateSoundEnabled();

    async function startPlayback() {
      if (wantSound) {
        el.muted = false;
        el.volume = 1;
        try {
          await el.play();
          if (!cancelled) {
            setMuted(false);
            setAutoplayBlocked(false);
          }
          return;
        } catch {
          /* autoplay se zvukem zablokován */
        }
      }

      el.muted = true;
      try {
        await el.play();
        if (!cancelled) {
          setMuted(true);
          if (wantSound) {
            setAutoplayBlocked(true);
          }
        }
      } catch {
        if (!cancelled) {
          setMuted(true);
          if (wantSound) {
            setAutoplayBlocked(true);
          }
        }
      }
    }

    void startPlayback();

    return () => {
      cancelled = true;
    };
  }, [video.id, video.videoUrl]);

  function toggleSound() {
    const el = videoRef.current;
    const nextMuted = !muted;
    if (!nextMuted && el) {
      el.muted = false;
      el.volume = 1;
      void el.play()
        .then(() => applyMutedState(false))
        .catch(() => {
          if (el) el.muted = true;
          setMuted(true);
          setShareGateSoundEnabled(false);
          setAutoplayBlocked(true);
        });
      return;
    }
    applyMutedState(nextMuted);
  }

  function enableSoundFromPrompt() {
    const el = videoRef.current;
    if (!el) return;
    el.muted = false;
    el.volume = 1;
    void el.play()
      .then(() => applyMutedState(false))
      .catch(() => {
        el.muted = true;
        setMuted(true);
        setShareGateSoundEnabled(false);
      });
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
              <span>🔇 Zvuk vypnutý</span>
            </>
          ) : (
            <>
              <Volume2 className="size-4 shrink-0" strokeWidth={2.25} aria-hidden />
              <span>🔊 Zvuk zapnutý</span>
            </>
          )}
        </button>

        {autoplayBlocked && muted ? (
          <button
            type="button"
            onClick={enableSoundFromPrompt}
            className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-orange-200/90 bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-6 py-3 text-sm font-extrabold text-white shadow-[0_12px_40px_rgba(255,80,0,0.45)] transition hover:brightness-110 active:scale-[0.98]"
          >
            Zapnout zvuk
          </button>
        ) : null}
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
