'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { CompanyImportProgressBar } from '@/components/admin/CompanyImportProgressBar';
import {
  nestAdminCompanyClaims,
  nestAdminCompanyDirectoryDashboard,
  nestAdminCompanyDirectoryMetrics,
  nestAdminCompanyImportAction,
  nestAdminCompanyImportJob,
  nestAdminCompanyImportJobItems,
  nestAdminCompanyImportJobs,
  nestAdminCompanyImportStart,
  nestAdminDiscoverContact,
  nestAdminListCompanies,
  nestAdminMatchGoogle,
  nestAdminReviewCompanyClaim,
  type AdminCompanyRow,
  type ImportJobView,
} from '@/lib/company-directory-client';

type Tab = 'ares' | 'companies' | 'claims' | 'reviews';

export default function AdminFirmyPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [tab, setTab] = useState<Tab>('ares');
  const [dashboard, setDashboard] = useState<Record<string, number> | null>(null);
  const [metrics, setMetrics] = useState<Record<string, unknown> | null>(null);
  const [jobs, setJobs] = useState<ImportJobView[]>([]);
  const [claims, setClaims] = useState<Array<Record<string, unknown>>>([]);
  const [companies, setCompanies] = useState<AdminCompanyRow[]>([]);
  const [companiesTotal, setCompaniesTotal] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [detailJobId, setDetailJobId] = useState<string | null>(null);
  const [detailItems, setDetailItems] = useState<Array<Record<string, unknown>>>([]);

  const [companyQuery, setCompanyQuery] = useState({
    q: '',
    category: '',
    region: '',
    hasGoogle: '',
    hasEmail: '',
    claimed: '',
    hasReviews: '',
    active: '',
  });

  const [form, setForm] = useState({
    category: 'STAVEBNICTVI',
    region: 'Hlavní město Praha',
    city: 'Praha',
    query: 'praha',
    limit: 500,
    batchSize: 10,
    delayMs: 1500,
    importMode: 'SEARCH' as 'ICO_LIST' | 'SEARCH',
    icoList: '05754194\n00006947',
  });

  const hasActiveJobs = useMemo(
    () => jobs.some((j) => j.status === 'RUNNING' || j.status === 'PENDING'),
    [jobs],
  );

  const refreshJobs = useCallback(async () => {
    if (!token) return;
    const j = await nestAdminCompanyImportJobs(token);
    setJobs((j ?? []) as ImportJobView[]);
  }, [token]);

  const refreshCompanies = useCallback(async () => {
    if (!token) return;
    const res = await nestAdminListCompanies(token, companyQuery);
    if (res) {
      setCompanies(res.items);
      setCompaniesTotal(res.total);
    }
  }, [token, companyQuery]);

  const refresh = useCallback(async () => {
    if (!token) return;
    const [d, m, c] = await Promise.all([
      nestAdminCompanyDirectoryDashboard(token),
      nestAdminCompanyDirectoryMetrics(token),
      nestAdminCompanyClaims(token),
    ]);
    setDashboard(d);
    setMetrics(m);
    setClaims(c ?? []);
    await refreshJobs();
    if (tab === 'companies') await refreshCompanies();
  }, [token, tab, refreshJobs, refreshCompanies]);

  useEffect(() => {
    if (!isLoading && (!token || user?.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, token, user, router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!token || !hasActiveJobs) return;
    const id = setInterval(() => void refreshJobs(), 3000);
    return () => clearInterval(id);
  }, [token, hasActiveJobs, refreshJobs]);

  useEffect(() => {
    if (tab === 'companies') void refreshCompanies();
  }, [tab, refreshCompanies]);

  useEffect(() => {
    if (!token || !detailJobId) return;
    void nestAdminCompanyImportJobItems(token, detailJobId).then((items) =>
      setDetailItems(items ?? []),
    );
  }, [token, detailJobId]);

  if (!token || user?.role !== 'ADMIN') return null;

  async function startImport() {
    if (!token || importing) return;
    setImporting(true);
    setMsg('Připravuji import…');
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
      limit: form.limit,
      icoList: form.importMode === 'ICO_LIST' ? icoList : undefined,
    });
    if (res?.id) {
      const job = await nestAdminCompanyImportJob(token, String(res.id));
      if (job) setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)]);
      setMsg(`Import spuštěn (${String(res.id).slice(0, 8)}…)`);
    } else {
      setMsg('Spuštění importu selhalo.');
    }
    setImporting(false);
    void refreshJobs();
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold">Registr firem</h1>
        <p className="mt-1 text-sm text-zinc-600">
          ARES import, importované firmy, Google, recenze a žádosti o převzetí.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2">
        {(
          [
            ['ares', 'ARES import'],
            ['companies', 'Importované firmy'],
            ['reviews', 'Recenze'],
            ['claims', 'Claim requests'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              tab === key ? 'bg-zinc-900 text-white' : 'border bg-white text-zinc-700'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

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

      {tab === 'ares' ? (
        <>
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
            value={form.limit}
            onChange={(e) => setForm((f) => ({ ...f, limit: Number(e.target.value) }))}
            placeholder="Limit firem"
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
              disabled={importing}
              onClick={() => void startImport()}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {importing ? <Loader2 className="size-4 animate-spin" /> : null}
              Spustit import
            </button>
          </section>

          <section className="rounded-xl border bg-white p-5">
            <h2 className="text-lg font-semibold">Import historie</h2>
            <div className="mt-3 space-y-4">
              {jobs.length === 0 ? (
                <p className="text-sm text-zinc-500">Zatím žádné importy.</p>
              ) : (
                jobs.map((job) => (
                  <div key={job.id} className="rounded-lg border p-4 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">
                          {job.category ?? '—'} · {job.region ?? '—'} · {job.city ?? '—'}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {job.id.slice(0, 8)}… · {job.status}
                          {job.startedAt
                            ? ` · začátek ${new Date(job.startedAt).toLocaleString('cs-CZ')}`
                            : ''}
                          {job.lastActivityAt
                            ? ` · aktivita ${new Date(job.lastActivityAt).toLocaleString('cs-CZ')}`
                            : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(['pause', 'resume', 'stop'] as const).map((action) => (
                          <button
                            key={action}
                            type="button"
                            onClick={() =>
                              void nestAdminCompanyImportAction(token, job.id, action).then(() =>
                                refreshJobs(),
                              )
                            }
                            className="rounded border px-2 py-1 text-xs capitalize"
                          >
                            {action === 'pause'
                              ? 'Pozastavit'
                              : action === 'resume'
                                ? 'Pokračovat'
                                : 'Zastavit'}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setDetailJobId(job.id)}
                          className="rounded border px-2 py-1 text-xs"
                        >
                          Detail
                        </button>
                      </div>
                    </div>

                    <div className="mt-4">
                      <CompanyImportProgressBar
                        title="ARES import"
                        status={job.status}
                        percent={job.progressPercent ?? 0}
                        label={job.progressLabel ?? `${job.processed} zpracováno`}
                        etaSeconds={job.etaSeconds}
                      />
                    </div>

                    <p className="mt-3 text-xs text-zinc-600">
                      Celkem nalezeno: {job.totalFound ?? job.totalExpected ?? '—'}
                      <br />
                      Zpracováno: {job.processed}
                      {job.totalExpected != null ? ` / ${job.totalExpected}` : ''} · Nové: {job.created}{' '}
                      · Aktualizované: {job.updated} · Přeskočené: {job.skipped ?? 0} · Chyby:{' '}
                      {job.failed}
                      <br />
                      API requesty: {job.requestsCount ?? 0}
                      {job.currentBatchFrom != null && job.currentBatchTo != null ? (
                        <>
                          <br />
                          Aktuální dávka: {job.currentBatchFrom}–{job.currentBatchTo}
                        </>
                      ) : null}
                      {job.currentCompanyName ? (
                        <>
                          <br />
                          Aktuální firma: {job.currentCompanyName}
                        </>
                      ) : null}
                      {job.subQueryCount != null && job.subQueryCount > 0 ? (
                        <>
                          <br />
                          Poddotaz: {(job.subQueryIndex ?? 0) + 1} / {job.subQueryCount}
                        </>
                      ) : null}
                    </p>
                    {job.error ? <p className="mt-1 text-xs text-red-600">{job.error}</p> : null}
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      ) : null}

      {tab === 'companies' ? (
        <section className="rounded-xl border bg-white p-5">
          <h2 className="text-lg font-semibold">Importované firmy ({companiesTotal})</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <input
              value={companyQuery.q}
              onChange={(e) => setCompanyQuery((q) => ({ ...q, q: e.target.value }))}
              placeholder="Hledat název, IČO, město, email…"
              className="rounded-lg border px-3 py-2 text-sm lg:col-span-2"
            />
            <select
              value={companyQuery.category}
              onChange={(e) => setCompanyQuery((q) => ({ ...q, category: e.target.value }))}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              <option value="">Všechny kategorie</option>
              {(
                (metrics?.categories as string[] | undefined) ?? ['STAVEBNICTVI', 'REALITY']
              ).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void refreshCompanies()}
              className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white"
            >
              Filtrovat
            </button>
          </div>

          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-zinc-500">
                  <th className="py-2 pr-2">Firma</th>
                  <th className="py-2 pr-2">IČO</th>
                  <th className="py-2 pr-2">Město</th>
                  <th className="py-2 pr-2">Google</th>
                  <th className="py-2 pr-2">XXREALIT</th>
                  <th className="py-2 pr-2">Email</th>
                  <th className="py-2">Akce</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((row) => (
                  <tr key={row.id} className="border-b align-top">
                    <td className="py-2 pr-2 font-medium">{row.name}</td>
                    <td className="py-2 pr-2">{row.ico}</td>
                    <td className="py-2 pr-2">{row.city ?? '—'}</td>
                    <td className="py-2 pr-2">
                      {row.googleRating != null
                        ? `${row.googleRating.toFixed(1)} ★`
                        : row.googleMatchStatus ?? '—'}
                    </td>
                    <td className="py-2 pr-2">
                      {row.xxrealitReviewCount
                        ? `${row.xxrealitRatingAverage?.toFixed(1) ?? '—'} (${row.xxrealitReviewCount})`
                        : '—'}
                    </td>
                    <td className="py-2 pr-2 text-xs">{row.verifiedBusinessEmail ?? '—'}</td>
                    <td className="py-2">
                      <div className="flex flex-col gap-1">
                        <Link href={`/firmy/${row.slug}`} className="text-xs text-orange-700 hover:underline">
                          Profil
                        </Link>
                        <button
                          type="button"
                          className="text-left text-xs text-zinc-600 hover:underline"
                          onClick={() =>
                            void nestAdminMatchGoogle(token, row.id).then((r) =>
                              setMsg(r ? 'Google matching spuštěn.' : 'Google matching selhal.'),
                            )
                          }
                        >
                          Google
                        </button>
                        <button
                          type="button"
                          className="text-left text-xs text-zinc-600 hover:underline"
                          onClick={() =>
                            void nestAdminDiscoverContact(token, row.id).then((r) =>
                              setMsg(
                                r?.found === false
                                  ? 'Kontakt nenalezen.'
                                  : 'Dohledání kontaktu dokončeno.',
                              ),
                            )
                          }
                        >
                          Kontakt
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 space-y-3 md:hidden">
            {companies.map((row) => (
              <div key={row.id} className="rounded-lg border p-3 text-sm">
                <p className="font-semibold">{row.name}</p>
                <p className="text-xs text-zinc-500">
                  IČO {row.ico} · {row.city ?? '—'}
                </p>
                <p className="mt-1 text-xs">
                  Google: {row.googleRating != null ? `${row.googleRating.toFixed(1)} ★` : '—'} ·
                  XXREALIT: {row.xxrealitReviewCount ?? 0} recenzí
                </p>
                <Link href={`/firmy/${row.slug}`} className="mt-2 inline-block text-xs font-semibold text-orange-700">
                  Veřejný profil →
                </Link>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {tab === 'claims' ? (
        <section className="rounded-xl border bg-white p-5">
          <h2 className="text-lg font-semibold">Claim requests</h2>
          <div className="mt-3 space-y-3">
            {claims.length === 0 ? (
              <p className="text-sm text-zinc-500">Žádné žádosti.</p>
            ) : (
              claims.map((claim) => (
                <div key={String(claim.id)} className="rounded-lg border p-3 text-sm">
                  <p>
                    {String(claim.contactName)} · {String(claim.contactEmail)} · IČO{' '}
                    {String(claim.ico)}
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
      ) : null}

      {detailJobId ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold">Detail importu</h3>
              <button
                type="button"
                onClick={() => setDetailJobId(null)}
                className="rounded border px-2 py-1 text-sm"
              >
                Zavřít
              </button>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b text-zinc-500">
                    <th className="py-1 pr-2">Název</th>
                    <th className="py-1 pr-2">IČO</th>
                    <th className="py-1 pr-2">Město</th>
                    <th className="py-1 pr-2">Výsledek</th>
                    <th className="py-1">Čas</th>
                  </tr>
                </thead>
                <tbody>
                  {detailItems.map((item) => (
                    <tr key={String(item.id)} className="border-b">
                      <td className="py-1 pr-2">{String(item.name ?? '—')}</td>
                      <td className="py-1 pr-2">{String(item.ico)}</td>
                      <td className="py-1 pr-2">{String(item.city ?? '—')}</td>
                      <td className="py-1 pr-2">
                        {String(item.result)}
                        {item.errorMessage ? (
                          <span className="block text-red-600">{String(item.errorMessage)}</span>
                        ) : null}
                      </td>
                      <td className="py-1">
                        {item.createdAt
                          ? new Date(String(item.createdAt)).toLocaleString('cs-CZ')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
