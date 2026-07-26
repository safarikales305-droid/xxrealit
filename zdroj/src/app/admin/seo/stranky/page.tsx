'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { nestAdminSeoPagesList, type SeoPageListItem } from '@/lib/nest-client';

export default function AdminSeoStrankyPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [items, setItems] = useState<SeoPageListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [intentSlug, setIntentSlug] = useState('');
  const [transaction, setTransaction] = useState('');
  const [filterMissingTitle, setFilterMissingTitle] = useState(false);
  const [filterLowScore, setFilterLowScore] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    const res = await nestAdminSeoPagesList(token, {
      q: q.trim() || undefined,
      intentSlug: intentSlug || undefined,
      transaction: transaction || undefined,
      missingTitle: filterMissingTitle ? 'true' : undefined,
      lowScore: filterLowScore ? 'true' : undefined,
      page,
      pageSize: 25,
    });
    setBusy(false);
    if (res) {
      setItems(res.items);
      setTotal(res.total);
    }
  }, [token, q, intentSlug, transaction, filterMissingTitle, filterLowScore, page]);

  useEffect(() => {
    if (!isLoading && (!token || user?.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, token, user, router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const totalPages = Math.max(1, Math.ceil(total / 25));

  if (!token || user?.role !== 'ADMIN') return null;

  return (
    <>
      <p className="mb-4 text-sm text-zinc-600">
        Všechny programatické SEO URL (intent × lokalita). Celkem ~{total.toLocaleString('cs-CZ')} kombinací.
      </p>

      <div className="mb-4 flex flex-wrap gap-2 rounded-2xl border border-zinc-200 bg-white p-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Vyhledat lokalitu…"
          className="rounded-lg border px-3 py-2 text-sm"
        />
        <select
          value={intentSlug}
          onChange={(e) => setIntentSlug(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="">Všechny typy</option>
          <option value="prodej-bytu">Prodej bytů</option>
          <option value="pronajem-bytu">Pronájem bytů</option>
          <option value="prodej-domu">Prodej domů</option>
          <option value="prodej-pozemku">Prodej pozemků</option>
        </select>
        <select
          value={transaction}
          onChange={(e) => setTransaction(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="">Transakce</option>
          <option value="prodej">Prodej</option>
          <option value="pronajem">Pronájem</option>
        </select>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={filterMissingTitle} onChange={(e) => setFilterMissingTitle(e.target.checked)} />
          Bez title
        </label>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={filterLowScore} onChange={(e) => setFilterLowScore(e.target.checked)} />
          Nízké SEO skóre
        </label>
        <button type="button" onClick={() => void refresh()} className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white">
          Filtrovat
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b bg-zinc-50 text-zinc-600">
            <tr>
              <th className="px-3 py-2">URL</th>
              <th className="px-3 py-2">Název</th>
              <th className="px-3 py-2">Lokalita</th>
              <th className="px-3 py-2">Typ</th>
              <th className="px-3 py-2">Transakce</th>
              <th className="px-3 py-2">Meta Title</th>
              <th className="px-3 py-2">Stav</th>
              <th className="px-3 py-2">Inzerátů</th>
              <th className="px-3 py-2">Skóre</th>
              <th className="px-3 py-2">Index</th>
              <th className="px-3 py-2">Kliknutí</th>
              <th className="px-3 py-2">Pozice</th>
              <th className="px-3 py-2">Akce</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.pageKey} className="border-b border-zinc-100 hover:bg-zinc-50">
                <td className="px-3 py-2 font-mono">{row.url}</td>
                <td className="max-w-[140px] truncate px-3 py-2">{row.name}</td>
                <td className="px-3 py-2">{row.locationName}</td>
                <td className="px-3 py-2">{row.intentLabel}</td>
                <td className="px-3 py-2">{row.transaction ?? '—'}</td>
                <td className="max-w-[160px] truncate px-3 py-2">{row.metaTitle}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-1.5 py-0.5 ${
                      row.status === 'PUBLISHED'
                        ? 'bg-green-100 text-green-800'
                        : row.status === 'MISSING'
                          ? 'bg-zinc-100 text-zinc-600'
                          : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="px-3 py-2">{row.listingCount}</td>
                <td className="px-3 py-2">{row.seoScore}</td>
                <td className="px-3 py-2">{row.googleIndex ? '✓' : '—'}</td>
                <td className="px-3 py-2">{row.clicks}</td>
                <td className="px-3 py-2">{row.position ?? '—'}</td>
                <td className="px-3 py-2">
                  {row.id.startsWith('virtual:') ? (
                    <Link
                      href={`/admin/seo/generator?intent=${row.intentSlug}&location=${row.locationSlug}`}
                      className="text-orange-600 hover:underline"
                    >
                      Generovat
                    </Link>
                  ) : (
                    <span className="flex flex-wrap gap-2">
                      <Link href={`/admin/seo/pages/${row.id}/preview`} className="text-orange-600 hover:underline">
                        Náhled
                      </Link>
                      <Link href={row.url} target="_blank" className="text-zinc-600 hover:underline">
                        Veřejně
                      </Link>
                      <Link href={`/admin/seo/stranky/${row.id}`} className="text-orange-600 hover:underline">
                        Upravit
                      </Link>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {busy ? <p className="p-4 text-sm text-zinc-500">Načítám…</p> : null}
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <span>
          Strana {page} / {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded border px-3 py-1 disabled:opacity-40"
          >
            ← Předchozí
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded border px-3 py-1 disabled:opacity-40"
          >
            Další →
          </button>
        </div>
      </div>
    </>
  );
}
