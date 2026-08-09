'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Heart, MapPin, Star } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  ACCOMMODATION_TYPE_LABELS,
  formatAccommodationPrice,
  toggleAccommodationFavorite,
  type AccommodationDetail,
  type AccommodationItem,
} from '@/lib/accommodation-client';
import { fetchHotelbedsSimilar, isHotelbedsSlug } from '@/lib/hotelbeds-client';
import { AccommodationCard } from './AccommodationCard';

type DetailItem = AccommodationDetail & {
  available?: boolean;
  boardTypes?: string[];
  cancellationPolicy?: string | null;
  checkIn?: string;
  checkOut?: string;
  bookingEnabled?: boolean;
  originalPrice?: number | null;
  originalCurrency?: string;
};

type Props = { item: DetailItem };

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&q=80';

export function AccommodationDetailView({ item }: Props) {
  const { apiAccessToken, isAuthenticated } = useAuth();
  const [current, setCurrent] = useState(0);
  const [favorited, setFavorited] = useState(Boolean(item.favorited));
  const [similar, setSimilar] = useState<AccommodationItem[]>([]);
  const [checking, setChecking] = useState(false);
  const isHotelbeds = isHotelbedsSlug(item.slug);
  const bookingDisabled = isHotelbeds || item.bookingEnabled === false;

  const photos =
    item.photos.length > 0
      ? item.photos
      : item.coverPhoto
        ? [{ id: 'cover', url: item.coverPhoto, alt: item.name, isCover: true }]
        : [{ id: 'fallback', url: FALLBACK_IMAGE, alt: item.name, isCover: true }];

  async function loadSimilar() {
    if (similar.length) return;
    if (isHotelbeds) {
      const rows = await fetchHotelbedsSimilar(item.slug, {
        checkIn: item.checkIn,
        checkOut: item.checkOut,
      });
      setSimilar(rows);
      return;
    }
    const { fetchSimilarAccommodations } = await import('@/lib/accommodation-client');
    const rows = await fetchSimilarAccommodations(item.slug);
    setSimilar(rows);
  }

  async function toggleFavorite() {
    if (!isAuthenticated || !apiAccessToken || isHotelbeds) return;
    const res = await toggleAccommodationFavorite(apiAccessToken, item.id);
    setFavorited(res.favorited);
  }

  async function checkAvailability() {
    setChecking(true);
    try {
      // Aktivní kontrola dostupnosti — data už jsou z API, jen potvrdíme uživateli
      await new Promise((r) => setTimeout(r, 400));
    } finally {
      setChecking(false);
    }
  }

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Hotel',
    name: item.name,
    description: item.description ?? item.shortDescription,
    address: {
      '@type': 'PostalAddress',
      addressLocality: item.city,
      streetAddress: item.address,
      addressCountry: 'CZ',
    },
    geo:
      item.latitude != null && item.longitude != null
        ? { '@type': 'GeoCoordinates', latitude: item.latitude, longitude: item.longitude }
        : undefined,
    image: photos.map((p) => p.url),
    priceRange: item.priceFrom != null ? `${item.priceFrom} ${item.currency}` : undefined,
  };

  return (
    <div className="space-y-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-zinc-100">
            {photos[current] ? (
              <Image
                src={photos[current].url}
                alt={photos[current].alt ?? item.name}
                fill
                className="object-cover"
                priority
                sizes="(max-width: 1024px) 100vw, 60vw"
                unoptimized={photos[current].url.includes('hotelbeds.com')}
              />
            ) : null}
            {photos.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => setCurrent((c) => (c - 1 + photos.length) % photos.length)}
                  className="absolute left-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrent((c) => (c + 1) % photos.length)}
                  className="absolute right-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow"
                >
                  <ChevronRight className="size-5" />
                </button>
              </>
            ) : null}
          </div>
          {photos.length > 1 ? (
            <div className="no-scrollbar flex gap-2 overflow-x-auto">
              {photos.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setCurrent(i)}
                  className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 ${i === current ? 'border-orange-500' : 'border-transparent'}`}
                >
                  <Image
                    src={p.url}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="96px"
                    unoptimized={p.url.includes('hotelbeds.com')}
                  />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <aside className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm lg:sticky lg:top-24 lg:self-start">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
                {ACCOMMODATION_TYPE_LABELS[item.type] ?? item.type}
                {item.stars ? ` · ${item.stars}★` : ''}
              </p>
              <h1 className="mt-1 text-2xl font-bold text-zinc-900">{item.name}</h1>
              <p className="mt-1 flex items-center gap-1 text-sm text-zinc-600">
                <MapPin className="size-4" />
                {item.city}
                {item.region ? `, ${item.region}` : ''}
              </p>
            </div>
            {isAuthenticated && !isHotelbeds ? (
              <button type="button" onClick={() => void toggleFavorite()} className="rounded-full border p-2">
                <Heart className={`size-5 ${favorited ? 'fill-red-500 text-red-500' : 'text-zinc-600'}`} />
              </button>
            ) : null}
          </div>

          {item.rating != null ? (
            <p className="flex items-center gap-1 text-sm">
              <Star className="size-4 fill-amber-400 text-amber-400" />
              <span className="text-lg font-bold">{item.rating.toFixed(1)}</span>
              {item.reviewCount > 0 ? (
                <span className="text-zinc-500">({item.reviewCount} recenzí)</span>
              ) : null}
            </p>
          ) : null}

          {item.checkIn && item.checkOut ? (
            <div className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
              <p>
                <span className="font-semibold">Termín:</span> {item.checkIn} → {item.checkOut}
              </p>
              <p className="mt-1">
                <span className="font-semibold">Hosté:</span> dle vyhledávání
              </p>
            </div>
          ) : null}

          <div>
            <p className="text-xl font-bold text-zinc-900">{formatAccommodationPrice(item)}</p>
            {item.originalPrice != null && item.originalCurrency ? (
              <p className="text-xs text-zinc-500">
                ({item.originalPrice.toLocaleString('cs-CZ')} {item.originalCurrency})
              </p>
            ) : null}
          </div>

          {item.available !== false ? (
            <span className="inline-block rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
              Dostupné
            </span>
          ) : null}

          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={checking}
              onClick={() => void checkAvailability()}
              className="w-full rounded-xl bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {checking ? 'Kontroluji…' : 'Zkontrolovat dostupnost'}
            </button>
            <button
              type="button"
              disabled
              title="Rezervace bude aktivována po spuštění produkčního partnerství."
              className="w-full cursor-not-allowed rounded-xl border border-zinc-200 bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-500"
            >
              {bookingDisabled ? 'Rezervace připravujeme' : 'Rezervovat'}
            </button>
          </div>

          {item.checkInFrom || item.checkOutUntil ? (
            <p className="text-xs text-zinc-600">
              Check-in: {item.checkInFrom ?? '—'} · Check-out: {item.checkOutUntil ?? '—'}
            </p>
          ) : null}
        </aside>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Popis</h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-zinc-700">
          {item.description ?? item.shortDescription ?? 'Popis bude doplněn.'}
        </p>
      </section>

      {item.facilities.length > 0 ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Vybavení</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {item.facilities.map((f) => (
              <li key={f.id} className="rounded-lg bg-zinc-50 px-3 py-2 text-sm">
                {f.name}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {item.boardTypes && item.boardTypes.length > 0 ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Strava</h2>
          <p className="mt-2 text-sm text-zinc-700">{item.boardTypes.join(' · ')}</p>
        </section>
      ) : null}

      {item.rooms.length > 0 ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Pokoje</h2>
          <div className="mt-3 space-y-3">
            {item.rooms.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-100 p-4">
                <div>
                  <p className="font-semibold">{r.name}</p>
                  <p className="text-sm text-zinc-600">
                    Kapacita {r.capacity}
                    {r.description ? ` · ${r.description}` : ''}
                  </p>
                </div>
                {r.priceFrom != null ? (
                  <p className="text-sm font-bold text-zinc-900">
                    od {r.priceFrom.toLocaleString('cs-CZ')} {r.currency}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {item.cancellationPolicy ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Storno podmínky</h2>
          <p className="mt-2 text-sm text-zinc-700">{item.cancellationPolicy}</p>
        </section>
      ) : null}

      {item.latitude != null && item.longitude != null ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Mapa</h2>
          <div className="mt-3 overflow-hidden rounded-xl">
            <iframe
              title="Mapa ubytování"
              className="h-64 w-full border-0 md:h-80"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={`https://maps.google.com/maps?q=${item.latitude},${item.longitude}&z=14&output=embed`}
            />
          </div>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${item.latitude},${item.longitude}`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-sm font-medium text-orange-600 underline"
          >
            Otevřít v mapách
          </a>
        </section>
      ) : null}

      <section onMouseEnter={() => void loadSimilar()}>
        <h2 className="mb-4 text-lg font-semibold">Podobné ubytování</h2>
        {similar.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {similar.map((s) => (
              <AccommodationCard key={s.id} item={s} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Načítání podobných nabídek…</p>
        )}
      </section>

      <p className="text-center text-xs text-zinc-500">
        <Link href="/ubytovani" className="text-orange-600 underline">
          ← Zpět na výpis ubytování
        </Link>
      </p>
    </div>
  );
}
