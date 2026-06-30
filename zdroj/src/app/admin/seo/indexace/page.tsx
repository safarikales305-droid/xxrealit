'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminSeoIndexationList,
  nestAdminSeoIndexationReindex,
  nestAdminSeoIndexationProcessPending,
  type SeoIndexationRow,
} from '@/lib/nest-client';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Čeká',
  SUBMITTED: 'Odesláno',
  INDEXED: 'Indexováno',
  FAILED: 'Chyba',
};

const TYPE_LABELS: Record<string, string> = {
  POST: 'Příspěvek',
  VIDEO_POST: 'Video',
  PROPERTY: 'Inzerát',
  SHORTS: 'Shorts',
};

export default function AdminSeoIndexationPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [rows, setRows] = useState<SeoIndexationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    const res = await nestAdminSeoIndexationList(token, { q: q.trim() || undefined });
    if (res) {
      setRows(res.items);
      setTotal(res.total);
    }
  }, [token, q]);

  useEffect(() => {
    if (!isLoading && (!token || user?.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, token, user, router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function reindex(id: string) {
    if (!token) return;
    setBusy(true);
    setMsg(null);
    const res = await nestAdminSeoIndexationReindex(token, id);
    setBusy(false);
    setMsg(res?.ok ? 'Požadavek na indexaci odeslán.' : 'Indexace se nezdařila.');
    await refresh();
  }

  async function processPending() {
    if (!token) return;
    setBusy(true);
    const res = await nestAdminSeoIndexationProcessPending(token);
    setBusy(false);
    setMsg(res ? `Zpracováno ${res.processed}, odesláno ${res.submitted}.` : 'Zpracování selhalo.');
    await refresh();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-500">
            <Link href="/admin/seo" className="text-orange-600 hover:underline">
              SEO
            </Link>{' '}
            / Indexace
          </p>
          <h1 className="text-2xl font-bold text-zinc-900">Indexace veřejného obsahu</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Sledování URL ve sitemapě a odesílání do Google Indexing API.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void processPending()}
          className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          Zpracovat čekající
        </button>
      </div>

      {msg ? <p className="rounded-xl bg-zinc-100 p-3 text-sm">{msg}</p> : null}

      <div className="flex gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Hledat URL nebo ID…"
          className="min-w-[240px] flex-1 rounded-lg border px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-lg border px-4 py-2 text-sm font-semibold"
        >
          Hledat
        </button>
      </div>

      <p className="text-sm text-zinc-600">Celkem záznamů: {total}</p>

      <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b text-xs uppercase text-zinc-500">
              <th className="p-3">Typ</th>
              <th className="p-3">URL</th>
              <th className="p-3">Sitemap</th>
              <th className="p-3">Stav</th>
              <th className="p-3">Odesláno</th>
              <th className="p-3">Chyba</th>
              <th className="p-3">Akce</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-zinc-100 align-top">
                <td className="p-3">{TYPE_LABELS[row.contentType] ?? row.contentType}</td>
                <td className="p-3 max-w-xs">
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all text-orange-600 hover:underline"
                  >
                    {row.url}
                  </a>
                </td>
                <td className="p-3">{row.inSitemap ? 'Ano' : 'Ne'}</td>
                <td className="p-3">{STATUS_LABELS[row.status] ?? row.status}</td>
                <td className="p-3 whitespace-nowrap text-xs text-zinc-500">
                  {row.lastSubmittedAt
                    ? new Date(row.lastSubmittedAt).toLocaleString('cs-CZ')
                    : '—'}
                </td>
                <td className="p-3 text-xs text-red-600">{row.lastError ?? '—'}</td>
                <td className="p-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void reindex(row.id)}
                    className="text-xs font-semibold text-orange-600"
                  >
                    Požádat Google
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
