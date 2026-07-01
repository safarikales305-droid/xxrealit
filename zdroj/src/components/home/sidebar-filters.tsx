'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { appMobilePanel } from '@/components/ui/app-mobile-panel-styles';
import { API_BASE_URL } from '@/lib/api';
import { fetchListingLocations, type ListingLocationOption } from '@/lib/listing-locations';

type Props = {
  className?: string;
  /** Po úspěšném `router.push` (např. zavřít mobilní drawer). */
  onFiltersApplied?: () => void;
  /** Světlý sidebar na desktopu vs. tmavý mobilní sheet. */
  variant?: 'light' | 'dark';
  /** Bez vlastního obalu (uvnitř bottom sheetu). */
  embedded?: boolean;
};

const lightCard =
  'border border-zinc-200/90 bg-white shadow-[0_2px_16px_-4px_rgba(0,0,0,0.08),0_8px_24px_-12px_rgba(0,0,0,0.06)]';

const PROPERTY_TYPE_OPTIONS = [
  { label: 'Vše', value: '' },
  { label: 'Byt', value: 'byt' },
  { label: 'Dům', value: 'dum' },
  { label: 'Pozemek', value: 'pozemek' },
] as const;

const FALLBACK_CITY_OPTIONS = ['Praha', 'Brno', 'Ostrava', 'Olomouc'] as const;

function parseCitiesCsv(raw: string | null, knownCities: string[]): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const c of knownCities) next[c] = false;
  if (!raw?.trim()) return next;
  for (const part of raw.split(',')) {
    const t = part.trim();
    if (t && knownCities.includes(t)) next[t] = true;
  }
  return next;
}

