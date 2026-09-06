'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { AdminSubPage } from '@/components/admin/AdminSubPage';
import { SrealityImportProgressPanel } from '@/components/admin/inzeraty/SrealityImportProgressPanel';
import {
  nestAdminSrealityImportCancelJob,
  nestAdminSrealityImportCreateJob,
  nestAdminSrealityImportDeleteJob,
  nestAdminSrealityImportGetActiveJob,
  nestAdminSrealityImportGetJob,
  nestAdminSrealityImportJobPreview,
  nestAdminSrealityImportListJobs,
  nestAdminSrealityImportPublish,
  nestAdminSrealityImportRetryJob,
  nestAdminSrealityBrowserTest,
  nestAdminSrealityTestFirstImage,
  type SrealityFirstImageTestResponse,
  type SrealityImportJobHistoryRow,
  type SrealityImportJobStatus,
  type SrealityImportPreviewResponse,
  type SrealityImportPublishPayload,
} from '@/lib/sreality-import-admin-api';

const inputClass =
  'w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 shadow-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100';

function brokerMatchLabel(status: SrealityImportPreviewResponse['brokerMatchStatus']): string {
  switch (status) {
    case 'EXISTING_PROFILE':
      return 'NALEZEN · EXISTUJÍCÍ PROFIL';
    case 'NEW_IMPORTED_CONTACT':
      return 'NALEZEN · NOVÝ IMPORTOVANÝ KONTAKT';
    default:
      return 'KONTAKT NENALEZEN';
  }
}

const ACTIVE_JOB_STATUSES = new Set(['QUEUED', 'PROCESSING', 'LONG_RUNNING']);
const TERMINAL_JOB_STATUSES = new Set(['DONE', 'PARTIAL', 'FAILED', 'CANCELLED']);

function isActiveJob(job: SrealityImportJobStatus | null): boolean {
  return Boolean(job && ACTIVE_JOB_STATUSES.has(job.status));
}

function formatHistoryDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function diagLabel(value: string | undefined): string {
  if (!value) return '—';
  if (value === 'PASS') return 'PASS';
  if (value === 'FAIL') return 'FAIL';
  if (value === 'NOT_REQUIRED') return 'NOT REQUIRED';
  if (value === 'NOT_PUBLIC') return 'NOT PUBLIC';
  if (value === 'PARTIAL') return 'PARTIAL';
  if (value === 'NOT_REACHED') return 'NOT REACHED';
  return value;
}

