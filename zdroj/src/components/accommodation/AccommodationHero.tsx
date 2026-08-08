'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { AccommodationHeroData } from '@/lib/accommodation-client';
import { AccommodationSearchBar } from './AccommodationFilters';

type Props = {
  hero: AccommodationHeroData;
};

export function AccommodationHero({ hero }: Props) {
  return (
    <section className="relative overflow-hidden border-b border-orange-100/80 bg-gradient-to-br from-orange-50 via-white to-amber-50">
      {hero.heroImageUrl ? (
        <div className="pointer-events-none absolute inset-0 opacity-[0.14]">
          <Image
            src={hero.heroImageUrl}
            alt={hero.heroImageAlt ?? ''}
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
        </div>
      ) : null}

      <div className="relative mx-auto max-w-[100rem] px-3 py-5 sm:px-4 md:py-7">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-700/90">
            Ubytování XXREALIT
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 md:text-3xl">
            {hero.title}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-700 md:text-base">{hero.subtitle}</p>
        </div>

        <div className="mt-4 w-full max-w-3xl md:mt-5">
          <AccommodationSearchBar variant="hero" />
        </div>

        {hero.categories.length > 0 ? (
          <div className="mt-5 md:mt-6">
            <div className="no-scrollbar -mx-3 flex gap-3 overflow-x-auto px-3 pb-1 md:mx-0 md:grid md:grid-cols-5 md:gap-3 md:overflow-visible md:px-0">
              {hero.categories.map((category) => (
                <Link
                  key={category.id}
                  href={category.href}
                  className="group relative block h-[88px] w-[132px] shrink-0 overflow-hidden rounded-2xl shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md sm:h-[96px] sm:w-[148px] md:h-[104px] md:w-auto"
                >
                  <Image
                    src={category.imageUrl}
                    alt={category.imageAlt ?? category.label}
                    fill
                    className="object-cover transition duration-300 group-hover:scale-105"
                    sizes="(max-width: 768px) 148px, 20vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  <span className="absolute bottom-2 left-2 right-2 text-sm font-semibold text-white drop-shadow">
                    {category.label}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
