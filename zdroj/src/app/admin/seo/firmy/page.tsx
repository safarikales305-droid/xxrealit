'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminCompanySeoGenerateOne,
  nestAdminCompanySeoPages,
  nestAdminCompanySeoStats,
  type CompanySeoPageAdminRow,
  type CompanySeoStats,
} from '@/lib/company-seo-admin-client';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Čeká',
  WAITING_FOR_ENRICHMENT: 'Čeká na enrichment',
  GENERATING: 'Generuje se',
  DRAFT: 'Koncept',
  READY: 'Připravená',
  DUPLICATE_CONTENT_REVIEW: 'Duplicitní obsah',
  SEO_OUTDATED: 'Zastaralá',
  ERROR: 'Chyba',
};

export default function AdminSeoFirmyPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [stats, setStats] = useState<CompanySeoStats | null>(null);
  const [rows, setRows] = useState<CompanySeoPageAdminRow[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    const [s, list] = await Promise.all([
      nestAdminCompanySeoStats(token),
      nestAdminCompanySeoPages(token, { q, status, page: 1, pageSize: 50 }),
    ]);
    setStats(s);
    if (list) {
      setRows(list.items);
      setTotal(list.total);
    }
  }, [token, q, status]);

  useEffect(() => {
    if (!isLoading && (!token || user?.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, token, user, router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function regenerate(companyId: string) {
    if (!token) return;
    const res = await nestAdminCompanySeoGenerateOne(token, companyId, true);
    setMsg(res ? 'SEO stránka aktualizována.' : 'Aktualizace se nezdařila.');
    await refresh();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">SEO firmy</h1>
          <p className="text-sm text-zinc-600">Firemní SEO stránky propojené s Registrem firem přes companyId.</p>
        </div>
        <Link
          href="/admin/seo/generator"
          className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
        >
          Generátor SEO firem
        </Link>
      </div>

      {stats ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <MiniStat label="SEO stránek" value={stats.totalPages} />
          <MiniStat label="Indexovatelných" value={stats.indexable} />
          <MiniStat label="Připravených" value={stats.ready} />
          <MiniStat label="Bez stránky" value={stats.withoutPage} />
          <MiniStat label="Průměrné skóre" value={stats.averageScore} />
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Hledat firmu, IČO…"
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
        >
          <option value="">Všechny stavy</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold"
        >
          Filtrovat
        </button>
      </div>

      {msg ? <p className="mb-3 text-sm text-green-700">{msg}</p> : null}

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Firma</th>
              <th className="px-3 py-2">IČO</th>
              <th className="px-3 py-2">Město</th>
              <th className="px-3 py-2">Kategorie</th>
              <th className="px-3 py-2">Web</th>
              <th className="px-3 py-2">AI</th>
              <th className="px-3 py-2">SEO</th>
              <th className="px-3 py-2">Index</th>
              <th className="px-3 py-2">Google</th>
              <th className="px-3 py-2">Aktualizováno</th>
              <th className="px-3 py-2">Akce</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-zinc-50">
                <td className="px-3 py-2 font-medium">{row.name}</td>
                <td className="px-3 py-2">{row.ico}</td>
                <td className="px-3 py-2">{row.city ?? '—'}</td>
                <td className="px-3 py-2">{row.categoryLabel ?? '—'}</td>
                <td className="px-3 py-2">{row.website ? '✓' : '—'}</td>
                <td className="px-3 py-2">{row.hasAiContent ? '✓' : '—'}</td>
                <td className="px-3 py-2">{row.seoScore}</td>
                <td className="px-3 py-2">{row.indexable ? 'Ano' : 'Ne'}</td>
                <td className="px-3 py-2">{row.googleStatus}</td>
                <td className="px-3 py-2">{new Date(row.updatedAt).toLocaleDateString('cs-CZ')}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    <Link href={row.previewUrl} className="text-orange-700 hover:underline">
                      Náhled
                    </Link>
                    <Link href={row.publicUrl} className="text-zinc-600 hover:underline">
                      Stránka
                    </Link>
                    <Link href={`/admin/firmy?company=${row.companyId}`} className="text-zinc-600 hover:underline">
                      Registr
                    </Link>
                    <button
                      type="button"
                      onClick={() => void regenerate(row.companyId)}
                      className="text-zinc-600 hover:underline"
                    >
                      Regenerovat
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="p-4 text-sm text-zinc-500">Žádné SEO stránky firem.</p> : null}
      </div>
      <p className="mt-2 text-xs text-zinc-500">Celkem: {total}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-lg font-bold text-zinc-900">{value}</p>
    </div>
  );
}
