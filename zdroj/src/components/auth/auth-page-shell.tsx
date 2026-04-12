'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Play } from 'lucide-react';
import Logo from '@/components/Logo';

export type AuthShellVariant = 'login' | 'register';

const SUBTITLES: Record<AuthShellVariant, string> = {
  login:
    'Přihlaste se a sledujte nabídky, videoprohlídky i nové příležitosti.',
  register:
    'Vytvořte si účet a objevujte nabídky, videoprohlídky i nové příležitosti na jednom místě.',
};

type DecorCard = {
  key: string;
  title: string;
  location: string;
  price: string;
  type: string;
  kind: 'listing' | 'short';
  positionClass: string;
};

const DECOR_DESKTOP: DecorCard[] = [
  {
    key: 'd1',
    title: 'Světlý byt 3+kk',
    location: 'Praha — Vinohrady',
    price: '8 490 000 Kč',
    type: 'Byt',
    kind: 'listing',
    positionClass: 'left-[3%] top-[12%] hidden lg:block',
  },
  {
    key: 'd2',
    title: 'Rodinný dům s terasou',
    location: 'Brno — Líšeň',
    price: '12 900 000 Kč',
    type: 'Dům',
    kind: 'listing',
    positionClass: 'right-[2%] top-[10%] hidden xl:block',
  },
  {
    key: 'd3',
    title: 'Videoprohlídka',
    location: 'Ostrava',
    price: 'Shorts',
    type: 'Video',
    kind: 'short',
    positionClass: 'right-[4%] top-[36%] hidden lg:block',
  },
  {
    key: 'd4',
    title: 'Investiční apartmán',
    location: 'Praha — Smíchov',
    price: '6 200 000 Kč',
    type: 'Byt',
    kind: 'listing',
    positionClass: 'left-[4%] bottom-[16%] hidden xl:block',
  },
  {
    key: 'd5',
    title: 'Stavební pozemek',
    location: 'České Budějovice',
    price: '3 150 000 Kč',
    type: 'Pozemek',
    kind: 'listing',
    positionClass: 'left-[6%] top-[40%] hidden lg:block',
  },
  {
    key: 'd6',
    title: 'Luxusní vila',
    location: 'Karlovy Vary',
    price: '24 500 000 Kč',
    type: 'Dům',
    kind: 'listing',
    positionClass: 'right-[3%] bottom-[12%] hidden lg:block',
  },
  {
    key: 'd7',
    title: 'Novostavba 4+kk',
    location: 'Plzeň',
    price: '9 780 000 Kč',
    type: 'Byt',
    kind: 'listing',
    positionClass: 'left-[1%] bottom-[6%] hidden 2xl:block',
  },
  {
    key: 'd8',
    title: 'Loft k pronájmu',
    location: 'Praha — Holešovice',
    price: '28 500 Kč / měs.',
    type: 'Pronájem',
    kind: 'short',
    positionClass: 'right-[8%] bottom-[30%] hidden 2xl:block',
  },
];

const DECOR_MOBILE: DecorCard[] = [
  {
    key: 'm1',
    title: 'Byt 2+kk',
    location: 'Praha',
    price: '5 900 000 Kč',
    type: 'Byt',
    kind: 'listing',
    positionClass: 'left-[2%] top-[20%] scale-[0.88] opacity-40 lg:hidden',
  },
  {
    key: 'm2',
    title: 'Video',
    location: 'Brno',
    price: 'Shorts',
    type: 'Video',
    kind: 'short',
    positionClass: 'right-[2%] top-[24%] scale-90 opacity-35 lg:hidden',
  },
];

