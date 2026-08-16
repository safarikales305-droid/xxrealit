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
  nestAdminGetContactDetail,
  nestAdminConfirmContact,
  nestAdminRejectContact,
  nestAdminStartContactDiscoveryBatch,
  nestAdminListContactDiscoveryBatches,
  contactDiscoveryStateLabel,
  nestAdminStartCampaign,
  nestAdminGetCampaign,
  nestAdminCampaignAction,
  nestAdminBulkStartCampaign,
  nestAdminEngagementDashboard,
  nestAdminListCompanies,
  nestAdminMatchGoogle,
  nestAdminReviewCompanyClaim,
  nestAdminListReviews,
  nestAdminModerateReview,
  type AdminCompanyRow,
  type ImportJobView,
} from '@/lib/company-directory-client';

type Tab = 'ares' | 'companies' | 'claims' | 'reviews' | 'engagement';

type ContactDetail = {
  state?: string;
  verifiedBusinessEmail?: string | null;
  activeItemId?: string | null;
  latestContact?: {
    id: string;
    email: string;
    sourceUrl?: string | null;
    confidence?: number | null;
    status?: string;
  } | null;
};

type CampaignDetail = {
  company?: Record<string, unknown>;
  stats?: Record<string, number>;
  campaign?: {
    status?: string;
    sequenceStep?: number;
    nextSendAt?: string | null;
    sent?: number;
    opened?: number;
    clicked?: number;
  } | null;
};

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
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);
  const [contactModal, setContactModal] = useState<{ companyId: string; name: string } | null>(null);
  const [contactDetail, setContactDetail] = useState<ContactDetail | null>(null);
  const [campaignModal, setCampaignModal] = useState<{ companyId: string; name: string } | null>(null);
  const [campaignDetail, setCampaignDetail] = useState<CampaignDetail | null>(null);
  const [engagementStats, setEngagementStats] = useState<Record<string, number> | null>(null);
  const [contactBatches, setContactBatches] = useState<Array<Record<string, unknown>>>([]);
  const [adminReviews, setAdminReviews] = useState<Array<Record<string, unknown>>>([]);
  const [reviewStatusFilter, setReviewStatusFilter] = useState('ALL');
  const [discoveringContact, setDiscoveringContact] = useState(false);
  const [contactError, setContactError] = useState<{ status: number; message: string } | null>(null);

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
    region: 'Celá ČR',
    city: '',
    limit: 1500,
    batchSize: 100,
    delayMs: 500,
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
    if (tab === 'reviews') {
      const rows = await nestAdminListReviews(token, reviewStatusFilter === 'ALL' ? undefined : reviewStatusFilter);
      setAdminReviews(rows ?? []);
    }
    if (tab === 'engagement') {
      const stats = await nestAdminEngagementDashboard(token);
      setEngagementStats(stats);
    }
  }, [token, tab, refreshJobs, refreshCompanies, reviewStatusFilter]);

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
    if (tab === 'engagement' && token) {
      void nestAdminEngagementDashboard(token).then((s) => setEngagementStats(s));
    }
  }, [tab, refreshCompanies, token]);

  const refreshContactBatches = useCallback(async () => {
    if (!token) return;
    const rows = await nestAdminListContactDiscoveryBatches(token);
    if (rows) setContactBatches(rows);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void refreshContactBatches();
    const id = setInterval(() => void refreshContactBatches(), 4000);
    return () => clearInterval(id);
  }, [token, refreshContactBatches]);

  useEffect(() => {
    if (!token || !contactModal) return;
    setContactError(null);
    const load = () =>
      void nestAdminGetContactDetail(token, contactModal.companyId).then((d) => {
        if (!d) return;
        setContactDetail((d as ContactDetail) ?? null);
        setCompanies((rows) =>
          rows.map((row) =>
            row.id === contactModal.companyId
              ? { ...row, contactDiscoveryState: String((d as ContactDetail).state ?? row.contactDiscoveryState) }
              : row,
          ),
        );
      });
    load();
    const id = setInterval(load, 2500);
    return () => clearInterval(id);
  }, [token, contactModal]);

  const handleDiscoverContact = useCallback(
    async (force = false) => {
      if (!token || !contactModal || discoveringContact) return;
      setDiscoveringContact(true);
      setContactError(null);
      const res = await nestAdminDiscoverContact(token, contactModal.companyId, { force });
      setDiscoveringContact(false);
      if (!res.ok) {
        setContactError({ status: res.status, message: res.message });
        setMsg(`Dohledání kontaktu se nepodařilo spustit: ${res.message}`);
        return;
      }
      const nextState = res.data.status ?? 'QUEUED';
      setContactDetail((prev) => ({
        ...(prev ?? {}),
        state: nextState,
        verifiedBusinessEmail: res.data.email ?? prev?.verifiedBusinessEmail ?? null,
        activeItemId: res.data.itemId ?? prev?.activeItemId ?? null,
      }));
      setCompanies((rows) =>
        rows.map((row) =>
          row.id === contactModal.companyId ? { ...row, contactDiscoveryState: nextState } : row,
        ),
      );
      setMsg(
        nextState === 'VERIFIED'
          ? 'Firma má již ověřený email.'
          : nextState === 'QUEUED'
            ? 'Kontakt zařazen do fronty.'
            : 'Dohledávání kontaktu spuštěno.',
      );
      void nestAdminGetContactDetail(token, contactModal.companyId).then((d) => {
        if (d) setContactDetail((d as ContactDetail) ?? null);
      });
    },
    [token, contactModal, discoveringContact],
  );

  useEffect(() => {
    if (!token || !campaignModal) return;
    void nestAdminGetCampaign(token, campaignModal.companyId).then((d) =>
      setCampaignDetail((d as CampaignDetail) ?? null),
    );
  }, [token, campaignModal]);

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
            ['engagement', 'Engagement'],
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
              <select
                value={form.region}
                onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
                className="rounded-lg border px-3 py-2 text-sm"
              >
                <option value="Celá ČR">Celá ČR</option>
                <option value="Hlavní město Praha">Hlavní město Praha</option>
                <option value="Středočeský kraj">Středočeský kraj</option>
                <option value="Jihočeský kraj">Jihočeský kraj</option>
                <option value="Plzeňský kraj">Plzeňský kraj</option>
                <option value="Karlovarský kraj">Karlovarský kraj</option>
                <option value="Ústecký kraj">Ústecký kraj</option>
                <option value="Liberecký kraj">Liberecký kraj</option>
                <option value="Královéhradecký kraj">Královéhradecký kraj</option>
                <option value="Pardubický kraj">Pardubický kraj</option>
                <option value="Vysočina">Vysočina</option>
                <option value="Jihomoravský kraj">Jihomoravský kraj</option>
                <option value="Olomoucký kraj">Olomoucký kraj</option>
                <option value="Zlínský kraj">Zlínský kraj</option>
                <option value="Moravskoslezský kraj">Moravskoslezský kraj</option>
              </select>
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
            placeholder="Max. počet firem k importu"
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <input
            type="number"
            value={form.batchSize}
                onChange={(e) => setForm((f) => ({ ...f, batchSize: Number(e.target.value) }))}
                placeholder="Velikost dávky (ARES request)"
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
                        {job.status === 'FAILED' && isAresTooMany(job.error) ? (
                          <button
                            type="button"
                            onClick={() =>
                              void nestAdminCompanyImportAction(token, job.id, 'resplit').then(() =>
                                refreshJobs(),
                              )
                            }
                            className="rounded border border-orange-300 px-2 py-1 text-xs text-orange-800"
                          >
                            Pokračovat s rozdělením
                          </button>
                        ) : null}
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
                      {job.currentPartitionLabel ? (
                        <>
                          <br />
                          Partition: {job.currentPartitionLabel}
                        </>
                      ) : null}
                      {job.regionsTotal != null ? (
                        <>
                          <br />
                          Kraje: {job.regionsCompleted ?? 0} / {job.regionsTotal}
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

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={selectedCompanyIds.length === 0 || discoveringContact}
              onClick={() => {
                if (!token) return;
                setDiscoveringContact(true);
                void nestAdminStartContactDiscoveryBatch(token, {
                  companyIds: selectedCompanyIds,
                  label: `Vybrané firmy (${selectedCompanyIds.length})`,
                })
                  .then((r) => {
                    setMsg(`Dohledání kontaktů zařazeno (${selectedCompanyIds.length} firem).`);
                    void refreshContactBatches();
                    return r;
                  })
                  .finally(() => setDiscoveringContact(false));
              }}
              className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {discoveringContact ? 'Zařazuji…' : `Dohledat kontakty (${selectedCompanyIds.length})`}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!token) return;
                if (!window.confirm('Zařadit všechny firmy z aktuálního filtru do fronty?')) return;
                void nestAdminStartContactDiscoveryBatch(token, {
                  filter: {
                    category: companyQuery.category || undefined,
                    region: companyQuery.region || undefined,
                    city: companyQuery.q || undefined,
                    q: companyQuery.q || undefined,
                  },
                  limit: 500,
                  label: 'Filtr — dohledání kontaktů',
                }).then(() => {
                  setMsg('Firmy z filtru zařazeny do fronty.');
                  void refreshContactBatches();
                });
              }}
              className="rounded-lg border px-3 py-2 text-sm font-semibold"
            >
              Dohledat kontakty pro aktuální filtr
            </button>
            <button
              type="button"
              disabled={selectedCompanyIds.length === 0}
              onClick={() =>
                void nestAdminBulkStartCampaign(token, selectedCompanyIds).then((r) =>
                  setMsg(`Hromadná kampaň: ${String(r?.queued ?? 0)} firem zařazeno.`),
                )
              }
              className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Spustit aktivační kampaň ({selectedCompanyIds.length})
            </button>
          </div>

          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-zinc-500">
                  <th className="py-2 pr-2">✓</th>
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
                    <td className="py-2 pr-2">
                      <input
                        type="checkbox"
                        checked={selectedCompanyIds.includes(row.id)}
                        onChange={(e) =>
                          setSelectedCompanyIds((prev) =>
                            e.target.checked
                              ? [...prev, row.id]
                              : prev.filter((id) => id !== row.id),
                          )
                        }
                      />
                    </td>
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
                    <td className="py-2 pr-2 text-xs">
                      {row.verifiedBusinessEmail ?? contactDiscoveryStateLabel(row.contactDiscoveryState)}
                    </td>
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
                          onClick={() => setContactModal({ companyId: row.id, name: row.name })}
                        >
                          Kontakt
                        </button>
                        {row.verifiedBusinessEmail ? (
                          <button
                            type="button"
                            className="text-left text-xs text-orange-700 hover:underline"
                            onClick={() => setCampaignModal({ companyId: row.id, name: row.name })}
                          >
                            Spustit kampaň
                          </button>
                        ) : null}
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

          <section className="mt-6 rounded-xl border bg-zinc-50 p-4">
            <h3 className="text-sm font-semibold">Dohledávání kontaktů</h3>
            {contactBatches.length === 0 ? (
              <p className="mt-2 text-xs text-zinc-500">Zatím žádné běžící joby.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {contactBatches.map((batch) => (
                  <div key={String(batch.id)} className="rounded-lg border bg-white p-3 text-sm">
                    <p className="font-medium">{String(batch.label ?? batch.id)}</p>
                    <p className="text-xs text-zinc-500">
                      {String(batch.status)} · {String(batch.processed ?? 0)} /{' '}
                      {String(batch.totalExpected ?? '—')} · Nalezeno: {String(batch.found ?? 0)} ·
                      Fronta: {String(batch.queued ?? 0)}
                    </p>
                    <CompanyImportProgressBar
                      title="AI dohledání kontaktů"
                      status={String(batch.status)}
                      percent={Number(batch.progressPercent ?? 0)}
                      label={String(
                        (batch.progress as { label?: string } | undefined)?.label ??
                          `${batch.processed ?? 0} zpracováno`,
                      )}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        </section>
      ) : null}

      {tab === 'reviews' ? (
        <section className="rounded-xl border bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Company Reviews</h2>
            <select
              value={reviewStatusFilter}
              onChange={(e) => {
                setReviewStatusFilter(e.target.value);
                void nestAdminListReviews(
                  token,
                  e.target.value === 'ALL' ? undefined : e.target.value,
                ).then((rows) => setAdminReviews(rows ?? []));
              }}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              <option value="ALL">Vše</option>
              <option value="EMAIL_VERIFICATION_REQUIRED">Čeká na email</option>
              <option value="PENDING">Ke schválení</option>
              <option value="PUBLISHED">Publikováno</option>
              <option value="REJECTED">Zamítnuto</option>
              <option value="HIDDEN">Skryto</option>
            </select>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-zinc-500">
                  <th className="py-2 pr-2">Firma</th>
                  <th className="py-2 pr-2">Autor</th>
                  <th className="py-2 pr-2">Rating</th>
                  <th className="py-2 pr-2">Média</th>
                  <th className="py-2 pr-2">Stav</th>
                  <th className="py-2 pr-2">Email firmě</th>
                  <th className="py-2">Akce</th>
                </tr>
              </thead>
              <tbody>
                {adminReviews.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-zinc-500">
                      Žádné recenze.
                    </td>
                  </tr>
                ) : (
                  adminReviews.map((row) => (
                    <tr key={String(row.id)} className="border-b align-top">
                      <td className="py-3 pr-2">
                        <p className="font-medium">{String((row.company as { name?: string })?.name ?? '—')}</p>
                        <p className="text-xs text-zinc-500">{String(row.bodyPreview ?? '')}</p>
                      </td>
                      <td className="py-3 pr-2">
                        <p>{String(row.authorName ?? '—')}</p>
                        <p className="text-xs text-zinc-500">{String(row.authorEmail ?? '')}</p>
                      </td>
                      <td className="py-3 pr-2">
                        {String(row.rating)} ★ · {String(row.sentiment)}
                      </td>
                      <td className="py-3 pr-2 text-xs">
                        📷 {String(row.imageCount ?? 0)} · 🎥 {String(row.videoCount ?? 0)}
                      </td>
                      <td className="py-3 pr-2">{String(row.status)}</td>
                      <td className="py-3 pr-2 text-xs">{String(row.companyNotificationStatus ?? '—')}</td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-1">
                          {row.status !== 'PUBLISHED' ? (
                            <button
                              type="button"
                              className="rounded bg-emerald-600 px-2 py-1 text-xs text-white"
                              onClick={() =>
                                void nestAdminModerateReview(token, String(row.id), 'approve').then(() =>
                                  refresh(),
                                )
                              }
                            >
                              Schválit
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs"
                            onClick={() =>
                              void nestAdminModerateReview(token, String(row.id), 'hide').then(() => refresh())
                            }
                          >
                            Skrýt
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
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

      {tab === 'engagement' && engagementStats ? (
        <section className="rounded-xl border bg-white p-5">
          <h2 className="text-lg font-semibold">Engagement přehled</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(engagementStats).map(([key, value]) => (
              <div key={key} className="rounded-lg border p-3">
                <p className="text-xs uppercase text-zinc-500">{key}</p>
                <p className="mt-1 text-xl font-bold">{value}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {contactModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold">Firemní kontakt – {contactModal.name}</h3>
              <button type="button" onClick={() => setContactModal(null)} className="rounded border px-2 py-1 text-sm">
                Zavřít
              </button>
            </div>
            <p className="mt-3 text-sm">
              Stav: <strong>{contactDiscoveryStateLabel(contactDetail?.state)}</strong>
            </p>
            {contactError ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <p className="font-semibold">Dohledání kontaktu se nepodařilo spustit.</p>
                <p className="mt-1 text-xs">
                  HTTP {contactError.status}: {contactError.message}
                </p>
                <button
                  type="button"
                  className="mt-2 rounded border border-red-300 bg-white px-3 py-1 text-xs"
                  onClick={() => void handleDiscoverContact(true)}
                >
                  Zkusit znovu
                </button>
              </div>
            ) : null}
            {contactDetail?.verifiedBusinessEmail ? (
              <div className="mt-4 rounded-lg border p-3 text-sm">
                <p>
                  Ověřený email:{' '}
                  <a href={`mailto:${contactDetail.verifiedBusinessEmail}`} className="text-orange-700">
                    {contactDetail.verifiedBusinessEmail}
                  </a>
                </p>
              </div>
            ) : null}
            {contactDetail?.latestContact ? (
              <div className="mt-4 space-y-2 rounded-lg border p-3 text-sm">
                <p>
                  Email:{' '}
                  <a href={`mailto:${contactDetail.latestContact.email}`} className="text-orange-700">
                    {contactDetail.latestContact.email}
                  </a>
                </p>
                <p>
                  Zdroj:{' '}
                  {contactDetail.latestContact.sourceUrl ? (
                    <a
                      href={contactDetail.latestContact.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-orange-700 break-all"
                    >
                      {contactDetail.latestContact.sourceUrl}
                    </a>
                  ) : (
                    '—'
                  )}
                </p>
                <p>
                  Confidence:{' '}
                  {contactDetail.latestContact.confidence != null
                    ? `${Math.round(contactDetail.latestContact.confidence * 100)} %`
                    : '—'}
                </p>
                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    className="rounded bg-emerald-600 px-3 py-1.5 text-xs text-white"
                    onClick={() =>
                      void nestAdminConfirmContact(token, contactDetail.latestContact!.id).then(() => {
                        setMsg('Kontakt potvrzen.');
                        void nestAdminGetContactDetail(token, contactModal.companyId).then((d) =>
                          setContactDetail((d as ContactDetail) ?? null),
                        );
                      })
                    }
                  >
                    Potvrdit
                  </button>
                  <button
                    type="button"
                    className="rounded bg-red-600 px-3 py-1.5 text-xs text-white"
                    onClick={() =>
                      void nestAdminRejectContact(token, contactDetail.latestContact!.id).then(() => {
                        setMsg('Kontakt odmítnut.');
                        void nestAdminGetContactDetail(token, contactModal.companyId).then((d) =>
                          setContactDetail((d as ContactDetail) ?? null),
                        );
                      })
                    }
                  >
                    Odmítnout
                  </button>
                  <button
                    type="button"
                    className="rounded border px-3 py-1.5 text-xs"
                    disabled={discoveringContact}
                    onClick={() => void handleDiscoverContact(true)}
                  >
                    Vyhledat znovu
                  </button>
                </div>
              </div>
            ) : contactDetail?.state === 'QUEUED' || contactDetail?.state === 'SEARCHING' ? (
              <div className="mt-4 flex items-center gap-2 rounded-lg border bg-amber-50 p-3 text-sm text-amber-900">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>
                  {contactDetail.state === 'SEARCHING'
                    ? 'Hledám kontakt na webu firmy…'
                    : 'Kontakt čeká ve frontě…'}
                </span>
              </div>
            ) : (
              <button
                type="button"
                className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={discoveringContact}
                onClick={() => void handleDiscoverContact(false)}
              >
                {discoveringContact ? 'Zařazuji…' : 'Dohledat kontakt pomocí AI'}
              </button>
            )}
          </div>
        </div>
      ) : null}

      {campaignModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold">Aktivace firemního profilu</h3>
              <button type="button" onClick={() => setCampaignModal(null)} className="rounded border px-2 py-1 text-sm">
                Zavřít
              </button>
            </div>
            <p className="mt-2 text-sm font-medium">{campaignModal.name}</p>
            {campaignDetail?.stats ? (
              <ul className="mt-3 space-y-1 text-xs text-zinc-600">
                <li>Zobrazení profilu: {campaignDetail.stats.profileViews ?? 0}</li>
                <li>Kliknutí na web: {campaignDetail.stats.websiteClicks ?? 0}</li>
                <li>Telefon: {campaignDetail.stats.phoneClicks ?? 0}</li>
                <li>Leady: {campaignDetail.stats.leads ?? 0}</li>
              </ul>
            ) : null}
            {campaignDetail?.campaign ? (
              <div className="mt-4 rounded-lg border p-3 text-sm">
                <p>Aktivní: {campaignDetail.campaign.status === 'ACTIVE' ? 'Ano' : 'Ne'}</p>
                <p>
                  Aktuální krok: {campaignDetail.campaign.sequenceStep ?? 0} / 5
                </p>
                <p>
                  Další email:{' '}
                  {campaignDetail.campaign.nextSendAt
                    ? new Date(campaignDetail.campaign.nextSendAt).toLocaleString('cs-CZ')
                    : '—'}
                </p>
                <p>
                  Odesláno: {campaignDetail.campaign.sent ?? 0} · Otevřeno:{' '}
                  {campaignDetail.campaign.opened ?? 0} · Kliknuto: {campaignDetail.campaign.clicked ?? 0}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-xs"
                    onClick={() =>
                      void nestAdminCampaignAction(token, campaignModal.companyId, 'pause').then(() =>
                        void nestAdminGetCampaign(token, campaignModal.companyId).then((d) =>
                          setCampaignDetail((d as CampaignDetail) ?? null),
                        ),
                      )
                    }
                  >
                    Pozastavit
                  </button>
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-xs"
                    onClick={() =>
                      void nestAdminCampaignAction(token, campaignModal.companyId, 'resume').then(() =>
                        void nestAdminGetCampaign(token, campaignModal.companyId).then((d) =>
                          setCampaignDetail((d as CampaignDetail) ?? null),
                        ),
                      )
                    }
                  >
                    Pokračovat
                  </button>
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-xs"
                    onClick={() =>
                      void nestAdminCampaignAction(token, campaignModal.companyId, 'stop').then(() =>
                        void nestAdminGetCampaign(token, campaignModal.companyId).then((d) =>
                          setCampaignDetail((d as CampaignDetail) ?? null),
                        ),
                      )
                    }
                  >
                    Ukončit
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="mt-4 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white"
                onClick={() =>
                  void nestAdminStartCampaign(token, campaignModal.companyId).then((r) => {
                    setMsg(r ? 'Kampaň spuštěna.' : 'Spuštění kampaně selhalo.');
                    void nestAdminGetCampaign(token, campaignModal.companyId).then((d) =>
                      setCampaignDetail((d as CampaignDetail) ?? null),
                    );
                  })
                }
              >
                Spustit
              </button>
            )}
          </div>
        </div>
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

function isAresTooMany(error?: string | null): boolean {
  if (!error) return false;
  const msg = error.toLowerCase();
  return msg.includes('příliš mnoho') || msg.includes('1000') || msg.includes('1 000');
}
