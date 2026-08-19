'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { SeoGenerationProgressPanel } from '@/components/admin/seo/SeoGenerationProgressPanel';
import { CompanySeoBulkRegenModal } from '@/components/admin/seo/CompanySeoBulkRegenModal';
import {
  nestAdminCompanySeoCancel,
  nestAdminCompanySeoGenerateBatch,
  nestAdminCompanySeoGenerateFilter,
  nestAdminCompanySeoGenerateTest,
  nestAdminCompanySeoJobItems,
  nestAdminCompanySeoPause,
  nestAdminCompanySeoProgress,
  nestAdminCompanySeoRecoverJob,
  nestAdminCompanySeoResume,
  nestAdminCompanySeoStats,
  type CompanySeoJobItemView,
  type CompanySeoJobProgressResponse,
  type CompanySeoJobView,
  type CompanySeoStats,
} from '@/lib/company-seo-admin-client';

type Props = {
  token: string | null;
};

export function SeoCompanyGeneratorPanel({ token }: Props) {
  const [stats, setStats] = useState<CompanySeoStats | null>(null);
  const [jobProgress, setJobProgress] = useState<CompanySeoJobProgressResponse | null>(null);
  const [jobItems, setJobItems] = useState<CompanySeoJobItemView[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [bulkOpen, setBulkOpen] = useState(false);

  const activeJob = jobProgress?.job ?? null;
  const isActive = Boolean(
    activeJob && ['PENDING', 'RUNNING', 'PAUSED'].includes(activeJob.status),
  );

  const refresh = useCallback(async () => {
    if (!token) return;
    const [s, p] = await Promise.all([
      nestAdminCompanySeoStats(token),
      nestAdminCompanySeoProgress(token),
    ]);
    setStats(s);
    setJobProgress(p);
    if (p?.job?.jobId) {
      const items = await nestAdminCompanySeoJobItems(token, p.job.jobId);
      setJobItems(items ?? []);
    } else {
      setJobItems([]);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!token || !isActive) return;
    const id = setInterval(() => void refresh(), 3000);
    return () => clearInterval(id);
  }, [token, isActive, refresh]);

  async function run(label: string, fn: () => Promise<CompanySeoJobView | null | undefined>) {
    if (!token) {
      setError('Chybí přihlášení.');
      return;
    }
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fn();
      if (!res) throw new Error('Akce se nezdařila.');
      setMsg(res.existing ? 'Používá se existující běžící úloha.' : label);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setBusy(false);
    }
  }

  async function jobAction(action: 'pause' | 'resume' | 'cancel') {
    if (!token) return;
    setBusy(true);
    try {
      if (action === 'pause') await nestAdminCompanySeoPause(token);
      if (action === 'resume') await nestAdminCompanySeoResume(token);
      if (action === 'cancel') await nestAdminCompanySeoCancel(token);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-orange-200 bg-orange-50/40 p-5">
      <h2 className="text-lg font-semibold text-zinc-900">SEO registr firem</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Generování unikátních SEO stránek z firemních záznamů XXREALIT. Žádná nová Company se nevytváří —
        pouze propojení přes <code className="text-xs">companyId</code>.
      </p>

      {stats ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="SEO stránek" value={stats.totalPages} />
          <Stat label="Indexovatelných" value={stats.indexable} />
          <Stat label="Bez stránky" value={stats.withoutPage} />
          <Stat label="Průměrné skóre" value={stats.averageScore} />
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Btn disabled={busy} onClick={() => setBulkOpen(true)}>
          🔄 Přegenerovat SEO databázi firem
        </Btn>
        <Btn
          disabled={busy}
          onClick={() =>
            void run('Testovací firemní stránka spuštěna.', () => nestAdminCompanySeoGenerateTest(token!))
          }
        >
          Vygenerovat testovací firemní stránku
        </Btn>
        <Btn
          disabled={busy}
          onClick={() =>
            void run('Batch 10 spuštěn.', () =>
              nestAdminCompanySeoGenerateBatch(token!, 10, { onlyMissing }, false),
            )
          }
        >
          Vygenerovat 10 firemních stránek
        </Btn>
        <Btn
          disabled={busy}
          onClick={() =>
            void run('Batch 100 spuštěn.', () =>
              nestAdminCompanySeoGenerateBatch(token!, 100, { onlyMissing }, false),
            )
          }
        >
          Vygenerovat 100 firemních stránek
        </Btn>
        <Btn
          disabled={busy}
          onClick={() =>
            void run('Generování pro filtr spuštěno.', () =>
              nestAdminCompanySeoGenerateFilter(token!, { onlyMissing }, false),
            )
          }
        >
          Generovat pro aktuální filtr
        </Btn>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-zinc-700">
        <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
        Pouze firmy bez existující SEO stránky
      </label>

      {activeJob ? (
        <div className="mt-4">
          <SeoGenerationProgressPanel
            title="SEO firmy"
            job={{
              id: activeJob.jobId,
              status: activeJob.status,
              requestedCount: activeJob.requestedCount,
              processedCount: activeJob.processedCount,
              createdCount: activeJob.createdCount,
              updatedCount: activeJob.updatedCount,
              skippedCount: activeJob.skippedCount,
              unchangedCount: activeJob.unchangedCount,
              failedCount: activeJob.failedCount,
              progressPct: activeJob.progressPct,
              currentItem: activeJob.currentItem,
              startedAt: activeJob.startedAt,
              lastActivityAt: activeJob.lastActivityAt,
              lastError: activeJob.lastError,
              type: activeJob.type,
            }}
            items={jobItems.map((item) => ({
              id: item.id,
              status: item.status,
              companyName: item.companyName,
              localityName: item.localityName,
              qualityScore: item.qualityScore,
              errorCode: item.errorCode,
              phase: item.phase,
              attempt: item.attempt,
              seoPageId: item.seoPageId,
            }))}
            worker={jobProgress?.worker}
            staleWarning={jobProgress?.staleWarning}
            busy={busy}
            onPause={() => void jobAction('pause')}
            onResume={() => void jobAction('resume')}
            onCancel={() => void jobAction('cancel')}
            onRecover={() => {
              if (!token || !activeJob.jobId) return;
              setBusy(true);
              void nestAdminCompanySeoRecoverJob(token, activeJob.jobId)
                .then(() => refresh())
                .finally(() => setBusy(false));
            }}
            itemLabel={(item) =>
              item.companyName
                ? `${item.companyName}${item.localityName ? ` — ${item.localityName}` : ''}`
                : '—'
            }
            previewHref={(item) =>
              item.seoPageId ? `/admin/seo/firmy/${item.seoPageId}/preview` : null
            }
          />
        </div>
      ) : null}

      {jobProgress?.recentJobs && jobProgress.recentJobs.length > 1 ? (
        <details className="mt-4 rounded-lg border border-orange-100 bg-white p-3 text-sm">
          <summary className="cursor-pointer font-medium text-orange-900">
            Historie firemních úloh ({jobProgress.recentJobs.length})
          </summary>
          <ul className="mt-2 space-y-2 text-xs">
            {jobProgress.recentJobs.map((j) => (
              <li key={j.jobId} className="flex flex-wrap justify-between gap-2 border-b border-zinc-100 pb-2">
                <span>
                  {j.startedAt ? new Date(j.startedAt).toLocaleString('cs-CZ') : '—'} · {j.type} · {j.status}
                </span>
                <span>
                  {j.processedCount}/{j.requestedCount} · vytvořeno {j.createdCount} · chyby {j.failedCount}
                </span>
                <Link href="/admin/seo/firmy" className="text-orange-700 hover:underline">
                  Detail
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {msg ? <p className="mt-3 text-sm text-green-700">{msg}</p> : null}
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <CompanySeoBulkRegenModal
        token={token}
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onStarted={() => {
          setMsg('Hromadná regenerace SEO firem byla spuštěna.');
          void refresh();
        }}
      />

      <p className="mt-4 text-xs text-zinc-500">
        Správa tabulky a detailů:{' '}
        <Link href="/admin/seo/firmy" className="font-semibold text-orange-700 hover:underline">
          SEO firmy
        </Link>
      </p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-lg font-bold text-zinc-900">{value}</p>
    </div>
  );
}

function Btn({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg bg-orange-600 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
    >
      {children}
    </button>
  );
}