export default function AdminSrealityImportPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [sourceUrl, setSourceUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<SrealityImportPreviewResponse | null>(null);
  const [activeJob, setActiveJob] = useState<SrealityImportJobStatus | null>(null);
  const [importHistory, setImportHistory] = useState<SrealityImportJobHistoryRow[]>([]);
  const [jobCancelling, setJobCancelling] = useState(false);
  const previewLoadedForJobRef = useRef<string | null>(null);

  const [form, setForm] = useState<Partial<SrealityImportPublishPayload>>({});
  const [autoReel, setAutoReel] = useState(true);
  const [pubFb, setPubFb] = useState(true);
  const [pubIg, setPubIg] = useState(true);
  const [pubYt, setPubYt] = useState(true);
  const [pubShorts, setPubShorts] = useState(true);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [browserTest, setBrowserTest] = useState<{ status: string; reason?: string } | null>(null);
  const [browserTesting, setBrowserTesting] = useState(false);
  const [firstImageTest, setFirstImageTest] = useState<SrealityFirstImageTestResponse | null>(null);
  const [firstImageTesting, setFirstImageTesting] = useState(false);

  const applyPreviewToForm = useCallback((p: SrealityImportPreviewResponse) => {
    const pre = p.prefill as Record<string, unknown>;
    const broker = p.broker;
    const contactName =
      broker.agentName && broker.companyName
        ? `${broker.agentName} · ${broker.companyName}`
        : broker.agentName || broker.companyName || '';
    setForm({
      title: String(p.aiText.rewrittenTitle ?? pre.title ?? ''),
      description: String(p.aiText.rewrittenDescription ?? pre.description ?? ''),
      offerType: String(pre.offerType ?? 'prodej'),
      propertyType: String(pre.propertyType ?? 'byt'),
      subType: String(pre.subType ?? ''),
      price: typeof pre.price === 'number' ? pre.price : null,
      currency: String(pre.currency ?? 'CZK'),
      city: String(pre.city ?? ''),
      district: String(pre.district ?? ''),
      region: String(pre.region ?? ''),
      address: String(pre.address ?? ''),
      area: typeof pre.area === 'number' ? pre.area : null,
      landArea: typeof pre.landArea === 'number' ? pre.landArea : null,
      floor: typeof pre.floor === 'number' ? pre.floor : null,
      totalFloors: typeof pre.totalFloors === 'number' ? pre.totalFloors : null,
      condition: String(pre.condition ?? ''),
      construction: String(pre.construction ?? ''),
      ownership: String(pre.ownership ?? ''),
      energyLabel: String(pre.energyClass ?? pre.energyLabel ?? ''),
      equipment: String(pre.equipment ?? ''),
      contactName,
      contactPhone: broker.phone ?? '',
      contactEmail: broker.email ?? '',
      images: p.images
        .filter((img) => img.storedUrl)
        .map((img, i) => ({
          storedUrl: img.storedUrl!,
          watermarkedUrl: img.watermarkedUrl,
          sortOrder: i,
          isMain: img.isMain,
        })),
    });
  }, []);

  const refreshHistory = useCallback(async () => {
    if (!token) return;
    try {
      const rows = await nestAdminSrealityImportListJobs(token);
      setImportHistory(rows);
    } catch {
      /* history is optional UI */
    }
  }, [token]);

  const loadPreviewForJob = useCallback(
    async (jobId: string) => {
      if (!token) return;
      try {
        const { preview: p } = await nestAdminSrealityImportJobPreview(token, jobId);
        if (p) {
          setPreview(p);
          applyPreviewToForm(p);
          previewLoadedForJobRef.current = jobId;
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Náhled se nepodařilo načíst.');
      }
    },
    [applyPreviewToForm, token],
  );

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const [active, history] = await Promise.all([
          nestAdminSrealityImportGetActiveJob(token),
          nestAdminSrealityImportListJobs(token),
        ]);
        setImportHistory(history);
        if (active) {
          setActiveJob(active);
          setSourceUrl(active.sourceUrl);
        }
      } catch {
        /* recovery is best-effort */
      }
    })();
  }, [token]);

  useEffect(() => {
    if (!token || !activeJob || !isActiveJob(activeJob)) return;

    const poll = async () => {
      try {
        const job = await nestAdminSrealityImportGetJob(token, activeJob.id);
        setActiveJob(job);
        if (TERMINAL_JOB_STATUSES.has(job.status)) {
          void refreshHistory();
          if ((job.status === 'DONE' || job.status === 'PARTIAL') && previewLoadedForJobRef.current !== job.id) {
            void loadPreviewForJob(job.id);
          }
        }
      } catch {
        /* polling continues on next tick */
      }
    };

    void poll();
    const interval = window.setInterval(() => void poll(), 2500);
    return () => window.clearInterval(interval);
  }, [activeJob?.id, activeJob?.status, loadPreviewForJob, refreshHistory, token]);

  async function handleLoad() {
    if (!token) return;
    setError(null);
    setPreview(null);
    previewLoadedForJobRef.current = null;
    setLoading(true);
    try {
      const created = await nestAdminSrealityImportCreateJob(token, sourceUrl.trim());
      const job = await nestAdminSrealityImportGetJob(token, created.jobId);
      setActiveJob(job);
      void refreshHistory();
    } catch (e) {
      setActiveJob(null);
      setError(e instanceof Error ? e.message : 'Import selhal.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelJob() {
    if (!token || !activeJob) return;
    setJobCancelling(true);
    try {
      const job = await nestAdminSrealityImportCancelJob(token, activeJob.id);
      setActiveJob(job);
      void refreshHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Zrušení importu selhalo.');
    } finally {
      setJobCancelling(false);
    }
  }

  async function handleRetryJob(fromStage?: string) {
    if (!token || !activeJob) return;
    setError(null);
    previewLoadedForJobRef.current = null;
    setPreview(null);
    try {
      const job = await nestAdminSrealityImportRetryJob(token, activeJob.id, fromStage);
      setActiveJob(job);
      void refreshHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Opakování importu selhalo.');
    }
  }

  async function handleDeleteJob(jobId: string) {
    if (!token) return;
    try {
      await nestAdminSrealityImportDeleteJob(token, jobId);
      if (activeJob?.id === jobId) setActiveJob(null);
      void refreshHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Smazání importu selhalo.');
    }
  }

  async function handleOpenHistoryJob(row: SrealityImportJobHistoryRow) {
    if (!token) return;
    setError(null);
    try {
      const job = await nestAdminSrealityImportGetJob(token, row.id);
      setActiveJob(job);
      setSourceUrl(row.sourceUrl);
      if (row.status === 'DONE' || row.status === 'PARTIAL') {
        await loadPreviewForJob(row.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import se nepodařilo otevřít.');
    }
  }

  const importRunning = isActiveJob(activeJob);

  async function handlePublish(withReel: boolean) {
    if (!token || !preview) return;
    setPublishing(true);
    setError(null);
    try {
      const payload: SrealityImportPublishPayload = {
        title: form.title ?? '',
        description: form.description ?? '',
        offerType: form.offerType ?? 'prodej',
        propertyType: form.propertyType ?? 'byt',
        subType: form.subType,
        price: form.price,
        currency: form.currency,
        city: form.city ?? '',
        district: form.district,
        region: form.region,
        address: form.address,
        area: form.area,
        landArea: form.landArea,
        floor: form.floor,
        totalFloors: form.totalFloors,
        condition: form.condition,
        construction: form.construction,
        ownership: form.ownership,
        energyLabel: form.energyLabel,
        equipment: form.equipment,
        contactName: form.contactName ?? '',
        contactPhone: form.contactPhone ?? '',
        contactEmail: form.contactEmail ?? '',
        images: form.images ?? [],
        settings: {
          createAiReel: withReel,
          publishFacebook: pubFb,
          publishInstagram: pubIg,
          publishYoutube: pubYt,
          publishShorts: pubShorts,
        },
      };
      const result = await nestAdminSrealityImportPublish(token, preview.draftId, payload);
      router.push(`/admin/inzeraty?highlight=${encodeURIComponent(result.propertyId)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publikování selhalo.');
    } finally {
      setPublishing(false);
    }
  }

  if (isLoading) return null;
  if (!user || user.role !== 'ADMIN') {
    return (
      <AdminSubPage title="Import ze Sreality" description="Přístup pouze pro administrátory.">
        <p className="text-sm text-zinc-600">Nejste přihlášeni jako admin.</p>
      </AdminSubPage>
    );
  }

  return (
    <AdminSubPage
      title="Import ze Sreality"
      description="Načtěte veřejný inzerát, zkontrolujte náhled a publikujte na XXREALIT včetně volitelného AI Reelu."
    >
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Importovat inzerát ze Sreality</h2>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="srealityAdminUrl">
              URL inzerátu
            </label>
            <input
              id="srealityAdminUrl"
              type="url"
              className={inputClass}
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://www.sreality.cz/detail/..."
            />
          </div>
          <button
            type="button"
            disabled={loading || importRunning || !sourceUrl.trim()}
            onClick={() => void handleLoad()}
            className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
          >
            {loading ? 'Spouštím import…' : importRunning ? 'Import probíhá' : 'Načíst inzerát'}
          </button>
          <button
            type="button"
            disabled={browserTesting || !token}
            onClick={() => {
              if (!token) return;
              setBrowserTesting(true);
              void nestAdminSrealityBrowserTest(token)
                .then(setBrowserTest)
                .catch((e) =>
                  setBrowserTest({
                    status: 'FAIL',
                    reason: e instanceof Error ? e.message : 'Test selhal',
                  }),
                )
                .finally(() => setBrowserTesting(false));
            }}
            className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
          >
            {browserTesting ? 'Testuji browser…' : 'Otestovat browser'}
          </button>
          <button
            type="button"
            disabled={firstImageTesting || !token || !sourceUrl.trim()}
            onClick={() => {
              if (!token || !sourceUrl.trim()) return;
              setFirstImageTest(null);
              setFirstImageTesting(true);
              const firstImageUrl = preview?.images?.[0]?.sourceUrl;
              void nestAdminSrealityTestFirstImage(token, sourceUrl.trim(), firstImageUrl)
                .then(setFirstImageTest)
                .catch((e) =>
                  setFirstImageTest({
                    ok: false,
                    galleryOpen: false,
                    imageVisible: false,
                    naturalSize: null,
                    captureMethod: null,
                    dimensions: null,
                    bytes: null,
                    contentHash: null,
                    storedUrl: null,
                    previewUrl: null,
                    attempt: null,
                    errorMessage: e instanceof Error ? e.message : 'Test selhal',
                  }),
                )
                .finally(() => setFirstImageTesting(false));
            }}
            className="rounded-xl border border-orange-300 bg-orange-50 px-4 py-2.5 text-sm font-semibold text-orange-900 hover:bg-orange-100 disabled:opacity-60"
          >
            {firstImageTesting ? 'Testuji první fotografii…' : 'Otestovat první fotografii'}
          </button>
        </div>
        {browserTest ? (
          <p className="mt-3 text-sm text-zinc-700">
            Browser:{' '}
            <span className={browserTest.status === 'READY' ? 'text-emerald-700' : 'text-red-700'}>
              {browserTest.status}
            </span>
            {browserTest.reason ? ` — ${browserTest.reason}` : null}
          </p>
        ) : null}
        {firstImageTest ? (
          <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-800">
            <p className="font-semibold text-zinc-900">
              Test první fotografie:{' '}
              <span className={firstImageTest.ok ? 'text-emerald-700' : 'text-red-700'}>
                {firstImageTest.ok ? 'PASS' : 'FAIL'}
              </span>
            </p>
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              <p>Gallery: {firstImageTest.galleryOpen ? 'PASS' : 'FAIL'}</p>
              <p>Image visible: {firstImageTest.imageVisible ? 'PASS' : 'FAIL'}</p>
              <p>Method: {firstImageTest.captureMethod ?? '—'}</p>
              <p>Dimensions: {firstImageTest.dimensions ?? firstImageTest.naturalSize ?? '—'}</p>
              <p>Storage: {firstImageTest.storedUrl ? 'PASS' : 'FAIL'}</p>
              <p>Bytes: {firstImageTest.bytes ?? '—'}</p>
            </div>
            {firstImageTest.errorMessage ? (
              <p className="mt-2 text-red-700">{firstImageTest.errorMessage}</p>
            ) : null}
            {firstImageTest.previewUrl ? (
              <div className="mt-3">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Preview</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={firstImageTest.previewUrl}
                  alt="Test první fotografie"
                  className="max-h-48 rounded-lg border border-zinc-200 object-contain"
                />
              </div>
            ) : null}
          </div>
        ) : null}
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </section>

      {activeJob ? (
        <div className="mt-6">
          <SrealityImportProgressPanel
            job={activeJob}
            cancelling={jobCancelling}
            onCancel={importRunning ? () => void handleCancelJob() : undefined}
            onRetry={
              activeJob.status === 'FAILED' || activeJob.status === 'PARTIAL'
                ? () =>
                    void handleRetryJob(
                      activeJob.status === 'PARTIAL' || activeJob.stage === 'CAPTURING_IMAGES'
                        ? 'CAPTURING_IMAGES'
                        : undefined,
                    )
                : undefined
            }
            onDelete={
              activeJob.status === 'FAILED' || activeJob.status === 'CANCELLED'
                ? () => void handleDeleteJob(activeJob.id)
                : undefined
            }
          />
        </div>
      ) : null}

      {activeJob && (activeJob.status === 'DONE' || activeJob.status === 'PARTIAL') ? (
        <section className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="font-semibold text-emerald-900">
            {activeJob.status === 'PARTIAL' ? 'Import dokončen s upozorněním' : 'Import dokončen'}
          </p>
          <ul className="mt-2 space-y-1 text-sm text-emerald-900">
            <li>✓ Základní údaje</li>
            <li>{activeJob.agentStatus === 'FOUND' ? '✓' : '○'} Makléř</li>
            <li>
              {activeJob.phoneStatus === 'FOUND' ? '✓' : activeJob.phoneStatus === 'NOT_PUBLIC' ? '○' : '○'} Telefon
            </li>
            <li>
              {activeJob.emailStatus === 'FOUND' ? '✓' : activeJob.emailStatus === 'NOT_PUBLIC' ? '○' : '○'} Email
            </li>
            <li>
              {activeJob.status === 'PARTIAL' ? '⚠' : '✓'}{' '}
              {activeJob.imagesImported}/{activeJob.imagesSelected || activeJob.imagesFound} fotografií
            </li>
          </ul>
        </section>
      ) : null}

      {importHistory.length > 0 ? (
        <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Poslední importy</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-2 py-2">Datum</th>
                  <th className="px-2 py-2">Zdroj</th>
                  <th className="px-2 py-2">Stav</th>
                  <th className="px-2 py-2">Fotografie</th>
                  <th className="px-2 py-2">Makléř</th>
                  <th className="px-2 py-2">Doba</th>
                  <th className="px-2 py-2">Akce</th>
                </tr>
              </thead>
              <tbody>
                {importHistory.map((row) => (
                  <tr key={row.id} className="border-b border-zinc-100">
                    <td className="px-2 py-2 whitespace-nowrap">
                      {new Date(row.createdAt).toLocaleString('cs-CZ', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-2 py-2">Sreality</td>
                    <td className="px-2 py-2">
                      <span
                        className={
                          row.status === 'DONE'
                            ? 'text-emerald-700'
                            : row.status === 'PARTIAL'
                              ? 'text-amber-700'
                              : row.status === 'FAILED' || row.status === 'CANCELLED'
                                ? 'text-red-700'
                                : 'text-orange-700'
                        }
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      {row.imagesImported}/{row.imagesSelected || '—'}
                    </td>
                    <td className="px-2 py-2">{row.agentStatus ?? '—'}</td>
                    <td className="px-2 py-2">{formatHistoryDuration(row.elapsedMs)}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-2">
                        {row.status === 'DONE' || row.status === 'PARTIAL' ? (
                          <button
                            type="button"
                            className="text-orange-700 hover:underline"
                            onClick={() => void handleOpenHistoryJob(row)}
                          >
                            Otevřít
                          </button>
                        ) : null}
                        {row.status === 'FAILED' ? (
                          <>
                            <button
                              type="button"
                              className="text-orange-700 hover:underline"
                              onClick={() => void handleOpenHistoryJob(row)}
                            >
                              Detail
                            </button>
                            <button
                              type="button"
                              className="text-orange-700 hover:underline"
                              onClick={async () => {
                                if (!token) return;
                                const job = await nestAdminSrealityImportRetryJob(token, row.id);
                                setActiveJob(job);
                                setSourceUrl(row.sourceUrl);
                                void refreshHistory();
                              }}
                            >
                              Zkusit znovu
                            </button>
                            <button
                              type="button"
                              className="text-red-700 hover:underline"
                              onClick={() => void handleDeleteJob(row.id)}
                            >
                              Odstranit
                            </button>
                          </>
                        ) : null}
                        {row.status === 'CANCELLED' ? (
                          <button
                            type="button"
                            className="text-red-700 hover:underline"
                            onClick={() => void handleDeleteJob(row.id)}
                          >
                            Odstranit
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {preview?.duplicate.isDuplicate ? (
        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="font-semibold text-amber-900">Tento inzerát už byl importován.</p>
          {preview.duplicate.propertyId ? (
            <Link
              href={`/admin/inzeraty?highlight=${encodeURIComponent(preview.duplicate.propertyId)}`}
              className="mt-2 inline-block text-sm font-semibold text-orange-700 hover:underline"
            >
              Otevřít inzerát
            </Link>
          ) : null}
        </section>
      ) : null}

      {preview && !preview.duplicate.isDuplicate ? (
        <div className="mt-6 space-y-6">
          <section className="rounded-2xl border border-zinc-200 bg-white p-6">
            <p className="text-sm text-zinc-600">{preview.imageImportStats.message}</p>
            <p className="mt-1 text-xs text-zinc-500">Zdroj: {preview.sourceUrl}</p>
            {preview.diagnostics ? (
              <div className="mt-4">
                <button
                  type="button"
                  className="text-sm font-semibold text-orange-700 hover:underline"
                  onClick={() => setShowDiagnostics((v) => !v)}
                >
                  {showDiagnostics ? 'Skrýt' : 'Zobrazit'} detail importu
                </button>
                {showDiagnostics ? (
                  <>
                  <dl className="mt-3 grid gap-2 text-xs text-zinc-700 sm:grid-cols-2">
                    <div><dt className="font-semibold">Source parser</dt><dd>{diagLabel(preview.diagnostics.sourceParser)}</dd></div>
                    <div><dt className="font-semibold">Page data</dt><dd>{diagLabel(preview.diagnostics.pageData ?? 'STATIC_OK')}</dd></div>
                    <div><dt className="font-semibold">Image acquisition</dt><dd>{preview.diagnostics.imageAcquisition ?? 'DIRECT_HTTP'}</dd></div>
                    <div><dt className="font-semibold">Dynamic page</dt><dd>{diagLabel(preview.diagnostics.dynamicPage)}</dd></div>
                    <div><dt className="font-semibold">Gallery</dt><dd>{diagLabel(preview.diagnostics.gallery)} · {preview.diagnostics.galleryCount} FOUND{preview.diagnostics.imagesSelectedCount ? ` · ${preview.diagnostics.imagesSelectedCount} SELECTED` : ''}</dd></div>
                    <div><dt className="font-semibold">Images</dt><dd>{diagLabel(preview.diagnostics.imagesDownloaded)} · {preview.diagnostics.imagesDownloadedCount} CAPTURED · {preview.diagnostics.imagesFailedCount} failed</dd></div>
                    {preview.imageImportStats.directHttpSuccess != null ? (
                      <div className="sm:col-span-2">
                        <dt className="font-semibold">Capture methods</dt>
                        <dd>
                          direct HTTP {preview.imageImportStats.directHttpSuccess ?? 0}
                          {' · '}
                          browser response {preview.imageImportStats.browserResponseSuccess ?? 0}
                          {' · '}
                          browser context {preview.imageImportStats.browserContextSuccess ?? 0}
                          {' · '}
                          DOM blob {preview.imageImportStats.domBlobSuccess ?? 0}
                          {' · '}
                          element capture {preview.imageImportStats.elementCaptureSuccess ?? 0}
                        </dd>
                      </div>
                    ) : null}
                    <div><dt className="font-semibold">Agent</dt><dd>{diagLabel(preview.diagnostics.agent)}</dd></div>
                    <div><dt className="font-semibold">Phone</dt><dd>{diagLabel(preview.diagnostics.phone)}</dd></div>
                    <div><dt className="font-semibold">Email</dt><dd>{diagLabel(preview.diagnostics.email)}</dd></div>
                    <div><dt className="font-semibold">Contact click</dt><dd>{diagLabel(preview.diagnostics.contactClick)}</dd></div>
                    <div><dt className="font-semibold">Storage</dt><dd>{diagLabel(preview.diagnostics.storage)} · {preview.diagnostics.storageCount} UPLOADED</dd></div>
                    <div><dt className="font-semibold">Browser fallback</dt><dd>{diagLabel(preview.diagnostics.browserFallback)}</dd></div>
                    <div><dt className="font-semibold">Dynamic enrichment</dt><dd>{diagLabel(preview.diagnostics.dynamicEnrichment ?? preview.diagnostics.dynamicPage)}</dd></div>
                    <div><dt className="font-semibold">Browser runtime</dt><dd>{preview.diagnostics.browser ?? 'NOT TESTED'}{preview.diagnostics.browserError ? ` — ${preview.diagnostics.browserError}` : ''}</dd></div>
                  </dl>
                  {preview.diagnostics.imageDownloadFailures?.length ? (
                    <div className="mt-4 space-y-3 text-xs text-zinc-700">
                      {preview.diagnostics.imageDownloadFailures.map((f) => (
                        <div
                          key={f.index}
                          className={`rounded border p-2 ${
                            f.storage === 'UPLOADED'
                              ? 'border-green-100 bg-green-50'
                              : f.storage === 'PENDING'
                                ? 'border-amber-100 bg-amber-50'
                                : 'border-red-100 bg-red-50'
                          }`}
                        >
                          <p className="font-semibold">IMAGE #{f.index}</p>
                          {f.sourceUrl ? <p className="truncate">source: {f.sourceUrl}</p> : null}
                          {f.selectedUrl ? <p className="truncate">selected URL: {f.selectedUrl}</p> : null}
                          {f.captureMethod ? <p>method: {f.captureMethod}</p> : null}
                          {f.directHttpStatus != null ? <p>direct HTTP: {f.directHttpStatus}</p> : null}
                          {f.browserResponse ? <p>browser response: {f.browserResponse}</p> : null}
                          {f.browserContext ? <p>browser context: {f.browserContext}</p> : null}
                          {f.domBlob ? <p>DOM blob: {f.domBlob}</p> : null}
                          {f.elementCapture ? <p>element capture: {f.elementCapture}</p> : null}
                          <p>HTTP: {f.httpStatus ?? '—'}</p>
                          {f.mime ? <p>mime: {f.mime}</p> : null}
                          {f.bytes != null ? <p>bytes: {f.bytes}</p> : null}
                          {f.dimensions ? <p>dimensions: {f.dimensions}</p> : null}
                          {f.storage ? <p>storage: {f.storage}</p> : null}
                          <p>host: {f.host}</p>
                          {f.hostValidation ? <p>host validation: {f.hostValidation}</p> : null}
                          <p>content-type: {f.contentType ?? '—'}</p>
                          {f.error ? <p>error: {f.error}</p> : null}
                          <p className="truncate">url: {f.urlSample}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  </>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6">
              <h3 className="font-semibold text-zinc-900">Základní údaje</h3>
              <div className="mt-3 space-y-3">
                <input className={inputClass} value={form.title ?? ''} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
                <div className="grid grid-cols-2 gap-2">
                  <input className={inputClass} placeholder="Typ nabídky" value={form.offerType ?? ''} onChange={(e) => setForm((f) => ({ ...f, offerType: e.target.value }))} />
                  <input className={inputClass} placeholder="Typ nemovitosti" value={form.propertyType ?? ''} onChange={(e) => setForm((f) => ({ ...f, propertyType: e.target.value }))} />
                </div>
                <input className={inputClass} placeholder="Město" value={form.city ?? ''} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
                <input className={inputClass} placeholder="Cena" type="number" value={form.price ?? ''} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value ? Number(e.target.value) : null }))} />
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-6">
              <h3 className="font-semibold text-zinc-900">Prodejce</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Stav párování: {brokerMatchLabel(preview.brokerMatchStatus)}
              </p>
              {preview.broker.agentName ? (
                <p className="mt-2 text-sm text-zinc-800">
                  Makléř: {preview.broker.agentName}
                  {preview.broker.companyName ? ` · ${preview.broker.companyName}` : ''}
                </p>
              ) : null}
              {preview.brokerMatchStatus === 'NOT_FOUND' &&
              !preview.broker.agentName &&
              !preview.broker.companyName ? (
                <p className="mt-2 text-sm text-amber-700">
                  Kontakt makléře nebyl automaticky nalezen. Doplňte jej ručně.
                </p>
              ) : null}
              {preview.brokerMatchStatus !== 'NOT_FOUND' &&
              !preview.broker.phone &&
              !preview.broker.email ? (
                <p className="mt-2 text-sm text-zinc-600">
                  Telefon/e-mail nebyly veřejně dostupné — doplňte je ručně, pokud je znáte.
                </p>
              ) : null}
              <div className="mt-3 space-y-3">
                <input className={inputClass} placeholder="Makléř / RK" value={form.contactName ?? ''} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} />
                <input className={inputClass} placeholder="Telefon" value={form.contactPhone ?? ''} onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))} />
                <input className={inputClass} placeholder="E-mail" value={form.contactEmail ?? ''} onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))} />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-6">
            <h3 className="font-semibold text-zinc-900">Popis (AI úprava)</h3>
            <textarea
              className={`${inputClass} mt-3 min-h-[160px]`}
              value={form.description ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
            {preview.aiText.skipped ? (
              <p className="mt-2 text-xs text-zinc-500">{preview.aiText.reason}</p>
            ) : null}
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-6">
            <h3 className="font-semibold text-zinc-900">Fotografie</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {(form.images ?? []).map((img, idx) => (
                <div key={`${img.storedUrl}-${idx}`} className="relative overflow-hidden rounded-lg border border-zinc-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.storedUrl} alt="" className="aspect-[4/3] w-full object-cover" />
                  {img.isMain ? (
                    <span className="absolute left-1 top-1 rounded bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      Hlavní
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-6">
            <h3 className="font-semibold text-zinc-900">AI marketing</h3>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={autoReel} onChange={(e) => setAutoReel(e.target.checked)} />
                Automaticky vytvořit AI Reel
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={pubFb} onChange={(e) => setPubFb(e.target.checked)} />
                Facebook
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={pubIg} onChange={(e) => setPubIg(e.target.checked)} />
                Instagram
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={pubYt} onChange={(e) => setPubYt(e.target.checked)} />
                YouTube Shorts
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={pubShorts} onChange={(e) => setPubShorts(e.target.checked)} />
                XXREALIT Shorts
              </label>
            </div>
          </section>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-xl border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold"
              onClick={() => {
                setPreview(null);
                setSourceUrl('');
              }}
            >
              Zrušit
            </button>
            <button
              type="button"
              disabled={publishing}
              className="rounded-xl bg-zinc-800 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              onClick={() => void handlePublish(false)}
            >
              Publikovat
            </button>
            <button
              type="button"
              disabled={publishing}
              className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              onClick={() => void handlePublish(autoReel)}
            >
              Publikovat + vytvořit AI Reel
            </button>
          </div>
        </div>
      ) : null}
    </AdminSubPage>
  );
}
