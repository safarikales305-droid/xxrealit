'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

type Props = {
  className?: string;
  /** Po úspěšném `router.push` (např. zavřít mobilní drawer). */
  onFiltersApplied?: () => void;
};

const lightCard =
  'border border-zinc-200/90 bg-white shadow-[0_2px_16px_-4px_rgba(0,0,0,0.08),0_8px_24px_-12px_rgba(0,0,0,0.06)]';

const PROPERTY_TYPE_OPTIONS = [
  { label: 'Vše', value: '' },
  { label: 'Byt', value: 'byt' },
  { label: 'Dům', value: 'dum' },
  { label: 'Pozemek', value: 'pozemek' },
] as const;

const CITY_OPTIONS = ['Praha', 'Brno', 'Ostrava', 'Olomouc'] as const;

function parseCitiesCsv(raw: string | null): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const c of CITY_OPTIONS) next[c] = false;
  if (!raw?.trim()) return next;
  for (const part of raw.split(',')) {
    const t = part.trim();
    if (t && (CITY_OPTIONS as readonly string[]).includes(t)) next[t] = true;
  }
  return next;
}

export function SidebarFilters({ className = '', onFiltersApplied }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [propertyType, setPropertyType] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [cities, setCities] = useState<Record<string, boolean>>(() => {
    const z: Record<string, boolean> = {};
    for (const c of CITY_OPTIONS) z[c] = false;
    return z;
  });

  useEffect(() => {
    setPropertyType(searchParams.get('ptype')?.trim() ?? '');
    setPriceMin(searchParams.get('priceMin')?.trim() ?? '');
    setPriceMax(searchParams.get('priceMax')?.trim() ?? '');
    setCities(parseCitiesCsv(searchParams.get('cities')));
  }, [searchParams]);

  const toggleCity = useCallback((city: string) => {
    setCities((prev) => ({ ...prev, [city]: !prev[city] }));
  }, []);

  const applyFilters = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.set('tab', 'classic');

    const pt = propertyType.trim();
    if (pt) next.set('ptype', pt);
    else next.delete('ptype');

    const selected = CITY_OPTIONS.filter((c) => cities[c]);
    if (selected.length > 0) next.set('cities', selected.join(','));
    else next.delete('cities');

    const min = priceMin.trim();
    const max = priceMax.trim();
    if (min) next.set('priceMin', min);
    else next.delete('priceMin');
    if (max) next.set('priceMax', max);
    else next.delete('priceMax');

    const qs = next.toString();
    router.push(qs ? `/?${qs}` : '/');
    router.refresh();
    onFiltersApplied?.();
  }, [
    cities,
    onFiltersApplied,
    priceMax,
    priceMin,
    propertyType,
    router,
    searchParams,
  ]);

  const clearFilters = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('ptype');
    next.delete('cities');
    next.delete('priceMin');
    next.delete('priceMax');
    const qs = next.toString();
    router.push(qs ? `/?${qs}` : '/');
    router.refresh();
    onFiltersApplied?.();
  }, [onFiltersApplied, router, searchParams]);

  return (
    <aside
      className={`flex flex-col gap-6 rounded-2xl p-6 ${lightCard} ${className}`}
    >
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-zinc-900">
          Filtry
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">
          Lokalita, cena, typ — načte znovu katalog z API.
        </p>
      </div>

      <div className="space-y-5">
        <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
          Typ nemovitosti
          <select
            value={propertyType}
            onChange={(e) => setPropertyType(e.target.value)}
            className="mt-2 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-[15px] font-medium text-zinc-900 outline-none transition hover:border-zinc-300 focus:border-[#ff6a00]/60 focus:ring-2 focus:ring-[#ff6a00]/15"
          >
            {PROPERTY_TYPE_OPTIONS.map((o) => (
              <option key={o.label} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
            Cena (Kč)
          </p>
          <div className="mt-2 flex gap-3">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="Od"
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-[15px] text-zinc-900 outline-none transition placeholder:text-zinc-400 hover:border-zinc-300 focus:border-[#ff6a00]/60 focus:ring-2 focus:ring-[#ff6a00]/15"
            />
            <input
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="Do"
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-[15px] text-zinc-900 outline-none transition placeholder:text-zinc-400 hover:border-zinc-300 focus:border-[#ff6a00]/60 focus:ring-2 focus:ring-[#ff6a00]/15"
            />
          </div>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
            Lokalita (OR)
          </legend>
          {CITY_OPTIONS.map((city) => (
            <label
              key={city}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-transparent px-1 py-1 transition hover:border-zinc-100 hover:bg-zinc-50"
            >
              <input
                type="checkbox"
                checked={Boolean(cities[city])}
                onChange={() => toggleCity(city)}
                className="size-4 rounded border-zinc-300 accent-[#ff6a00] focus:ring-2 focus:ring-[#ff6a00]/25"
              />
              <span className="text-[15px] font-medium tracking-tight text-zinc-800">
                {city}
              </span>
            </label>
          ))}
        </fieldset>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void applyFilters()}
            className="w-full rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] py-3.5 text-[15px] font-semibold tracking-[-0.01em] text-white shadow-[0_6px_24px_-6px_rgba(255,106,0,0.45)] transition hover:scale-[1.02] hover:shadow-[0_10px_32px_-6px_rgba(255,90,0,0.5)] active:scale-[0.98]"
          >
            Použít filtry
          </button>
          <button
            type="button"
            onClick={() => void clearFilters()}
            className="w-full rounded-full border border-zinc-200 py-2.5 text-[13px] font-semibold text-zinc-700 transition hover:bg-zinc-50"
          >
            Zrušit filtry
          </button>
        </div>
      </div>
    </aside>
  );
}