export function SidebarFilters({
  className = '',
  onFiltersApplied,
  variant = 'light',
  embedded = false,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDark = variant === 'dark';
  const [locationOptions, setLocationOptions] = useState<ListingLocationOption[]>([]);
  const cityOptions = useMemo(() => {
    const fromApi = locationOptions.map((x) => x.city).filter(Boolean);
    const merged = [...new Set([...fromApi, ...FALLBACK_CITY_OPTIONS])];
    return merged;
  }, [locationOptions]);
  const [propertyType, setPropertyType] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [cities, setCities] = useState<Record<string, boolean>>({});
  const [tipsOnly, setTipsOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchListingLocations(API_BASE_URL, { limit: 200 }).then((items) => {
      if (!cancelled) setLocationOptions(items);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setPropertyType(searchParams.get('ptype')?.trim() ?? '');
    setPriceMin(searchParams.get('priceMin')?.trim() ?? '');
    setPriceMax(searchParams.get('priceMax')?.trim() ?? '');
    setCities(parseCitiesCsv(searchParams.get('cities'), cityOptions));
    const tipRaw = searchParams.get('tipsOnly')?.trim().toLowerCase();
    setTipsOnly(tipRaw === '1' || tipRaw === 'true');
  }, [searchParams, cityOptions]);

  const cityCountByName = useMemo(() => {
    const map = new Map<string, number>();
    for (const loc of locationOptions) {
      map.set(loc.city, (map.get(loc.city) ?? 0) + loc.count);
    }
    return map;
  }, [locationOptions]);

  const toggleCity = useCallback((city: string) => {
    setCities((prev) => ({ ...prev, [city]: !prev[city] }));
  }, []);

  const applyFilters = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    const currentTab = searchParams.get('tab')?.trim();
    if (currentTab === 'shorts' || currentTab === 'classic') {
      next.set('tab', currentTab);
    } else {
      next.set('tab', 'classic');
    }

    const pt = propertyType.trim();
    if (pt) next.set('ptype', pt);
    else next.delete('ptype');

    const selected = cityOptions.filter((c) => cities[c]);
    if (selected.length > 0) next.set('cities', selected.join(','));
    else next.delete('cities');

    const min = priceMin.trim();
    const max = priceMax.trim();
    if (min) next.set('priceMin', min);
    else next.delete('priceMin');
    if (max) next.set('priceMax', max);
    else next.delete('priceMax');

    if (tipsOnly) next.set('tipsOnly', '1');
    else next.delete('tipsOnly');

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
    tipsOnly,
    cityOptions,
  ]);

  const clearFilters = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('ptype');
    next.delete('cities');
    next.delete('priceMin');
    next.delete('priceMax');
    next.delete('tipsOnly');
    const qs = next.toString();
    router.push(qs ? `/?${qs}` : '/');
    router.refresh();
    onFiltersApplied?.();
  }, [onFiltersApplied, router, searchParams]);

  const content = (
    <div className={isDark ? 'space-y-6 pb-4' : 'space-y-5'}>
      {!embedded && !isDark ? (
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-zinc-900">Filtry</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">
            Lokalita, cena, typ — načte znovu katalog z API.
          </p>
        </div>
      ) : null}

      <label className={`block ${isDark ? appMobilePanel.sectionLabel : 'text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500'}`}>
        Typ nemovitosti
        <select
          value={propertyType}
          onChange={(e) => setPropertyType(e.target.value)}
          className={`mt-2 ${isDark ? appMobilePanel.select : 'w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-[15px] font-medium text-zinc-900 outline-none transition hover:border-zinc-300 focus:border-[#ff6a00]/60 focus:ring-2 focus:ring-[#ff6a00]/15'}`}
        >
          {PROPERTY_TYPE_OPTIONS.map((o) => (
            <option key={o.label} value={o.value} className={isDark ? 'bg-zinc-900 text-white' : ''}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <div>
        <p className={isDark ? appMobilePanel.sectionLabel : 'text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500'}>
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
            className={
              isDark
                ? `min-w-0 flex-1 ${appMobilePanel.input}`
                : 'min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-[15px] text-zinc-900 outline-none transition placeholder:text-zinc-400 hover:border-zinc-300 focus:border-[#ff6a00]/60 focus:ring-2 focus:ring-[#ff6a00]/15'
            }
          />
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Do"
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            className={
              isDark
                ? `min-w-0 flex-1 ${appMobilePanel.input}`
                : 'min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-[15px] text-zinc-900 outline-none transition placeholder:text-zinc-400 hover:border-zinc-300 focus:border-[#ff6a00]/60 focus:ring-2 focus:ring-[#ff6a00]/15'
            }
          />
        </div>
      </div>

      <div>
        <p className={isDark ? appMobilePanel.sectionLabel : 'text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500'}>
          Lokalita
        </p>
        {isDark ? (
          <div className="mt-3 flex max-h-48 flex-wrap gap-2 overflow-y-auto">
            {cityOptions.map((city) => {
              const active = Boolean(cities[city]);
              const count = cityCountByName.get(city);
              return (
                <button
                  key={city}
                  type="button"
                  onClick={() => toggleCity(city)}
                  className={`${appMobilePanel.chip} ${active ? appMobilePanel.chipActive : appMobilePanel.chipIdle}`}
                  aria-pressed={active}
                >
                  {city}
                  {count ? ` (${count})` : ''}
                </button>
              );
            })}
          </div>
        ) : (
          <fieldset className="mt-3 max-h-56 space-y-2 overflow-y-auto">
            {cityOptions.map((city) => {
              const count = cityCountByName.get(city);
              return (
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
                  {count ? <span className="text-zinc-400"> ({count})</span> : null}
                </span>
              </label>
            );
            })}
          </fieldset>
        )}
      </div>

      {isDark ? (
        <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5">
          <input
            type="checkbox"
            checked={tipsOnly}
            onChange={(e) => setTipsOnly(e.target.checked)}
            className="size-4 rounded border-white/30 accent-[#ff6a00] focus:ring-2 focus:ring-[#ff6a00]/25"
          />
          <span className="text-[15px] font-semibold text-zinc-100">Pouze TIP nabídky</span>
        </label>
      ) : (
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-transparent px-1 py-1 transition hover:border-zinc-100 hover:bg-zinc-50">
          <input
            type="checkbox"
            checked={tipsOnly}
            onChange={(e) => setTipsOnly(e.target.checked)}
            className="size-4 rounded border-zinc-300 accent-[#ff5a00] focus:ring-2 focus:ring-[#ff5a00]/25"
          />
          <span className="text-[15px] font-medium tracking-tight text-zinc-800">Pouze TIP nabídky</span>
        </label>
      )}

      <div className={`flex flex-col gap-2.5 ${isDark ? 'pt-1' : ''}`}>
        <button
          type="button"
          onClick={() => void applyFilters()}
          className={
            isDark
              ? appMobilePanel.primaryBtn
              : 'w-full rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] py-3.5 text-[15px] font-semibold tracking-[-0.01em] text-white shadow-[0_6px_24px_-6px_rgba(255,106,0,0.45)] transition hover:scale-[1.02] hover:shadow-[0_10px_32px_-6px_rgba(255,90,0,0.5)] active:scale-[0.98]'
          }
        >
          Použít filtr
        </button>
        <button
          type="button"
          onClick={() => void clearFilters()}
          className={
            isDark
              ? appMobilePanel.secondaryBtn
              : 'w-full rounded-full border border-zinc-200 py-2.5 text-[13px] font-semibold text-zinc-700 transition hover:bg-zinc-50'
          }
        >
          Zrušit / Vymazat filtr
        </button>
      </div>
    </div>
  );

  if (embedded) {
    return <div className={className}>{content}</div>;
  }

  return (
    <aside className={`flex flex-col gap-6 rounded-2xl p-6 ${lightCard} ${className}`}>
      {content}
    </aside>
  );
}
