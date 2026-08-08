'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';

export type AccommodationFilterState = {
  q: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  priceMin: string;
  priceMax: string;
  ratingMin: string;
  wifi: boolean;
  parking: boolean;
  breakfast: boolean;
  wellness: boolean;
  pool: boolean;
  pets: boolean;
  accessible: boolean;
};

type Props = {
  initial?: Partial<AccommodationFilterState>;
  onApply?: (filters: AccommodationFilterState) => void;
  compact?: boolean;
};

export function AccommodationSearchBar({ initial, onApply, compact }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<AccommodationFilterState>({
    q: initial?.q ?? searchParams.get('q') ?? '',
    checkIn: initial?.checkIn ?? searchParams.get('checkIn') ?? '',
    checkOut: initial?.checkOut ?? searchParams.get('checkOut') ?? '',
    guests: initial?.guests ?? (Number(searchParams.get('guests')) || 2),
    priceMin: initial?.priceMin ?? searchParams.get('priceMin') ?? '',
    priceMax: initial?.priceMax ?? searchParams.get('priceMax') ?? '',
    ratingMin: initial?.ratingMin ?? searchParams.get('ratingMin') ?? '',
    wifi: initial?.wifi ?? searchParams.get('wifi') === '1',
    parking: initial?.parking ?? searchParams.get('parking') === '1',
    breakfast: initial?.breakfast ?? searchParams.get('breakfast') === '1',
    wellness: initial?.wellness ?? searchParams.get('wellness') === '1',
    pool: initial?.pool ?? searchParams.get('pool') === '1',
    pets: initial?.pets ?? searchParams.get('pets') === '1',
    accessible: initial?.accessible ?? searchParams.get('accessible') === '1',
  });

  function apply() {
    onApply?.(filters);
    const sp = new URLSearchParams();
    if (filters.q) sp.set('q', filters.q);
    if (filters.checkIn) sp.set('checkIn', filters.checkIn);
    if (filters.checkOut) sp.set('checkOut', filters.checkOut);
    if (filters.guests > 1) sp.set('guests', String(filters.guests));
    if (filters.priceMin) sp.set('priceMin', filters.priceMin);
    if (filters.priceMax) sp.set('priceMax', filters.priceMax);
    if (filters.ratingMin) sp.set('ratingMin', filters.ratingMin);
    if (filters.wifi) sp.set('wifi', '1');
    if (filters.parking) sp.set('parking', '1');
    if (filters.breakfast) sp.set('breakfast', '1');
    if (filters.wellness) sp.set('wellness', '1');
    if (filters.pool) sp.set('pool', '1');
    if (filters.pets) sp.set('pets', '1');
    if (filters.accessible) sp.set('accessible', '1');
    const qs = sp.toString();
    router.push(qs ? `?${qs}` : window.location.pathname);
  }

  if (compact) {
    return (
      <div className="flex gap-2">
        <input
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          placeholder="Kam chcete jet?"
          className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
        />
        <button
          type="button"
          onClick={apply}
          className="shrink-0 rounded-xl bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-4 py-2.5 text-sm font-semibold text-white"
        >
          Hledat
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 md:grid-cols-4">
        <label className="text-sm md:col-span-2">
          <span className="mb-1 block text-xs font-medium text-zinc-600">Lokalita</span>
          <input
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            placeholder="Město, region, hotel…"
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-zinc-600">Příjezd</span>
          <input
            type="date"
            value={filters.checkIn}
            onChange={(e) => setFilters((f) => ({ ...f, checkIn: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-zinc-600">Odjezd</span>
          <input
            type="date"
            value={filters.checkOut}
            onChange={(e) => setFilters((f) => ({ ...f, checkOut: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-zinc-600">Hosté</span>
          <input
            type="number"
            min={1}
            max={20}
            value={filters.guests}
            onChange={(e) => setFilters((f) => ({ ...f, guests: Number(e.target.value) || 1 }))}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-zinc-600">Cena od</span>
          <input
            value={filters.priceMin}
            onChange={(e) => setFilters((f) => ({ ...f, priceMin: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            placeholder="Kč"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-zinc-600">Cena do</span>
          <input
            value={filters.priceMax}
            onChange={(e) => setFilters((f) => ({ ...f, priceMax: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            placeholder="Kč"
          />
        </label>
        <div className="flex items-end md:col-span-1">
          <button
            type="button"
            onClick={apply}
            className="w-full rounded-lg bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-4 py-2.5 text-sm font-semibold text-white shadow-sm"
          >
            Hledat
          </button>
        </div>
      </div>
    </div>
  );
}

export function AccommodationSidebarFilters({
  filters,
  onChange,
  onApply,
}: {
  filters: AccommodationFilterState;
  onChange: (f: AccommodationFilterState) => void;
  onApply: () => void;
}) {
  const toggle = (key: keyof AccommodationFilterState) => {
    onChange({ ...filters, [key]: !filters[key] });
  };

  return (
    <aside className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
        <SlidersHorizontal className="size-4" />
        Filtry
      </h2>
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-zinc-600">Hodnocení min.</span>
        <input
          value={filters.ratingMin}
          onChange={(e) => onChange({ ...filters, ratingMin: e.target.value })}
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          placeholder="např. 8.5"
        />
      </label>
      <div className="space-y-2 text-sm">
        {(
          [
            ['wifi', 'Wi-Fi'],
            ['parking', 'Parkování'],
            ['breakfast', 'Snídaně'],
            ['wellness', 'Wellness'],
            ['pool', 'Bazén'],
            ['pets', 'Domácí mazlíčci'],
            ['accessible', 'Bezbariérové'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(filters[key])}
              onChange={() => toggle(key)}
            />
            {label}
          </label>
        ))}
      </div>
      <button
        type="button"
        onClick={onApply}
        className="w-full rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-800"
      >
        Použít filtry
      </button>
    </aside>
  );
}
