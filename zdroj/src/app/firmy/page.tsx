'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Building2, MapPin, Search, Star } from 'lucide-react';
import {
  COMPANY_DIRECTORY_CATEGORIES,
  nestListCompanies,
  type CompanyDirectoryCard,
} from '@/lib/company-directory-client';

function Stars({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <span className="text-amber-500" aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (i < full ? '★' : '☆')).join('')}
    </span>
  );
}

export default function FirmyPage() {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [region, setRegion] = useState('');
  const [city, setCity] = useState('');
  const [rows, setRows] = useState<CompanyDirectoryCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const res = await nestListCompanies({
      q: q.trim() || undefined,
      category: category || undefined,
      region: region.trim() || undefined,
      city: city.trim() || undefined,
      page: 1,
      pageSize: 48,
    });
    if (!res) {
      setErr('Katalog firem se nepodařilo načíst.');
      setRows([]);
      setTotal(0);
    } else {
      setRows(res.items);
      setTotal(res.total);
    }
    setLoading(false);
  }, [q, category, region, city]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-[100dvh] bg-[#fafafa] pb-16 text-zinc-900">
      <div className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
          <Link href="/" className="text-sm font-semibold text-[#e85d00] hover:underline">
            ← Domů
          </Link>
          <h1 className="mt-3 text-2xl font-bold tracking-tight">Registr firem a profesionálů</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Veřejné firemní profily doplněné z rejstříku ARES.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="relative block sm:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Hledat firmu, IČO, město…"
                className="w-full rounded-xl border border-zinc-200 py-2.5 pl-10 pr-3 text-sm"
              />
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-xl border border-zinc-200 px-3 py-2.5 text-sm"
            >
              <option value="">Všechny obory</option>
              {COMPANY_DIRECTORY_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="Kraj"
              className="rounded-xl border border-zinc-200 px-3 py-2.5 text-sm"
            />
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Město"
              className="rounded-xl border border-zinc-200 px-3 py-2.5 text-sm"
            />
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white sm:col-span-2 lg:col-span-1"
            >
              Filtrovat
            </button>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {COMPANY_DIRECTORY_CATEGORIES.slice(0, 6).map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(category === c.value ? '' : c.value)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${
                  category === c.value
                    ? 'border-orange-300 bg-orange-50 text-orange-800'
                    : 'border-zinc-200 bg-white text-zinc-700'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-6">
        {err ? <p className="text-sm text-red-600">{err}</p> : null}
        <p className="mb-4 text-sm text-zinc-500">{loading ? 'Načítám…' : `Nalezeno: ${total}`}</p>
        {rows.length === 0 && !loading ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-10 text-center text-sm text-zinc-600">
            Zatím tu nejsou žádné firemní profily. Import spusťte v administraci.
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {rows.map((row) => (
              <li key={row.id}>
                <article className="flex h-full flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                      <Building2 className="size-5" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-zinc-900">{row.name}</p>
                      <p className="text-sm text-zinc-600">{row.categoryLabel}</p>
                      {row.city || row.region ? (
                        <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                          <MapPin className="size-3.5" />
                          {[row.city, row.region].filter(Boolean).join(', ')}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {row.badges.map((badge) => (
                      <span
                        key={badge}
                        className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-700"
                      >
                        {badge}
                      </span>
                    ))}
                  </div>
                  {row.rating != null ? (
                    <p className="mt-3 text-sm text-zinc-700">
                      <Stars value={row.rating} /> {row.rating.toFixed(1)}
                      {row.ratingCount != null ? (
                        <span className="text-zinc-500"> ({row.ratingCount})</span>
                      ) : null}
                    </p>
                  ) : (
                    <p className="mt-3 text-xs text-zinc-500">Zatím bez hodnocení</p>
                  )}
                  <Link
                    href={row.href}
                    className="mt-4 inline-flex w-full justify-center rounded-full border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-800 hover:border-orange-300 hover:bg-orange-50"
                  >
                    Detail firmy
                  </Link>
                </article>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
