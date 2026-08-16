'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminCompanyClaims,
  nestAdminCompanyDirectoryDashboard,
  nestAdminCompanyDirectoryMetrics,
  nestAdminCompanyImportAction,
  nestAdminCompanyImportJobs,
  nestAdminCompanyImportStart,
  nestAdminReviewCompanyClaim,
} from '@/lib/company-directory-client';

export default function AdminFirmyPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [dashboard, setDashboard] = useState<Record<string, number> | null>(null);
  const [metrics, setMetrics] = useState<Record<string, unknown> | null>(null);
  const [jobs, setJobs] = useState<Array<Record<string, unknown>>>([]);
  const [claims, setClaims] = useState<Array<Record<string, unknown>>>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const [form, setForm] = useState({
    category: 'STAVEBNICTVI',
    region: 'Pardubický kraj',
    city: 'Pardubice',
    batchSize: 10,
    delayMs: 1500,
    importMode: 'ICO_LIST' as 'ICO_LIST' | 'SEARCH',
    icoList: '05754194\n00006947',
  });

  const refresh = useCallback(async () => {
    if (!token) return;
    const [d, m, j, c] = await Promise.all([
      nestAdminCompanyDirectoryDashboard(token),
      nestAdminCompanyDirectoryMetrics(token),
      nestAdminCompanyImportJobs(token),
      nestAdminCompanyClaims(token),
    ]);
    setDashboard(d);
    setMetrics(m);
    setJobs(j ?? []);
    setClaims(c ?? []);
  }, [token]);

  useEffect(() => {
    if (!isLoading && (!token || user?.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, token, user, router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!token || user?.role !== 'ADMIN') return null;

  async function startImport() {
    if (!token) return;
    const icoList = form.icoList
      .split(/[\s,;]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    const res = await nestAdminCompanyImportStart(token, {
      category: form.category,
      region: form.region,
      city: form.city,
      batchSize: form.batchSize,
      delayMs: form.delayMs,
      importMode: form.importMode,
      icoList: form.importMode === 'ICO_LIST' ? icoList : undefined,
    });
    setMsg(res ? `Import spuštěn: ${String(res.id)}` : 'Spuštění importu selhalo.');
    void refresh();
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold">Registr firem</h1>
        <p className="mt-1 text-sm text-zinc-600">ARES import, přehled profilů a žádosti o převzetí.</p>
      </header>

      {msg ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p> : null}

      {dashboard ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(dashboard).map(([key, value]) => (
            <div key={key} className="rounded-xl border bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">{key}</p>
              <p className="mt-1 text-2xl font-bold">{value}</p>
            </div>
          ))}
        </section>
      ) : null}

      <section className="rounded-xl border bg-white p-5">
        <h2 className="text-lg font-semibold">ARES import</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <select
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            {(
              (metrics?.categories as string[] | undefined) ?? [
                'STAVEBNICTVI',
                'REALITY',
                'FINANCE',
                'PROJEKTOVANI',
                'ARCHITEKTURA',
                'REMESLA',
                'DEVELOPMENT',
                'OSTATNI',
              ]
            ).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={form.importMode}
            onChange={(e) =>
              setForm((f) => ({ ...f, importMode: e.target.value as 'ICO_LIST' | 'SEARCH' }))
            }
            className="rounded-lg border px-3 py-2 text-sm"
          >
            <option value="ICO_LIST">Seznam IČO (test)</option>
            <option value="SEARCH">Vyhledávání ARES</option>
          </select>
          <input
            value={form.region}
            onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
            placeholder="Kraj"
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <input
            value={form.city}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            placeholder="Město"
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <input
            type="number"
            value={form.batchSize}
            onChange={(e) => setForm((f) => ({ ...f, batchSize: Number(e.target.value) }))}
            placeholder="Batch size"
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <input
            type="number"
            value={form.delayMs}
            onChange={(e) => setForm((f) => ({ ...f, delayMs: Number(e.target.value) }))}
            placeholder="Delay ms"
            className="rounded-lg border px-3 py-2 text-sm"
          />
        </div>
        {form.importMode === 'ICO_LIST' ? (
          <textarea
            value={form.icoList}
            onChange={(e) => setForm((f) => ({ ...f, icoList: e.target.value }))}
            rows={4}
            className="mt-3 w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="IČO na řádky"
          />
        ) : null}
        <button
          type="button"
          onClick={() => void startImport()}
          className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Spustit import
        </button>
      </section>

      <section className="rounded-xl border bg-white p-5">
        <h2 className="text-lg font-semibold">Import historie</h2>
        <div className="mt-3 space-y-3">
          {jobs.map((job) => (
            <div key={String(job.id)} className="rounded-lg border p-3 text-sm">
              <p className="font-semibold">
                {String(job.id)} · {String(job.status)}
              </p>
              <p>
                {String(job.processed)} zpracováno · vytvořeno {String(job.created)} · aktualizováno{' '}
                {String(job.updated)} · chyby {String(job.failed)}
              </p>
              <p className="text-xs text-zinc-500">Progress: {String(job.progress)}</p>
              <div className="mt-2 flex gap-2">
                {(['pause', 'resume', 'stop'] as const).map((action) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() =>
                      void nestAdminCompanyImportAction(token, String(job.id), action).then(() =>
                        refresh(),
                      )
                    }
                    className="rounded border px-2 py-1 text-xs"
                  >
                    {action}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5">
        <h2 className="text-lg font-semibold">Claim requests</h2>
        <div className="mt-3 space-y-3">
          {claims.length === 0 ? (
            <p className="text-sm text-zinc-500">Žádné žádosti.</p>
          ) : (
            claims.map((claim) => (
              <div key={String(claim.id)} className="rounded-lg border p-3 text-sm">
                <p>
                  {String(claim.contactName)} · {String(claim.contactEmail)} · IČO {String(claim.ico)}
                </p>
                <p className="text-xs text-zinc-500">Status: {String(claim.status)}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void nestAdminReviewCompanyClaim(token, String(claim.id), 'approve').then(
                        () => refresh(),
                      )
                    }
                    className="rounded bg-emerald-600 px-2 py-1 text-xs text-white"
                  >
                    Schválit
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void nestAdminReviewCompanyClaim(token, String(claim.id), 'reject').then(
                        () => refresh(),
                      )
                    }
                    className="rounded bg-red-600 px-2 py-1 text-xs text-white"
                  >
                    Zamítnout
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {metrics ? (
        <section className="rounded-xl border bg-white p-5 text-sm text-zinc-700">
          <h2 className="text-lg font-semibold text-zinc-900">Metriky ARES</h2>
          <pre className="mt-2 overflow-auto rounded bg-zinc-50 p-3 text-xs">
            {JSON.stringify(metrics, null, 2)}
          </pre>
        </section>
      ) : null}
    </div>
  );
}
