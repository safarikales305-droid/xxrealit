'use client';

import { useEffect, useRef, useState } from 'react';
import { Navigation } from 'lucide-react';

type Props = {
  query: string;
};

export function ListingDetailMap({ query }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !query) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [query]);

  if (!query.trim()) return null;

  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  const embedSrc = `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;

  return (
    <section ref={ref} className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-zinc-900">Mapa</h2>
        <a
          href={mapsLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-[#e85d00] px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:brightness-110"
        >
          <Navigation className="size-4" aria-hidden />
          Navigovat
        </a>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100">
        {visible ? (
          <iframe
            title={`Mapa — ${query}`}
            src={embedSrc}
            className="h-[320px] w-full sm:h-[400px]"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : (
          <div className="flex h-[320px] items-center justify-center text-sm text-zinc-500 sm:h-[400px]">
            Mapa se načte při posunu stránky…
          </div>
        )}
      </div>
    </section>
  );
}
