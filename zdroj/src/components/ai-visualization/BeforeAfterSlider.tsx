'use client';

import { useCallback, useRef, useState } from 'react';

type Mode = 'compare' | 'before' | 'after';

type Props = {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel?: string;
  afterLabel?: string;
};

export function BeforeAfterSlider({
  beforeUrl,
  afterUrl,
  beforeLabel = 'Před',
  afterLabel = 'Po rekonstrukci',
}: Props) {
  const [mode, setMode] = useState<Mode>('compare');
  const [pos, setPos] = useState(50);
  const trackRef = useRef<HTMLDivElement>(null);

  const setFromClientX = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    setPos(Math.max(4, Math.min(96, ratio * 100)));
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(['before', 'compare', 'after'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              mode === m ? 'bg-orange-600 text-white' : 'bg-zinc-100 text-zinc-700'
            }`}
          >
            {m === 'before' ? beforeLabel : m === 'after' ? afterLabel : 'Porovnat'}
          </button>
        ))}
      </div>

      <div
        ref={trackRef}
        className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-zinc-100 touch-none select-none"
        onPointerDown={(e) => {
          if (mode !== 'compare') return;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          setFromClientX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (mode !== 'compare' || !(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return;
          setFromClientX(e.clientX);
        }}
      >
        {mode === 'after' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={afterUrl} alt={afterLabel} className="h-full w-full object-cover" />
        ) : mode === 'before' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={beforeUrl} alt={beforeLabel} className="h-full w-full object-cover" />
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={afterUrl} alt={afterLabel} className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={beforeUrl} alt={beforeLabel} className="h-full w-full object-cover" />
            </div>
            <div
              className="absolute inset-y-0 w-1 bg-white shadow-md"
              style={{ left: `calc(${pos}% - 2px)` }}
              aria-hidden
            />
            <div
              className="absolute top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-orange-600 text-xs font-bold text-white shadow-lg"
              style={{ left: `calc(${pos}% - 20px)` }}
              aria-hidden
            >
              ↔
            </div>
          </>
        )}
      </div>
    </div>
  );
}