function DecorCardVisual({ card }: { card: DecorCard }) {
  if (card.kind === 'short') {
    return (
      <div
        className="pointer-events-none select-none overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-b from-zinc-800/90 via-zinc-900 to-black/90 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.65)] ring-1 ring-white/10 backdrop-blur-sm"
        aria-hidden
      >
        <div className="relative mx-auto aspect-[9/16] w-[4.5rem] sm:w-[5.5rem] md:w-[6.25rem]">
          <div className="absolute inset-0 bg-gradient-to-br from-orange-500/25 via-transparent to-violet-900/30" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Play className="size-7 text-white/90 drop-shadow-md md:size-8" strokeWidth={1.25} />
          </div>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-1.5 pb-2 pt-6">
            <p className="truncate text-[10px] font-semibold text-white">{card.title}</p>
            <p className="text-[9px] text-white/65">{card.location}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none w-[10.5rem] select-none overflow-hidden rounded-2xl border border-white/15 bg-white/[0.07] shadow-[0_24px_60px_-14px_rgba(0,0,0,0.55)] ring-1 ring-white/10 backdrop-blur-md sm:w-[11.5rem] md:w-[12.5rem]"
      aria-hidden
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-100/35 via-orange-400/25 to-slate-900/90" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(255,255,255,0.22),transparent_55%)]" />
        <span className="absolute left-2 top-2 rounded-full bg-black/35 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/90 backdrop-blur-sm">
          {card.type}
        </span>
      </div>
      <div className="space-y-0.5 px-3 py-2.5">
        <p className="truncate text-xs font-semibold text-white">{card.title}</p>
        <p className="truncate text-[11px] text-white/65">{card.location}</p>
        <p className="text-xs font-bold text-orange-300">{card.price}</p>
      </div>
    </div>
  );
}

type AuthPageShellProps = {
  variant: AuthShellVariant;
  children: ReactNode;
};

/**
 * Sdílený marketingový layout pro přihlášení a registraci — logo xxrealit, nadpis, plovoucí demo karty.
 */
export function AuthPageShell({ variant, children }: AuthPageShellProps) {
  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden bg-slate-950 text-zinc-900">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(234,88,12,0.22),transparent_50%),radial-gradient(ellipse_80%_50%_at_100%_50%,rgba(249,115,22,0.08),transparent_45%),radial-gradient(ellipse_60%_40%_at_0%_80%,rgba(251,146,60,0.07),transparent_40%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/30 via-transparent to-slate-950"
        aria-hidden
      />

      {DECOR_MOBILE.map((card) => (
        <div
          key={card.key}
          className={`pointer-events-none absolute z-[1] ${card.positionClass}`}
        >
          <DecorCardVisual card={card} />
        </div>
      ))}
      {DECOR_DESKTOP.map((card) => (
        <div
          key={card.key}
          className={`pointer-events-none absolute z-[1] ${card.positionClass}`}
        >
          <DecorCardVisual card={card} />
        </div>
      ))}

      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-6xl flex-col justify-center px-4 py-10 sm:px-6 sm:py-14 md:py-16">
        <Link
          href="/"
          className="mb-6 inline-flex w-fit items-center gap-1.5 text-sm font-medium text-white/70 transition hover:text-white"
        >
          <span aria-hidden>←</span> Zpět na úvod
        </Link>

        <div className="mx-auto w-full max-w-lg">
          <div className="rounded-[1.75rem] border border-white/15 bg-white/[0.97] p-7 shadow-[0_32px_64px_-24px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-9 md:p-10 md:rounded-[2rem]">
            <div className="flex flex-col items-center text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="rounded-2xl bg-gradient-to-br from-[#ff6a00]/12 to-[#ff3c00]/5 px-5 py-3.5 ring-1 ring-orange-500/15">
                  <Logo className="h-11 w-auto sm:h-12 md:h-14" />
                </div>
                <span className="text-lg font-bold tracking-tight text-zinc-900 md:text-xl">
                  xxrealit
                </span>
              </div>
              <h1 className="mt-6 max-w-md text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl md:text-4xl md:leading-tight">
                Vítejte ve světě realit
              </h1>
              <p className="mt-3 max-w-md text-pretty text-sm leading-relaxed text-zinc-600 sm:text-[15px]">
                {SUBTITLES[variant]}
              </p>
            </div>

            <div className="mt-8">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
