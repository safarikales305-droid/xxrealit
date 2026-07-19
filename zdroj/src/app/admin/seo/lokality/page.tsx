'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { SeoLocationSourcesPanel } from '@/components/admin/seo/SeoLocationSourcesPanel';
import { nestAdminSeoLocationsList } from '@/lib/nest-client';

const KINDS = [
  { value: '', label: 'Vše' },
  { value: 'KRAJ', label: 'Kraje' },
  { value: 'OKRES', label: 'Okresy' },
  { value: 'OBEC', label: 'Obce' },
  { value: 'MESTO', label: 'Města' },
  { value: 'MESTSKA_CAST', label: 'Městské části' },
  { value: 'CAST_OBCE', label: 'Části obcí' },
  { value: 'KATASTR', label: 'Katastr' },
];

export default function AdminSeoLokalityPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState('');
  const [dataSource, setDataSource] = useState('');
  const [q, setQ] = useState('');
  const [missingGps, setMissingGps] = useState(false);
  const [withoutSeoPage, setWithoutSeoPage] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    const res = await nestAdminSeoLocationsList(token, {
      kind: kind || undefined,
      q: q.trim() || undefined,
      dataSource: dataSource || undefined,
      missingGps,
      withoutSeoPage,
      page,
      pageSize: 50,
    });
    if (res) {
      setItems(res.items);
      setTotal(res.total);
    }
  }, [token, kind, dataSource, q, missingGps, withoutSeoPage, page]);

  useEffect(() => {
    if (!isLoading && (!token || user?.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, token, user, router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!token || user?.role !== 'ADMIN') return null;

  return (
    <>
      <SeoLocationSourcesPanel token={token} onImported={() => void refresh()} />

      <section>
        <h2 className="mb-3 text-lg font-semibold">Přehled lokalit</h2>
        <div className="mb-4 flex flex-wrap gap-2">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <select value={dataSource} onChange={(e) => setDataSource(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
            <option value="">Všechny zdroje</option>
            <option value="RUIAN">RÚIAN</option>
            <option value="CSU">ČSÚ</option>
            <option value="CUSTOM">Vlastní</option>
          </select>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Hledat název…"
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={missingGps} onChange={(e) => setMissingGps(e.target.checked)} />
            Bez GPS
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={withoutSeoPage} onChange={(e) => setWithoutSeoPage(e.target.checked)} />
            Bez SEO stránky
          </label>
          <button type="button" onClick={() => void refresh()} className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white">
            Filtrovat
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <a href="/admin/seo/generator" className="rounded-lg border px-3 py-1.5 text-xs hover:bg-zinc-50">
            Vygenerovat SEO stránky pro nové lokality
          </a>
          <a href="/admin/seo/stranky" className="rounded-lg border px-3 py-1.5 text-xs hover:bg-zinc-50">
            Přehled SEO kombinací
          </a>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-zinc-50 text-xs">
              <tr>
                <th className="px-3 py-2">Název</th>
                <th className="px-3 py-2">Typ</th>
                <th className="px-3 py-2">Kód</th>
                <th className="px-3 py-2">Slug</th>
                <th className="px-3 py-2">Kraj</th>
                <th className="px-3 py-2">Okres</th>
                <th className="px-3 py-2">Nadřazená</th>
                <th className="px-3 py-2">Obyv.</th>
                <th className="px-3 py-2">Inzerátů</th>
                <th className="px-3 py-2">SEO</th>
                <th className="px-3 py-2">Aktivní</th>
                <th className="px-3 py-2">Zdroj</th>
                <th className="px-3 py-2">Aktualizace</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={String(row.id)} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="px-3 py-2">{String(row.name)}</td>
                  <td className="px-3 py-2">{String(row.kind)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{String(row.officialCode ?? '—')}</td>
                  <td className="px-3 py-2 font-mono text-xs">{String(row.slug)}</td>
                  <td className="px-3 py-2">{String(row.regionName ?? '—')}</td>
                  <td className="px-3 py-2">{String(row.districtName ?? '—')}</td>
                  <td className="px-3 py-2">{String(row.parentName ?? '—')}</td>
                  <td className="px-3 py-2">{row.population != null ? String(row.population) : '—'}</td>
                  <td className="px-3 py-2">{String(row.listingCount)}</td>
                  <td className="px-3 py-2">{row.seoEnabled ? '✓' : '—'}</td>
                  <td className="px-3 py-2">{String(row.status)}</td>
                  <td className="px-3 py-2">{String(row.dataSource ?? '—')}</td>
                  <td className="px-3 py-2 text-xs">{row.updatedAt ? new Date(String(row.updatedAt)).toLocaleDateString('cs-CZ') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-sm text-zinc-500">
          Celkem {total.toLocaleString('cs-CZ')} lokalit · strana {page}
        </p>
        <div className="mt-2 flex gap-2">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border px-3 py-1 text-sm disabled:opacity-40">
            ←
          </button>
          <button type="button" onClick={() => setPage((p) => p + 1)} className="rounded border px-3 py-1 text-sm">
            →
          </button>
        </div>
      </section>
    </>
  );
}
