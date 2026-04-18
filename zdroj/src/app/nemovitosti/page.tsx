'use client';

import { useMemo, useState } from 'react';
import { PropertyListCard } from '@/components/rental/PropertyListCard';
import { MOCK_PROPERTIES, type PropertyType } from '@/lib/rental/mock-properties';

const TYPE_OPTIONS: { value: PropertyType | ''; label: string }[] = [
  { value: '', label: 'Všechny typy' },
  { value: 'byt', label: 'Byt' },
  { value: 'dum', label: 'Dům' },
  { value: 'pozemek', label: 'Pozemek' },
];

export default function NemovitostiPage() {
  const [locality, setLocality] = useState('');
  const [priceFrom, setPriceFrom] = useState('');
  const [priceTo, setPriceTo] = useState('');
  const [type, setType] = useState<PropertyType | ''>('');

  const filtered = useMemo(() => {
    const from = priceFrom ? Number.parseInt(priceFrom.replace(/\s/g, ''), 10) : NaN;
    const to = priceTo ? Number.parseInt(priceTo.replace(/\s/g, ''), 10) : NaN;
    const loc = locality.trim().toLowerCase();

    return MOCK_PROPERTIES.filter((p) => {
      if (loc && !p.location.toLowerCase().includes(loc)) return false;
      if (type && p.type !== type) return false;
      const price =
        typeof p.price === 'number' && Number.isFinite(p.price) && p.price > 0
          ? p.price
          : null;
      if (!Number.isNaN(from) && (price == null || price < from)) return false;
      if (!Number.isNaN(to) && (price == null || price > to)) return false;
      return true;
    });
  }, [locality, priceFrom, priceTo, type]);

  const inputClass =
    'w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-[#ff6a00]/50 focus:ring-2 focus:ring-[#ff6a00]/15';

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Nemovitosti</h1>
      <p className="mt-1 text-sm text-zinc-600">Filtrovat nabídky a prohlížet detail.</p>

      <section className="mt-8 rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-md sm:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Filtry
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="loc" className="mb-1 block text-xs font-medium text-zinc-600">
              Lokalita
            </label>
            <input
              id="loc"
              value={locality}
              onChange={(e) => setLocality(e.target.value)}
              placeholder="Město, část…"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="pf" className="mb-1 block text-xs font-medium text-zinc-600">
              Cena od (Kč)
            </label>
            <input
              id="pf"
              inputMode="numeric"
              value={priceFrom}
              onChange={(e) => setPriceFrom(e.target.value)}
              placeholder="např. 3000000"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="pt" className="mb-1 block text-xs font-medium text-zinc-600">
              Cena do (Kč)
            </label>
            <input
              id="pt"
              inputMode="numeric"
              value={priceTo}
              onChange={(e) => setPriceTo(e.target.value)}
              placeholder="např. 10000000"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="typ" className="mb-1 block text-xs font-medium text-zinc-600">
              Typ nemovitosti
            </label>
            <select
              id="typ"
              value={type}
              onChange={(e) => setType(e.target.value as PropertyType | '')}
              className={`${inputClass} appearance-none bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat pr-10`}
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value || 'all'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <p className="mb-4 text-sm text-zinc-600">
          Nalezeno: <span className="font-semibold text-zinc-900">{filtered.length}</span>
        </p>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <PropertyListCard key={p.id} property={p} />
          ))}
        </div>
        {filtered.length === 0 ? (
          <p className="mt-8 text-center text-sm text-zinc-500">Žádné výsledky pro zadané filtry.</p>
        ) : null}
      </section>
    </div>
  );
}
