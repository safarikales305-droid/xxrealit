'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { PropertyFeedItem } from '@/types/property';

const PRICE_FMT = new Intl.NumberFormat('cs-CZ', {
  style: 'currency',
  currency: 'CZK',
  maximumFractionDigits: 0,
});

/** Orange glass — TikTok actions, brand #ff6a00 → #ff3c00 */
const glowBtnBase =
  'relative flex size-14 shrink-0 items-center justify-center rounded-full border border-white/20 bg-gradient-to-br from-[#ff6a00]/45 to-[#ff3c00]/40 text-xl text-white shadow-[0_0_24px_-2px_rgba(255,106,0,0.55),0_0_16px_-4px_rgba(255,60,0,0.35),inset_0_1px_0_0_rgba(255,255,255,0.2)] backdrop-blur-xl transition duration-300 ease-out hover:scale-110 hover:border-white/35 hover:shadow-[0_0_32px_rgba(255,106,0,0.5),0_0_24px_rgba(255,80,0,0.35)] active:scale-95';

type Props = {
  property: PropertyFeedItem;
  isActive: boolean;
  liked: boolean;
  likes: number;
  onToggleLike: () => void;
};

export function PropertyCard({
  property: p,
  isActive,
  liked,
  likes,
  onToggleLike,
}: Props) {
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    console.log('VIDEO URL:', p.videoUrl);
  }, [p.id, p.videoUrl]);

  return (
    <section className="relative isolate box-border h-[calc(100vh-56px)] max-h-[calc(100vh-56px)] w-full max-w-full shrink-0 snap-start snap-always overflow-hidden overflow-x-hidden bg-black md:h-[calc(100vh-64px)] md:max-h-[calc(100vh-64px)]">
      {p.videoUrl ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <video
            data-property-id={p.id}
            muted
            playsInline
            autoPlay
            loop
            controls
            preload="metadata"
            className="w-full h-full object-cover"
            onError={(e) => console.log('VIDEO ERROR', e)}
            onLoadedData={() => console.log('VIDEO LOADED')}
          >
            <source src={p.videoUrl} type="video/mp4" />
          </video>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-zinc-800 via-zinc-900 to-black text-zinc-500">
          <span className="text-[15px] font-medium tracking-tight">Bez videa</span>
        </div>
      )}

      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-black/20 to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/25 via-transparent to-black/20"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[50%] bg-gradient-to-t from-black/45 via-black/15 to-transparent"
        aria-hidden
      />

      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${
          isActive ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden
      >
        <div className="absolute inset-0 bg-gradient-to-t from-[#ff6a00]/[0.12] via-transparent to-[#ff3c00]/[0.06]" />
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-6 pb-16 pt-44 pr-[5rem] sm:px-8 sm:pb-[4.25rem] sm:pr-[5.5rem]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70 drop-shadow-lg">
          Nemovitost
        </p>
        <h2 className="mt-3 max-w-[min(100%,24rem)] text-[1.7rem] font-semibold leading-[1.12] tracking-[-0.035em] text-white drop-shadow-lg sm:max-w-xl sm:text-[1.85rem]">
          {p.title}
        </h2>
        <p className="mt-3.5 text-[15px] font-medium leading-relaxed text-white/90 drop-shadow-lg">
          {p.location}
        </p>
        <p className="mt-3 bg-gradient-to-r from-[#ffb366] via-[#ff8c42] to-[#ff6a00] bg-clip-text text-[1.45rem] font-bold tabular-nums tracking-[-0.02em] text-transparent sm:text-[1.6rem] sm:tracking-[-0.025em] [filter:drop-shadow(0_2px_10px_rgba(0,0,0,0.5))]">
          {PRICE_FMT.format(p.price)}
        </p>
        <Link
          href={`/nemovitost/${p.id}`}
          className="pointer-events-auto mt-4 inline-flex w-fit rounded-full border border-white/35 bg-white/10 px-4 py-2 text-[13px] font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
        >
          Detail inzerátu
        </Link>
      </div>

      <div className="absolute bottom-28 right-5 z-10 flex flex-col items-center gap-6 sm:bottom-32 sm:right-7">
        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            aria-label="Líbí se mi"
            onClick={onToggleLike}
            className={`${glowBtnBase} ${
              liked
                ? 'border-rose-400/60 from-rose-500/50 to-[#ff3c00]/45 shadow-[0_0_28px_-2px_rgba(251,113,133,0.55)]'
                : ''
            }`}
          >
            {liked ? '❤️' : '🤍'}
          </button>
          <span className="text-[11px] font-bold tabular-nums tracking-wide text-white drop-shadow-lg">
            {likes}
          </span>
        </div>
        <button
          type="button"
          aria-label={muted ? 'Zapnout zvuk' : 'Vypnout zvuk'}
          onClick={() => setMuted(!muted)}
          className={glowBtnBase}
        >
          {muted ? '🔇' : '🔊'}
        </button>
        <button type="button" aria-label="Komentáře" className={glowBtnBase}>
          💬
        </button>
        <button type="button" aria-label="Kontakt" className={glowBtnBase}>
          📩
        </button>
      </div>
    </section>
  );
}
