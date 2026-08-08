'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Heart, MapPin, Star } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  ACCOMMODATION_TYPE_LABELS,
  fetchSimilarAccommodations,
  formatAccommodationPrice,
  toggleAccommodationFavorite,
  type AccommodationDetail,
  type AccommodationItem,
} from '@/lib/accommodation-client';
import { AccommodationCard } from './AccommodationCard';

type Props = { item: AccommodationDetail };

export function AccommodationDetailView({ item }: Props) {
  const { apiAccessToken, isAuthenticated } = useAuth();
  const [current, setCurrent] = useState(0);
  const [favorited, setFavorited] = useState(Boolean(item.favorited));
  const [similar, setSimilar] = useState<AccommodationItem[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const photos = item.photos.length > 0 ? item.photos : item.coverPhoto ? [{ id: 'cover', url: item.coverPhoto, alt: item.name, isCover: true }] : [];

  async function loadSimilar() {
    if (similar.length) return;
    const rows = await fetchSimilarAccommodations(item.slug);
    setSimilar(rows);
  }

  async function toggleFavorite() {
    if (!isAuthenticated || !apiAccessToken) return;
    const res = await toggleAccommodationFavorite(apiAccessToken, item.id);
    setFavorited(res.favorited);
  }

  async function checkAvailability() {
    setChecking(true);
    try {
      setModalOpen(true);
    } finally {
      setChecking(false);
    }
  }

  const structuredData = {
    '@context': 'https://schema.org',
    '@type':
      item.type === 'APARTMENT'
        ? 'Apartment'
        : item.type === 'CHALUPA' || item.type === 'CHATA'
          ? 'VacationRental'
          : 'Hotel',
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
    aggregateRating:
      item.rating != null
        ? {
            '@type': 'AggregateRating',
            ratingValue: item.rating,
            reviewCount: item.reviewCount,
          }
        : undefined,
    priceRange: item.priceFrom != null ? `${item.priceFrom} ${item.currency}` : undefined,
  };

  return (
    <div className="space-y-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

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
                  <Image src={p.url} alt="" fill className="object-cover" sizes="96px" />
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
            {isAuthenticated ? (
              <button type="button" onClick={() => void toggleFavorite()} className="rounded-full border p-2">
                <Heart className={`size-5 ${favorited ? 'fill-red-500 text-red-500' : 'text-zinc-600'}`} />
              </button>
            ) : null}
          </div>

          {item.rating != null ? (
            <p className="flex items-center gap-1 text-sm">
              <Star className="size-4 fill-amber-400 text-amber-400" />
              <span className="text-lg font-bold">{item.rating.toFixed(1)}</span>
              <span className="text-zinc-500">({item.reviewCount} recenzí)</span>
            </p>
          ) : null}

          <p className="text-xl font-bold text-zinc-900">{formatAccommodationPrice(item)}</p>

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
              onClick={() => setModalOpen(true)}
              className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-800"
            >
              Rezervovat / Pokračovat k partnerovi
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

      {item.rooms.length > 0 ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Pokoje</h2>
          <div className="mt-3 space-y-3">
            {item.rooms.map((r) => (
              <div key={r.id} className="rounded-xl border border-zinc-100 p-4">
                <p className="font-semibold">{r.name}</p>
                <p className="text-sm text-zinc-600">
                  Kapacita {r.capacity}
                  {r.beds ? ` · ${r.beds}` : ''}
                </p>
              </div>
            ))}
          </div>
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

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModalOpen(false)}>
          <div className="max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">Rezervace</h3>
            <p className="mt-2 text-sm text-zinc-600">
              Rezervace bude dostupná po napojení partnerského API (Booking.com Demand API nebo jiný
              partner). Demo data slouží k náhledu modulu Ubytování.
            </p>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="mt-4 w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Zavřít
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
