'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useState } from 'react';
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
  providerId?: string;
  contentEnriched?: boolean;
};

type Props = { item: DetailItem };

const PARTNER_DETAIL_UNAVAILABLE =
  'Detailní informace partnera momentálně nejsou dostupné.';

function GalleryImage({
  src,
  alt,
  priority,
  className,
  sizes,
}: {
  src: string;
  alt: string;
  priority?: boolean;
  className?: string;
  sizes?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const isRemote = src.includes('hotelbeds.com') || src.includes('/hotelbeds/public/image');

  if (failed) {
    return (
      <div className={`flex items-center justify-center bg-zinc-100 text-sm text-zinc-500 ${className ?? ''}`}>
        Fotografii se nepodařilo načíst
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-zinc-100 ${className ?? ''}`}>
      {!loaded ? <div className="absolute inset-0 animate-pulse bg-zinc-200" /> : null}
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes={sizes}
        quality={90}
        unoptimized={isRemote}
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (isRemote) {
            console.warn('[Hotelbeds image] failed to load:', src);
          }
          setFailed(true);
        }}
        className={`object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}

export function AccommodationDetailView({ item }: Props) {
  const { apiAccessToken, isAuthenticated } = useAuth();
  const [current, setCurrent] = useState(0);
  const [favorited, setFavorited] = useState(Boolean(item.favorited));
  const [similar, setSimilar] = useState<AccommodationItem[]>([]);
  const [checking, setChecking] = useState(false);
  const isHotelbeds = isHotelbedsSlug(item.slug);
  const bookingDisabled = isHotelbeds || item.bookingEnabled === false;
  const partnerDetailMissing = isHotelbeds && item.contentEnriched === false;

  const photos =
    item.photos.length > 0
      ? item.photos
      : item.coverPhoto
        ? [{ id: 'cover', url: item.coverPhoto, alt: item.name, isCover: true }]
        : [];

  const sidePhotos = photos.filter((_, i) => i !== current).slice(0, 4);

  const loadSimilar = useCallback(async () => {
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
  }, [isHotelbeds, item.checkIn, item.checkOut, item.slug, similar.length]);

  async function toggleFavorite() {
    if (!isAuthenticated || !apiAccessToken || isHotelbeds) return;
    const res = await toggleAccommodationFavorite(apiAccessToken, item.id);
    setFavorited(res.favorited);
  }

  async function checkAvailability() {
    setChecking(true);
    try {
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

  const bookingSummary = (
    <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm lg:p-5">
      <div>
        <p className="text-xl font-bold text-zinc-900 lg:text-2xl">{formatAccommodationPrice(item)}</p>
        {item.originalPrice != null && item.originalCurrency ? (
          <p className="text-xs text-zinc-500">
            ({item.originalPrice.toLocaleString('cs-CZ')} {item.originalCurrency})
          </p>
        ) : null}
      </div>

      {item.checkIn && item.checkOut ? (
        <div className="grid grid-cols-2 gap-2 text-xs text-zinc-700">
          <div className="rounded-lg bg-zinc-50 px-3 py-2">
            <p className="text-zinc-500">Check-in</p>
            <p className="font-semibold">{item.checkIn}</p>
          </div>
          <div className="rounded-lg bg-zinc-50 px-3 py-2">
            <p className="text-zinc-500">Check-out</p>
            <p className="font-semibold">{item.checkOut}</p>
          </div>
        </div>
      ) : null}

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
          Check-in od {item.checkInFrom ?? '—'} · Check-out do {item.checkOutUntil ?? '—'}
        </p>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-6 pb-24 lg:space-y-8 lg:pb-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

      {/* Galerie */}
      <div className="grid gap-2 lg:grid-cols-[2fr_1fr] lg:gap-3">
        <div className="relative h-[260px] max-h-[460px] overflow-hidden rounded-2xl bg-zinc-100 sm:h-[320px] lg:h-[420px]">
          {photos.length > 0 ? (
            <GalleryImage
              src={photos[current]?.url ?? photos[0]!.url}
              alt={photos[current]?.alt ?? item.name}
              priority
              sizes="(max-width: 1024px) 100vw, 66vw"
              className="h-full w-full"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center text-sm text-zinc-500">
              <span>{partnerDetailMissing ? 'Fotografie se připravuje' : 'Fotografie hotelu nejsou k dispozici'}</span>
            </div>
          )}
          {photos.length > 1 ? (
            <>
              <button
                type="button"
                onClick={() => setCurrent((c) => (c - 1 + photos.length) % photos.length)}
                className="absolute left-3 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => setCurrent((c) => (c + 1) % photos.length)}
                className="absolute right-3 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow"
              >
                <ChevronRight className="size-5" />
              </button>
            </>
          ) : null}
        </div>

        <div className="hidden grid-cols-2 gap-2 lg:grid">
          {sidePhotos.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setCurrent(photos.findIndex((x) => x.id === p.id))}
              className="relative h-[calc(210px-6px)] overflow-hidden rounded-xl"
            >
              <GalleryImage src={p.url} alt={p.alt ?? ''} sizes="20vw" className="h-full w-full" />
            </button>
          ))}
        </div>
      </div>

      {photos.length > 1 ? (
        <div className="no-scrollbar flex gap-2 overflow-x-auto lg:hidden">
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setCurrent(i)}
              className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 ${i === current ? 'border-orange-500' : 'border-transparent'}`}
            >
              <GalleryImage src={p.url} alt="" sizes="96px" className="h-full w-full" />
            </button>
          ))}
        </div>
      ) : null}

      {/* Hlavička + booking */}
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
                {ACCOMMODATION_TYPE_LABELS[item.type] ?? item.type}
                {item.stars ? ` · ${item.stars}★` : ''}
              </p>
              <h1 className="mt-1 text-2xl font-bold text-zinc-900 md:text-3xl">{item.name}</h1>
              {isHotelbeds && item.providerId ? (
                <p className="mt-1 text-xs text-zinc-500">Hotelbeds #{item.providerId}</p>
              ) : null}
              <p className="mt-1 flex items-center gap-1 text-sm text-zinc-600">
                <MapPin className="size-4 shrink-0" />
                {item.city}
                {item.region ? `, ${item.region}` : ''}
              </p>
              {item.address ? <p className="mt-1 text-sm text-zinc-500">{item.address}</p> : null}
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
        </div>

        <div className="hidden lg:block lg:sticky lg:top-24">{bookingSummary}</div>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Popis</h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-zinc-700">
          {item.description ?? item.shortDescription ?? (partnerDetailMissing ? PARTNER_DETAIL_UNAVAILABLE : 'Popis bude doplněn.')}
        </p>
      </section>

      {item.facilities.length > 0 || partnerDetailMissing ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Vybavení</h2>
          {item.facilities.length > 0 ? (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
              {item.facilities.map((f) => (
                <li key={f.id} className="rounded-lg bg-zinc-50 px-3 py-2 text-sm">
                  {f.name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-zinc-600">{PARTNER_DETAIL_UNAVAILABLE}</p>
          )}
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
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-100 p-4"
              >
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

      {/* Mobilní sticky booking bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 p-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-[100rem] items-center justify-between gap-3">
          <div>
            <p className="text-xs text-zinc-500">Cena od</p>
            <p className="text-sm font-bold text-zinc-900">{formatAccommodationPrice(item)}</p>
          </div>
          <button
            type="button"
            disabled={checking}
            onClick={() => void checkAvailability()}
            className="rounded-xl bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Dostupnost
          </button>
        </div>
      </div>

      <p className="text-center text-xs text-zinc-500">
        <Link href="/ubytovani" className="text-orange-600 underline">
          ← Zpět na výpis ubytování
        </Link>
      </p>
    </div>
  );
}
