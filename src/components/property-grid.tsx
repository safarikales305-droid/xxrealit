'use client';

import type { PropertyFeedItem } from '@/types/property';

const PRICE_FMT = new Intl.NumberFormat('cs-CZ', {
  style: 'currency',
  currency: 'CZK',
  maximumFractionDigits: 0,
});

type Props = {
  properties: PropertyFeedItem[];
};

export function PropertyGrid({ properties }: Props) {
  if (properties.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-lg font-semibold text-zinc-700">Žádné výsledky</p>
        <p className="mt-2 max-w-sm text-sm text-zinc-500">
          Zkuste upravit hledání nebo filtry.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:gap-5 sm:p-5 lg:grid-cols-3 xl:grid-cols-4">
      {properties.map((p) => (
        <article
          key={p.id + (p.videoUrl ?? '')}
          className="group flex flex-col overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-sm transition duration-300 hover:border-zinc-300 hover:shadow-md"
        >
          <div className="relative aspect-[4/3] bg-zinc-100">
            {p.videoUrl ? (
              <video
                src={p.videoUrl}
                className="h-full w-full object-cover"
                muted
                loop
                playsInline
                preload="metadata"
                onError={() => console.error('VIDEO ERROR', p.videoUrl)}
                aria-hidden
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 text-sm text-zinc-400">
                Bez náhledu
              </div>
            )}
          </div>
          <div className="flex flex-1 flex-col p-4">
            <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-zinc-900">
              {p.title}
            </h3>
            <p className="mt-1.5 text-[13px] text-zinc-500">{p.location}</p>
            <p className="mt-auto pt-3 text-lg font-bold tabular-nums text-[#e85d00]">
              {PRICE_FMT.format(p.price)}
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}
