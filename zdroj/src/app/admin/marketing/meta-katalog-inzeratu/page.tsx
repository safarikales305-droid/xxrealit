'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminMetaCatalogGet,
  nestAdminMetaCatalogListings,
  nestAdminMetaCatalogPatch,
  nestAdminMetaCatalogPreviewCount,
  type MetaCatalogAdminSettings,
  type MetaCatalogListingPreview,
} from '@/lib/nest-client';

export default function AdminMetaCatalogPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [settings, setSettings] = useState<MetaCatalogAdminSettings | null>(null);
  const [listings, setListings] = useState<MetaCatalogListingPreview[]>([]);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [city, setCity] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<{ total: number; withImage: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    const [s, list, count] = await Promise.all([
      nestAdminMetaCatalogGet(token),
      nestAdminMetaCatalogListings(token, {
        city: city.trim() || undefined,
        propertyType: propertyType.trim() || undefined,
        priceMin: priceMin.trim() || undefined,
        priceMax: priceMax.trim() || undefined,
        search: search.trim() || undefined,
      }),
      nestAdminMetaCatalogPreviewCount(token, {
        city: city.trim() || undefined,
        propertyType: propertyType.trim() || undefined,
        priceMin: priceMin.trim() || undefined,
        priceMax: priceMax.trim() || undefined,
      }),
    ]);
    setSettings(s);
    setListings(list?.items ?? []);
    setPreview(count);
  }, [token, city, propertyType, priceMin, priceMax, search]);

  useEffect(() => {
    if (!isLoading && (!token || !user || user.role !== 'ADMIN')) {
      router.replace('/');
    }
  }, [isLoading, token, user, router]);

  useEffect(() => {
    if (token && user?.role === 'ADMIN') void refresh();
  }, [token, user?.role, refresh]);

  async function save(patch: Partial<MetaCatalogAdminSettings>) {
    if (!token) return;
    setBusy(true);
    setMsg(null);
    const r = await nestAdminMetaCatalogPatch(token, patch);
    setBusy(false);
    if (!r.ok) {
      setMsg(r.error ?? 'Uložení selhalo.');
      return;
    }
    setSettings(r.settings);
    setMsg('Uloženo.');
    void refresh();
  }

  const chosenIds = Object.entries(selectedIds)
    .filter(([, v]) => v)
    .map(([k]) => k);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <Link href="/admin/bonusove-akce" className="text-sm font-bold text-[#e85d00]">
              ← Marketing
            </Link>
            <h1 className="text-lg font-bold">Meta katalog inzerátů</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {msg ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
            {msg}
          </p>
        ) : null}

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm space-y-4">
          <label className="flex items-center gap-3 text-sm font-semibold">
            <input
              type="checkbox"
              checked={settings?.enabled ?? false}
              onChange={(e) => void save({ enabled: e.target.checked })}
            />
            Zapnout Meta katalog feed
          </label>

          {settings ? (
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <div className="rounded-xl bg-zinc-50 p-3">
                <p className="text-xs font-bold uppercase text-zinc-500">Veřejná URL CSV</p>
                <p className="mt-1 break-all font-mono text-xs">{settings.feedCsvUrl}</p>
                <button
                  type="button"
                  className="mt-2 rounded-lg border border-zinc-300 px-3 py-1 text-xs font-bold"
                  onClick={() => void navigator.clipboard.writeText(settings.feedCsvUrl)}
                >
                  Zkopírovat odkaz
                </button>
              </div>
              <div className="rounded-xl bg-zinc-50 p-3">
                <p className="text-xs font-bold uppercase text-zinc-500">Carousel JSON</p>
                <p className="mt-1 break-all font-mono text-xs">{settings.carouselJsonUrl}</p>
                <button
                  type="button"
                  className="mt-2 rounded-lg border border-zinc-300 px-3 py-1 text-xs font-bold"
                  onClick={() => void navigator.clipboard.writeText(settings.carouselJsonUrl)}
                >
                  Zkopírovat odkaz
                </button>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Exportovaných inzerátů (s fotkou)</p>
                <p className="text-xl font-bold tabular-nums">{settings.lastItemCount}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Poslední aktualizace</p>
                <p className="text-sm">
                  {settings.lastGeneratedAt
                    ? new Date(settings.lastGeneratedAt).toLocaleString('cs-CZ')
                    : '—'}
                </p>
              </div>
              {settings.lastError ? (
                <div className="sm:col-span-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  Chyba feedu: {settings.lastError}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <a
              href={settings?.feedCsvUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-[#e85d00] px-4 py-2 text-xs font-bold text-white"
            >
              Stáhnout feed
            </a>
            <button
              type="button"
              disabled={busy}
              className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-bold"
              onClick={() => void refresh()}
            >
              Obnovit statistiky
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold">Návod — Meta katalog / carousel reklamy</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-zinc-700">
            <li>Otevřete Meta Business Manager.</li>
            <li>Přejděte do Commerce Manager / Catalogs.</li>
            <li>Vytvořte nový katalog.</li>
            <li>Zvolte datový zdroj feed URL.</li>
            <li>Vložte URL feedu z XXREALIT (CSV výše).</li>
            <li>V Meta Ads Manageru vytvořte reklamu typu katalog / carousel.</li>
            <li>Vyberte katalog XXREALIT.</li>
            <li>Spusťte kampaň.</li>
          </ol>
          <p className="mt-3 text-xs text-zinc-500">
            Pokud Meta nepřijme kategorii Real Estate jako e-shop produkt, použijte JSON carousel feed
            pro ruční tvorbu reklam.
          </p>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="text-base font-bold">Výběr inzerátů pro carousel reklamu</h2>
          <div className="flex flex-wrap gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Hledat…"
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Město"
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
            <input
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value)}
              placeholder="Typ (byt, dum…)"
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
            <input
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
              placeholder="Cena od"
              className="w-28 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
            <input
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
              placeholder="Cena do"
              className="w-28 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
            <button
              type="button"
              className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-bold"
              onClick={() => void refresh()}
            >
              Filtrovat
            </button>
          </div>

          {preview ? (
            <p className="text-sm text-zinc-600">
              Aktivních inzerátů: <strong>{preview.total}</strong> · s fotkou pro feed:{' '}
              <strong>{preview.withImage}</strong>
            </p>
          ) : null}

          <div className="overflow-x-auto rounded-xl border border-zinc-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs font-bold uppercase text-zinc-500">
                <tr>
                  <th className="px-3 py-2" />
                  <th className="px-3 py-2">Název</th>
                  <th className="px-3 py-2">Město</th>
                  <th className="px-3 py-2">Cena</th>
                  <th className="px-3 py-2">Typ</th>
                  <th className="px-3 py-2">Foto</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((row) => (
                  <tr key={row.id} className="border-t border-zinc-100">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedIds[row.id])}
                        disabled={!row.hasImage}
                        onChange={(e) =>
                          setSelectedIds((p) => ({ ...p, [row.id]: e.target.checked }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2">{row.title}</td>
                    <td className="px-3 py-2">{row.city}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {row.price != null ? `${row.price.toLocaleString('cs-CZ')} ${row.currency}` : '—'}
                    </td>
                    <td className="px-3 py-2">{row.propertyType}</td>
                    <td className="px-3 py-2">{row.hasImage ? '✓' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || chosenIds.length === 0}
              className="rounded-full bg-purple-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              onClick={() => void save({ carouselListingIds: chosenIds })}
            >
              Uložit výběr pro carousel ({chosenIds.length})
            </button>
            <a
              href={
                settings
                  ? `${settings.carouselJsonUrl}${chosenIds.length ? `?ids=${chosenIds.join(',')}` : ''}`
                  : '#'
              }
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-bold"
            >
              Exportovat carousel JSON
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
