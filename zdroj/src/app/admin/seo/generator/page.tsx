'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { SeoAiGeneratorPanel } from '@/components/admin/seo/SeoAiGeneratorPanel';
import {
  nestAdminSeoGenerateAll,
  nestAdminSeoGenerateBatch,
  nestAdminSeoGenerateTest,
  nestAdminSeoGenerationCancel,
  nestAdminSeoGenerationPause,
  nestAdminSeoGenerationProgress,
  nestAdminSeoGenerationResume,
  nestAdminSeoGenerationStats,
  nestAdminSeoJobSkipped,
  nestAdminSeoRegenerateDrafts,
  nestAdminSeoRegenerateErrors,
  nestAdminSeoRecalculateIndexability,
  nestAdminSeoSitemapStats,
  type SeoGenerationJobView,
  type SeoGenerationStats,
  type SeoGenerationTestResult,
  type SeoJobResultItem,
  type SeoSkippedItemDetail,
} from '@/lib/nest-client';

const SKIP_REASON_LABELS: Record<string, string> = {
  DUPLICATE_SLUG: 'Duplicitní slug',
  DUPLICATE_COMBINATION: 'Duplicitní kombinace',
  ALREADY_EXISTS: 'Již existuje',
  MISSING_LOCALITY: 'Chybí lokalita',
  MISSING_LOCALITY_CODE: 'Chybí kód lokality',
  MISSING_PROPERTY_TYPE: 'Chybí typ nemovitosti',
  INVALID_COMBINATION: 'Neplatná kombinace',
  LOW_QUALITY: 'Nízká kvalita',
  NO_LISTINGS: 'Bez inzerátů',
  NO_RUIAN_DATA: 'Chybí RÚIAN',
  NO_CSU_DATA: 'Chybí ČSÚ',
  NO_TEMPLATE: 'Chybí šablona',
  INVALID_SLUG: 'Neplatný slug',
  NOT_INDEXABLE: 'Není indexovatelná',
  FILTERED_BY_JOB: 'Filtrováno jobem',
  LOCKED_CONTENT: 'Zamčený obsah',
  DATABASE_CONFLICT: 'Konflikt DB',
  UNKNOWN: 'Neznámý',
};

