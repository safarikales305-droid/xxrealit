'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { nestAdminSeoLocationsList } from '@/lib/nest-client';

const KINDS = [
  { value: '', label: 'Vše' },
  { value: 'KRAJ', label: 'Kraje' },
  { value: 'OKRES', label: 'Okresy' },
  { value: 'OBEC', label: 'Obce' },
  { value: 'MESTO', label: 'Města' },
  { value: 'MESTSKA_CAST', label: 'Městské části' },
  { value: 'CAST_OBCE', label: 'Části obcí' },
];

export default function AdminSeoLokalityPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');

  const refresh = useCallback(async () => {
    if (!token) return;
    const res = await nestAdminSeoLocationsList(token, { kind: kind || undefined, q: q.trim() || undefined, page, pageSize: 50 });
    if (res) {
      setItems(res.items);
      setTotal(res.total);
    }
  }, [token, kind, q, page]);

  useEffect(() => {
    if (!isLoading && (!token || user?.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, token, user, router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!token || user?.role !== 'ADMIN') return null;

  return (
    <>
      <p className="mb-4 text-sm text-zinc-600">
        Kraje, okresy, obce a části obcí pro programatické SEO. Import přes API{' '}
        <code className="rounded bg-zinc-100 px-1">POST /api/admin/seo/locations/import</code>.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Hledat název…"
          className="rounded-lg border px-3 py-2 text-sm"
        />
        <button type="button" onClick={() => void refresh()} className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white">
          Hledat
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-zinc-50">
            <tr>
              <th className="px-3 py-2">Název</th>
              <th className="px-3 py-2">Slug</th>
              <th className="px-3 py-2">Typ</th>
              <th className="px-3 py-2">Kraj</th>
              <th className="px-3 py-2">Okres</th>
              <th className="px-3 py-2">Inzerátů</th>
              <th className="px-3 py-2">SEO URL</th>
              <th className="px-3 py-2">Stav</th>
              <th className="px-3 py-2">Indexace</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={String(row.id)} className="border-b border-zinc-100">
                <td className="px-3 py-2">{String(row.name)}</td>
                <td className="px-3 py-2 font-mono text-xs">{String(row.slug)}</td>
                <td className="px-3 py-2">{String(row.kind)}</td>
                <td className="px-3 py-2">{String(row.regionName ?? '—')}</td>
                <td className="px-3 py-2">{String(row.districtName ?? '—')}</td>
                <td className="px-3 py-2">{String(row.listingCount)}</td>
                <td className="px-3 py-2">{String(row.seoUrlCount)}</td>
                <td className="px-3 py-2">{String(row.status)}</td>
                <td className="px-3 py-2">{row.indexed ? '✓' : '—'}</td>
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
    </>
  );
}