export default function AdminSeoGeneratorPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<SeoGenerationStats | null>(null);
  const [progress, setProgress] = useState<SeoGenerationJobView | null>(null);
  const [active, setActive] = useState(false);
  const [testResult, setTestResult] = useState<SeoGenerationTestResult | null>(null);
  const [skippedDetails, setSkippedDetails] = useState<SeoSkippedItemDetail[]>([]);
  const [expandedReason, setExpandedReason] = useState<string | null>(null);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [testLocation, setTestLocation] = useState('pardubice');
  const [sitemapStats, setSitemapStats] = useState<{
    indexableInSitemap: number;
    excludedFromSitemap: number;
    lastGeneratedAt: string | null;
    sitemapUrls: string[];
  } | null>(null);
  const [recalcResult, setRecalcResult] = useState<{
    processed: number;
    changedToIndexable: number;
    keptNoindex: number;
    errors: number;
    byReason: Record<string, number>;
  } | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    const [s, p, sm] = await Promise.all([
      nestAdminSeoGenerationStats(token),
      nestAdminSeoGenerationProgress(token),
      nestAdminSeoSitemapStats(token),
    ]);
    setStats(s);
    setSitemapStats(sm);
    if (p) {
      setActive(p.active);
      setProgress(p.job);
      if (p.job && p.job.status === 'COMPLETED' && p.job.jobId) {
        const skipped = await nestAdminSeoJobSkipped(token, p.job.jobId);
        if (skipped?.items) setSkippedDetails(skipped.items);
      }
    }
  }, [token]);

  useEffect(() => {
    if (!isLoading && (!token || user?.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, token, user, router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!token || !active) return;
    const id = setInterval(() => void refresh(), 3000);
    return () => clearInterval(id);
  }, [token, active, refresh]);

  async function runAction(label: string, fn: () => Promise<unknown>) {
    if (!token) {
      setError('Chybí přihlášení — obnovte stránku.');
      return;
    }
    setBusy(true);
    setError(null);
    setMsg(null);
    setSkippedDetails([]);
    try {
      const res = (await fn()) as { success?: boolean; error?: string; jobId?: string } | null;
      if (res && res.success === false) {
        setError(res.error ?? `${label} selhalo.`);
      } else {
        setMsg(`${label} spuštěno.`);
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : `${label} selhalo`);
    } finally {
      setBusy(false);
    }
  }

  async function generateTest() {
    if (!token) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    setTestResult(null);
    try {
      const res = await nestAdminSeoGenerateTest(token, {
        offerType: 'PRODEJ',
        propertyType: 'BYT',
        locationSlug: testLocation.trim() || 'pardubice',
      });
      if (!res) {
        setError('API nevrátilo odpověď. Zkontrolujte přihlášení a backend.');
        return;
      }
      setTestResult(res);
      setMsg(`Testovací stránka: ${res.action} (${res.slug}).`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Testovací generování selhalo');
    } finally {
      setBusy(false);
    }
  }

  if (!token || user?.role !== 'ADMIN') return null;

  const job = progress;
  const pct = job?.progressPct ?? 0;
  const skipReasons = job?.skipReasons ?? {};
  const recentResults = job?.recentResults ?? [];

  return (
    <>
      <p className="mb-4 text-sm text-zinc-600">
        Generátor SEO stránek XXREALIT — šablonové generování bez AI i prémiové generování pomocí AI.{' '}
        <Link href="/admin/seo/stranky" className="text-orange-600 underline">
          Přehled SEO stránek →
        </Link>
      </p>

      <SeoAiGeneratorPanel token={token} onRefresh={() => void refresh()} />

      {stats ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Možné kombinace" value={stats.possibleCombinations} />
          <Stat label="Vytvořené záznamy" value={stats.createdRecords} />
          <Stat label="Publikované" value={stats.published} />
          <Stat label="Indexovatelné" value={stats.indexable} />
          <Stat label="DRAFT" value={stats.draft} />
          <Stat label="noindex" value={stats.noindex} />
          <Stat label="Chyby" value={stats.errors} warn={stats.errors > 0} />
        </div>
      ) : null}

      {stats && !stats.searchConsoleConnected ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {stats.searchConsoleNote}
        </p>
      ) : null}

      <section className="mb-6 space-y-3 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Šablonové generování bez AI</h2>
        <p className="text-sm text-zinc-600">
          Texty se skládají z lokálních šablon podle lokality, typu nabídky a dat RÚIAN/ČSÚ.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
            Pouze chybějící kombinace
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <input
              value={testLocation}
              onChange={(e) => setTestLocation(e.target.value)}
              placeholder="pardubice"
              className="rounded-lg border px-2 py-1.5 text-sm"
            />
            <ActionButton disabled={busy} onClick={() => void generateTest()}>
              Generovat testovací stránku
            </ActionButton>
          </div>
          <ActionButton
            disabled={busy}
            onClick={() =>
              void runAction('Generování 100 stránek', () =>
                nestAdminSeoGenerateBatch(token, { limit: 100, onlyMissing }),
              )
            }
          >
            Generovat 100 stránek
          </ActionButton>
          <ActionButton
            disabled={busy}
            onClick={() =>
              void runAction('Generování 1 000 stránek', () =>
                nestAdminSeoGenerateBatch(token, { limit: 1000, onlyMissing }),
              )
            }
          >
            Generovat 1 000 stránek
          </ActionButton>
          <ActionButton
            disabled={busy}
            onClick={() => void runAction('Generování všech vhodných stránek', () => nestAdminSeoGenerateAll(token))}
          >
            Generovat všechny vhodné stránky
          </ActionButton>
          <ActionButton
            disabled={busy}
            variant="secondary"
            onClick={() => void runAction('Přegenerování DRAFT', () => nestAdminSeoRegenerateDrafts(token))}
          >
            Přegenerovat DRAFT
          </ActionButton>
          <ActionButton
            disabled={busy}
            variant="secondary"
            onClick={() => void runAction('Přegenerování chyb', () => nestAdminSeoRegenerateErrors(token))}
          >
            Přegenerovat ERROR
          </ActionButton>
          <ActionButton
            disabled={busy}
            variant="secondary"
            onClick={() =>
              void runAction('Přehodnocení indexovatelnosti', async () => {
                const res = await nestAdminSeoRecalculateIndexability(token, {
                  scope: 'PUBLISHED_NOINDEX',
                });
                if (res) setRecalcResult(res);
                return res;
              })
            }
          >
            Přehodnotit indexovatelnost
          </ActionButton>
          <ActionButton
            disabled={busy}
            variant="secondary"
            onClick={() =>
              void runAction('Přehodnocení všech publikovaných', async () => {
                const res = await nestAdminSeoRecalculateIndexability(token, {
                  scope: 'ALL_PUBLISHED',
                });
                if (res) setRecalcResult(res);
                return res;
              })
            }
          >
            Přehodnotit vše publikované
          </ActionButton>
        </div>

        {sitemapStats ? (
          <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-sm">
            <p className="font-semibold">Sitemap</p>
            <p>V sitemap: {sitemapStats.indexableInSitemap} URL</p>
            <p>Vyřazeno: {sitemapStats.excludedFromSitemap} URL</p>
            <p>Poslední kontrola: {sitemapStats.lastGeneratedAt ?? '—'}</p>
            <ul className="mt-1 list-disc pl-5">
              {sitemapStats.sitemapUrls.map((url) => (
                <li key={url}>
                  <a href={url} target="_blank" rel="noreferrer" className="text-orange-600 underline">
                    {url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {recalcResult ? (
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
            <p className="font-semibold">Výsledek přehodnocení</p>
            <p>Zpracováno: {recalcResult.processed}</p>
            <p>Změněno na indexable: {recalcResult.changedToIndexable}</p>
            <p>Ponecháno noindex: {recalcResult.keptNoindex}</p>
            <p>Chyby: {recalcResult.errors}</p>
            {Object.keys(recalcResult.byReason).length > 0 ? (
              <ul className="mt-2 list-disc pl-5">
                {Object.entries(recalcResult.byReason).map(([reason, count]) => (
                  <li key={reason}>
                    {reason}: {count}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-3">
          <ActionButton
            disabled={busy || !active}
            variant="secondary"
            onClick={() => void runAction('Pozastavení', () => nestAdminSeoGenerationPause(token, job?.jobId))}
          >
            Pozastavit
          </ActionButton>
          <ActionButton
            disabled={busy}
            variant="secondary"
            onClick={() => void runAction('Pokračování', () => nestAdminSeoGenerationResume(token, job?.jobId))}
          >
            Pokračovat
          </ActionButton>
          <ActionButton
            disabled={busy || !job}
            variant="danger"
            onClick={() => void runAction('Zrušení úlohy', () => nestAdminSeoGenerationCancel(token, job?.jobId))}
          >
            Zrušit úlohu
          </ActionButton>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {msg ? <p className="text-sm text-green-700">{msg}</p> : null}
      </section>

      {job ? (
        <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {job.status === 'RUNNING' ? 'Generování probíhá' : `Stav: ${job.status}`}
            </h2>
            <span className="text-sm text-zinc-500">{pct} %</span>
          </div>
          <div className="mb-3 h-2 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full bg-orange-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-sm font-medium">
            Kandidátů: {job.totalItems.toLocaleString('cs-CZ')} — zpracováno{' '}
            {job.processedItems.toLocaleString('cs-CZ')}
          </p>
          <div className="mt-2 grid gap-1 text-sm text-zinc-600 sm:grid-cols-2 lg:grid-cols-4">
            <span>Vytvořeno: {job.createdItems}</span>
            <span>Aktualizováno: {job.updatedItems}</span>
            <span>Přeskočeno: {job.skippedItems}</span>
            <span>Chyby: {job.failedItems}</span>
          </div>
          {job.currentItem ? (
            <p className="mt-2 text-sm text-zinc-500">Aktuálně: {job.currentItem}</p>
          ) : null}
          {job.lastError ? <p className="mt-2 text-sm text-red-600">Poslední chyba: {job.lastError}</p> : null}

          {Object.keys(skipReasons).length > 0 ? (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold">Důvody přeskočení</h3>
              <ul className="space-y-1 text-sm">
                {Object.entries(skipReasons).map(([reason, count]) => (
                  <li key={reason}>
                    <button
                      type="button"
                      className="text-left text-orange-700 underline"
                      onClick={() => setExpandedReason(expandedReason === reason ? null : reason)}
                    >
                      {SKIP_REASON_LABELS[reason] ?? reason}: {count}
                    </button>
                    {expandedReason === reason ? (
                      <ul className="ml-4 mt-1 max-h-40 overflow-y-auto border-l border-zinc-200 pl-2 text-xs text-zinc-600">
                        {skippedDetails
                          .filter((d) => d.reason === reason)
                          .slice(-20)
                          .map((d, i) => (
                            <li key={`${d.at}-${i}`} className="mb-1">
                              {d.locationName ?? d.locationSlug} — {d.expectedSlug ?? d.intentSlug}
                              {d.existingPageId ? ` (ID: ${d.existingPageId})` : ''}
                            </li>
                          ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {recentResults.length > 0 ? (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold">Nově vytvořené / aktualizované stránky</h3>
              <ul className="space-y-2 text-sm">
                {recentResults.slice(-20).map((r) => (
                  <RecentResultRow key={`${r.pageId}-${r.at}`} item={r} />
                ))}
              </ul>
            </div>
          ) : null}

          {job.logs.length ? (
            <div className="mt-4 max-h-48 overflow-y-auto rounded-lg bg-zinc-50 p-3 font-mono text-xs">
              {job.logs.map((l, i) => (
                <div key={`${l.at}-${i}`} className={l.level === 'error' ? 'text-red-700' : 'text-zinc-700'}>
                  [{l.at}] {l.message}
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {testResult ? (
        <section className="rounded-2xl border border-green-200 bg-green-50 p-5">
          <h2 className="mb-2 text-lg font-semibold text-green-900">Výsledek testu</h2>
          <ul className="space-y-1 text-sm text-green-900">
            <li>Slug: {testResult.slug}</li>
            <li>
              Veřejná URL:{' '}
              <Link href={testResult.publicPath} className="underline" target="_blank">
                {testResult.publicPath}
              </Link>
            </li>
            <li>Stav: {testResult.status}</li>
            <li>Indexovatelná: {testResult.indexable ? 'ano' : 'ne (noindex)'}</li>
            <li>Důvod: {(testResult as { indexabilityReason?: string }).indexabilityReason ?? '—'}</li>
            <li>Quality score: {(testResult as { indexabilityScore?: number }).indexabilityScore ?? '—'}</li>
            <li>H1: {testResult.h1}</li>
            <li>Meta Title: {testResult.metaTitle}</li>
            <li>Canonical: {testResult.canonical}</li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={testResult.adminPreviewUrl}
              className="rounded-lg bg-green-700 px-3 py-1.5 text-sm text-white"
            >
              Admin náhled
            </Link>
            <Link
              href={testResult.publicPath}
              target="_blank"
              className="rounded-lg border border-green-700 px-3 py-1.5 text-sm text-green-900"
            >
              Veřejná URL
            </Link>
            <Link
              href={`/admin/seo/stranky/${testResult.pageId}`}
              className="rounded-lg border border-green-700 px-3 py-1.5 text-sm text-green-900"
            >
              Admin detail →
            </Link>
          </div>
        </section>
      ) : null}
    </>
  );
}

function RecentResultRow({ item }: { item: SeoJobResultItem }) {
  return (
    <li className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
      <p className="font-medium">{item.title ?? item.slug}</p>
      <p className="text-xs text-zinc-500">
        Stav: {item.status} / {item.indexable ? 'index' : 'noindex'} — {item.action}
      </p>
      <div className="mt-1 flex gap-2">
        <Link href={item.adminPreviewUrl} className="text-xs text-orange-600 underline">
          Náhled
        </Link>
        <Link href={item.publicUrl} target="_blank" className="text-xs text-orange-600 underline">
          Veřejná URL
        </Link>
      </div>
    </li>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3">
      <p className={`text-xl font-bold ${warn ? 'text-red-600' : 'text-zinc-900'}`}>{value}</p>
      <p className="text-xs text-zinc-600">{label}</p>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  variant = 'primary',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const cls =
    variant === 'primary'
      ? 'bg-orange-600 text-white'
      : variant === 'danger'
        ? 'border border-red-300 text-red-700'
        : 'border border-zinc-300 text-zinc-800';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50 ${cls}`}
    >
      {children}
    </button>
  );
}
