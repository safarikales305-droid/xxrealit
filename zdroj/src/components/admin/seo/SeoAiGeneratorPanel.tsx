'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminLoading } from '@/components/admin/loading/AdminLoadingProvider';
import {
  nestAdminSeoAiCancelJob,
  nestAdminSeoAiCreateJob,
  nestAdminSeoAiDiagnostics,
  nestAdminSeoAiEstimateJob,
  nestAdminSeoAiGenerateTest,
  nestAdminSeoAiGetActiveJob,
  nestAdminSeoAiGetJob,
  nestAdminSeoAiGetJobErrors,
  nestAdminSeoAiGetJobItems,
  nestAdminSeoAiPauseJob,
  nestAdminSeoAiResumeJob,
  nestAdminSeoAiRetryFailedJob,
  nestAdminSeoAiRetryJobItem,
  nestAdminSeoSearchLocalitiesMain,
  SeoAiApiError,
  type SeoAiDiagnostics,
  type SeoAiGenerateTestResult,
  type SeoAiJobErrorView,
  type SeoAiJobEstimate,
  type SeoAiJobItemView,
  type SeoAiJobView,
  type SeoAiLocalitySearchHit,
} from '@/lib/nest-client';

const TONES: { label: string; value: string }[] = [
  { label: 'Odborný', value: 'EXPERT' },
  { label: 'Přirozený', value: 'NATURAL' },
  { label: 'Rodinné bydlení', value: 'FAMILY' },
  { label: 'Investiční', value: 'INVESTMENT' },
  { label: 'Luxusní', value: 'LUXURY' },
  { label: 'Stručný', value: 'CONCISE' },
  { label: 'Průvodce lokalitou', value: 'LOCALITY_GUIDE' },
];

const AUDIENCES: { label: string; value: string }[] = [
  { label: 'kupující', value: 'BUYER' },
  { label: 'nájemci', value: 'TENANT' },
  { label: 'rodiny', value: 'FAMILY' },
  { label: 'investoři', value: 'INVESTOR' },
  { label: 'senioři', value: 'SENIOR' },
  { label: 'studenti', value: 'STUDENT' },
  { label: 'majitelé', value: 'OWNER' },
  { label: 'makléři', value: 'AGENT' },
  { label: 'stavební firmy', value: 'COMPANY' },
];

const GENERATION_PHASES = [
  'Ověřuji lokalitu…',
  'Načítám data RÚIAN a ČSÚ…',
  'Načítám skutečné inzeráty…',
  'Připravuji AI podklady…',
  'Generuji originální obsah…',
  'Kontroluji duplicity…',
  'Počítám kvalitu…',
  'Ukládám koncept…',
  'Připravuji náhled…',
];

type StructuredError = {
  title: string;
  code: string;
  httpStatus: number;
  phase: string;
  detail: string;
  options?: SeoAiLocalitySearchHit[];
  validationErrors?: string[];
  rawAiJson?: unknown;
  normalizedPreview?: unknown;
};

type Props = {
  token: string;
  onRefresh?: () => void;
};

export function SeoAiGeneratorPanel({ token, onRefresh }: Props) {
  const router = useRouter();
  const { startLoading, updateLoading, stopLoading } = useAdminLoading();
  const loadingKey = 'seo-ai-generate-test';

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<StructuredError | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showTestForm, setShowTestForm] = useState(false);
  const [testResult, setTestResult] = useState<SeoAiGenerateTestResult | null>(null);
  const [estimate, setEstimate] = useState<SeoAiJobEstimate | null>(null);
  const [activeJob, setActiveJob] = useState<SeoAiJobView | null>(null);
  const [diagnostics, setDiagnostics] = useState<SeoAiDiagnostics | null>(null);
  const [diagBusy, setDiagBusy] = useState(false);
  const [showAiJson, setShowAiJson] = useState(false);
  const [showJobErrors, setShowJobErrors] = useState(false);
  const [jobErrors, setJobErrors] = useState<SeoAiJobErrorView[]>([]);
  const [jobItems, setJobItems] = useState<SeoAiJobItemView[]>([]);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  const [localityQuery, setLocalityQuery] = useState('Pardubice');
  const [localityHits, setLocalityHits] = useState<SeoAiLocalitySearchHit[]>([]);
  const [localityOpen, setLocalityOpen] = useState(false);
  const [selectedLocality, setSelectedLocality] = useState<SeoAiLocalitySearchHit | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [form, setForm] = useState({
    offerType: 'SALE',
    propertyType: 'APARTMENT',
    region: 'Pardubický kraj',
    district: 'Pardubice',
    primaryKeyword: 'byty na prodej Pardubice',
    secondaryKeywords: 'byt Pardubice, prodej bytu',
    tone: 'NATURAL',
    contentLength: 'MEDIUM' as 'SHORT' | 'MEDIUM' | 'LONG',
    targetAudience: 'BUYER',
    useRuian: true,
    useCsu: true,
    useListings: true,
    useLocalityFacts: true,
    initialStatus: 'DRAFT' as 'DRAFT' | 'REVIEW' | 'PUBLISHED',
    indexImmediately: false,
  });

  const refreshJob = useCallback(async () => {
    const job = await nestAdminSeoAiGetActiveJob(token);
    if (job?.id) {
      const full = await nestAdminSeoAiGetJob(token, job.id);
      setActiveJob(full);
      if (full?.items?.length) {
        setJobItems(full.items);
      } else if (full?.id) {
        const items = await nestAdminSeoAiGetJobItems(token, full.id);
        setJobItems(items ?? []);
      }
    } else {
      setActiveJob(null);
      setJobItems([]);
    }
  }, [token]);

  const loadJobErrors = useCallback(async () => {
    if (!activeJob?.id) return;
    const errors = await nestAdminSeoAiGetJobErrors(token, activeJob.id);
    setJobErrors(errors ?? []);
    setShowJobErrors(true);
  }, [activeJob?.id, token]);

  useEffect(() => {
    void refreshJob();
  }, [refreshJob]);

  useEffect(() => {
    if (!activeJob || !['PENDING', 'RUNNING', 'PAUSED'].includes(activeJob.status)) return;
    const id = setInterval(() => void refreshJob(), 3000);
    return () => clearInterval(id);
  }, [activeJob, refreshJob]);

  const searchLocalities = useCallback(
    (q: string) => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(async () => {
        if (q.trim().length < 2) {
          setLocalityHits([]);
          return;
        }
        const hits = await nestAdminSeoSearchLocalitiesMain(token, q, 15);
        setLocalityHits(hits);
      }, 300);
    },
    [token],
  );

  useEffect(() => {
    if (showTestForm && localityQuery.trim().length >= 2) {
      searchLocalities(localityQuery);
    }
  }, [showTestForm, localityQuery, searchLocalities]);

  function selectLocality(hit: SeoAiLocalitySearchHit) {
    setSelectedLocality(hit);
    setLocalityQuery(hit.name);
    setLocalityOpen(false);
    setForm((f) => ({
      ...f,
      region: hit.region ?? f.region,
      district: hit.district ?? f.district,
    }));
  }

  async function refreshDiagnostics() {
    setDiagBusy(true);
    try {
      const d = await nestAdminSeoAiDiagnostics(token);
      setDiagnostics(d);
    } catch {
      setDiagnostics(null);
    } finally {
      setDiagBusy(false);
    }
  }

  function formatApiError(e: unknown): StructuredError {
    if (e instanceof SeoAiApiError) {
      const validationDetail = e.validationErrors?.length
        ? e.validationErrors.join(' · ')
        : undefined;
      return {
        title: 'AI SEO stránku se nepodařilo vytvořit',
        code: e.code,
        httpStatus: e.httpStatus,
        phase: e.phase ?? 'AI_GENERATION_REQUEST',
        detail: validationDetail ?? e.detail ?? e.message,
        options: e.options,
        validationErrors: e.validationErrors,
        rawAiJson: e.rawAiJson,
        normalizedPreview: e.normalizedPreview,
      };
    }
    return {
      title: 'AI SEO stránku se nepodařilo vytvořit',
      code: 'AI_GENERATION_FAILED',
      httpStatus: 0,
      phase: 'AI_GENERATION_REQUEST',
      detail: e instanceof Error ? e.message : 'Neznámá chyba.',
    };
  }

  async function runTest() {
    setBusy(true);
    setError(null);
    setMsg(null);
    setTestResult(null);

    let phaseIdx = 0;
    startLoading({ key: loadingKey, label: 'Generuji testovací AI stránku…', sublabel: GENERATION_PHASES[0] });
    const phaseTimer = setInterval(() => {
      phaseIdx = Math.min(phaseIdx + 1, GENERATION_PHASES.length - 1);
      updateLoading({ key: loadingKey, sublabel: GENERATION_PHASES[phaseIdx] });
    }, 4000);

    try {
      const res = await nestAdminSeoAiGenerateTest(token, {
        localityId: selectedLocality?.id,
        localitySlug: selectedLocality?.slug ?? localityQuery.trim().toLowerCase().replace(/\s+/g, '-'),
        region: form.region || undefined,
        district: form.district || undefined,
        offerType: form.offerType,
        propertyType: form.propertyType,
        primaryKeyword: form.primaryKeyword || undefined,
        secondaryKeywords: form.secondaryKeywords.split(',').map((k) => k.trim()).filter(Boolean),
        tone: form.tone,
        contentLength: form.contentLength,
        targetAudience: form.targetAudience,
        useRuian: form.useRuian,
        useCsu: form.useCsu,
        useListings: form.useListings,
        useLocalityFacts: form.useLocalityFacts,
        status: form.initialStatus,
        indexImmediately: form.indexImmediately,
        createLocationIfMissing: !selectedLocality?.id,
      });

      if (!res?.success || !res.pageId) {
        setError({
          title: 'AI SEO stránku se nepodařilo vytvořit',
          code: 'AI_GENERATION_FAILED',
          httpStatus: 200,
          phase: 'AI_GENERATION_REQUEST',
          detail: 'Backend vrátil neúspěšnou odpověď.',
        });
        return;
      }

      setTestResult(res);
      setMsg('Testovací AI stránka byla vytvořena.');
      setShowTestForm(false);
      onRefresh?.();
      await refreshJob();

      const preview = res.previewUrl ?? `/admin/seo/pages/${res.pageId}/preview`;
      router.push(preview);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      clearInterval(phaseTimer);
      stopLoading(loadingKey);
      setBusy(false);
    }
  }

  async function startBatch(count: number) {
    setBusy(true);
    setError(null);
    try {
      const slug = selectedLocality?.slug ?? localityQuery.trim();
      const est = await nestAdminSeoAiEstimateJob(token, {
        count,
        locationSlug: slug,
        offerType: form.offerType,
        propertyType: form.propertyType,
        tone: form.tone,
        targetAudience: form.targetAudience,
      });
      setEstimate(est);
      if (!est) {
        setError({
          title: 'AI SEO stránku se nepodařilo vytvořit',
          code: 'AI_GENERATION_FAILED',
          httpStatus: 0,
          phase: 'AI_GENERATION_REQUEST',
          detail: 'Nepodařilo se odhadnout náklady.',
        });
        return;
      }
      if (est.requiresConfirmation) {
        const ok = window.confirm(
          `Odhad: ${est.pageCount} stránek, ~${est.estimatedCostCzk} Kč.\nDenní limit: ${est.dailyUsed}/${est.dailyLimit}.\nPokračovat?`,
        );
        if (!ok) return;
      }
      const job = await nestAdminSeoAiCreateJob(token, {
        count,
        locationSlug: slug,
        offerType: form.offerType,
        propertyType: form.propertyType,
        tone: form.tone,
        targetAudience: form.targetAudience,
        useRuian: form.useRuian,
        useCsu: form.useCsu,
        useListings: form.useListings,
        initialStatus: 'REVIEW',
      });
      if (!job?.jobId) {
        setError({
          title: 'AI SEO stránku se nepodařilo vytvořit',
          code: 'AI_GENERATION_FAILED',
          httpStatus: 0,
          phase: 'AI_GENERATION_REQUEST',
          detail: 'Nepodařilo se spustit AI úlohu.',
        });
        return;
      }
      setMsg(`AI úloha spuštěna (${count} stránek).`);
      await refreshJob();
      onRefresh?.();
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  async function jobAction(action: 'pause' | 'resume' | 'cancel' | 'retry-failed') {
    if (!activeJob?.id) return;
    setBusy(true);
    try {
      if (action === 'pause') await nestAdminSeoAiPauseJob(token, activeJob.id);
      if (action === 'resume') await nestAdminSeoAiResumeJob(token, activeJob.id);
      if (action === 'cancel') await nestAdminSeoAiCancelJob(token, activeJob.id);
      if (action === 'retry-failed') await nestAdminSeoAiRetryFailedJob(token, activeJob.id);
      await refreshJob();
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  async function retryJobItem(itemId: string) {
    if (!activeJob?.id) return;
    setBusy(true);
    try {
      await nestAdminSeoAiRetryJobItem(token, activeJob.id, itemId);
      await refreshJob();
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  function itemStatusLabel(status: string) {
    const map: Record<string, string> = {
      PENDING: 'Čeká',
      RUNNING: 'Běží',
      COMPLETED: 'Vytvořeno',
      REVIEW: 'Ke kontrole',
      REGENERATED: 'Regenerováno',
      FAILED: 'Chyba',
      SKIPPED: 'Přeskočeno',
    };
    return map[status] ?? status;
  }

  return (
    <section className="mb-6 space-y-3 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-5">
      <div>
        <h2 className="text-lg font-semibold text-violet-950">Generování pomocí AI</h2>
        <p className="mt-1 text-sm text-violet-900/80">
          Prémiové generování originálních SEO stránek s unikátním obsahem, layoutem a ověřenými fakty.
          Šablonové generování bez AI zůstává v sekci níže.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">
          <p className="font-semibold">{error.title}</p>
          <p>Kód: {error.code}</p>
          {error.httpStatus > 0 ? <p>HTTP: {error.httpStatus}</p> : null}
          <p>Fáze: {error.phase}</p>
          <p>Detail: {error.detail}</p>
          {error.validationErrors?.length ? (
            <ul className="mt-2 list-disc pl-5 text-xs">
              {error.validationErrors.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          ) : null}
          {error.rawAiJson ? (
            <div className="mt-2">
              <button
                type="button"
                className="rounded border bg-white px-2 py-1 text-xs"
                onClick={() => setShowAiJson((v) => !v)}
              >
                {showAiJson ? 'Skrýt AI JSON' : 'Zobrazit AI JSON'}
              </button>
              {showAiJson ? (
                <pre className="mt-2 max-h-64 overflow-auto rounded bg-zinc-900 p-2 text-xs text-green-100">
                  {JSON.stringify(error.rawAiJson, null, 2)}
                </pre>
              ) : null}
            </div>
          ) : null}
          {error.options?.length ? (
            <ul className="mt-2 list-disc pl-5">
              {error.options.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    className="underline"
                    onClick={() => selectLocality(o)}
                  >
                    {o.name}
                    {o.district ? ` · Okres ${o.district}` : ''}
                    {o.region ? ` · ${o.region}` : ''}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {msg ? <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{msg}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => setShowTestForm(true)}
          className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Vygenerovat testovací AI stránku
        </button>
        <button type="button" disabled={busy} onClick={() => void startBatch(10)} className="rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50">
          Vygenerovat 10 AI stránek
        </button>
        <button type="button" disabled={busy} onClick={() => void startBatch(100)} className="rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50">
          Vygenerovat 100 AI stránek
        </button>
        <button
          type="button"
          disabled={diagBusy}
          onClick={() => void refreshDiagnostics()}
          className="rounded-lg border border-violet-200 px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {diagBusy ? 'Načítám diagnostiku…' : 'Obnovit diagnostiku'}
        </button>
        {activeJob?.status === 'RUNNING' ? (
          <button type="button" disabled={busy} onClick={() => void jobAction('pause')} className="rounded-lg border px-3 py-1.5 text-sm">
            Pozastavit AI úlohu
          </button>
        ) : null}
        {activeJob?.status === 'PAUSED' ? (
          <button type="button" disabled={busy} onClick={() => void jobAction('resume')} className="rounded-lg border px-3 py-1.5 text-sm">
            Pokračovat v AI úloze
          </button>
        ) : null}
        {activeJob && activeJob.errorCount > 0 ? (
          <button type="button" disabled={busy} onClick={() => void jobAction('retry-failed')} className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm">
            Opakovat chybné položky
          </button>
        ) : null}
        {activeJob && activeJob.errorCount > 0 ? (
          <button type="button" disabled={busy} onClick={() => void loadJobErrors()} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700">
            Zobrazit chyby
          </button>
        ) : null}
        {activeJob && ['PENDING', 'RUNNING', 'PAUSED'].includes(activeJob.status) ? (
          <button type="button" disabled={busy} onClick={() => void jobAction('cancel')} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700">
            Zrušit AI úlohu
          </button>
        ) : null}
      </div>

      {diagnostics ? (
        <div className="rounded-lg border border-violet-100 bg-white p-3 text-xs text-violet-900">
          <p>
            Backend: {diagnostics.backendAvailable ? 'OK' : 'chyba'} · OpenAI:{' '}
            {diagnostics.openAiEnabled ? 'zapnuto' : 'vypnuto'} · Klíč:{' '}
            {diagnostics.apiKeyConfigured ? 'ano' : 'ne'} · Model: {diagnostics.model} · Lokality:{' '}
            {diagnostics.localityCount} · Prompt:{' '}
            {diagnostics.activePromptConfigured ? 'ano' : 'ne'}
          </p>
        </div>
      ) : null}

      {estimate ? (
        <p className="text-xs text-violet-800">
          Odhad: {estimate.pageCount} stránek · ~{estimate.estimatedTokens} tokenů · ~{estimate.estimatedCostCzk} Kč ·
          denně {estimate.dailyUsed}/{estimate.dailyLimit}
        </p>
      ) : null}

      {activeJob ? (
        <div className="rounded-lg border border-violet-100 bg-white p-3 text-sm space-y-2">
          <p>
            AI úloha: <strong>{activeJob.status}</strong> · {activeJob.processedCount}/{activeJob.requestedCount}
            {activeJob.progressPct != null ? ` (${activeJob.progressPct} %)` : ''}
          </p>
          <p className="text-xs text-zinc-700">
            vytvořeno {activeJob.createdCount}
            {activeJob.updatedCount > 0 ? ` · aktualizováno ${activeJob.updatedCount}` : ''}
            {' · '}ke kontrole {activeJob.reviewCount}
            {' · '}přeskočeno {activeJob.skippedCount ?? 0}
            {' · '}chyby {activeJob.errorCount}
            {activeJob.retriedCount ? ` · opakování ${activeJob.retriedCount}` : ''}
          </p>
          {activeJob.currentItem ? <p className="text-xs text-zinc-600">Aktuálně: {activeJob.currentItem}</p> : null}
          {activeJob.pauseReason ? (
            <p className="text-xs text-amber-800 bg-amber-50 rounded px-2 py-1">
              {activeJob.pauseReason.startsWith('AUTO_PAUSED')
                ? 'Úloha byla automaticky pozastavena, protože opakovaně vzniká stejná chyba.'
                : `Pozastaveno: ${activeJob.pauseReason}`}
            </p>
          ) : null}
          {activeJob.lastError ? <p className="text-xs text-red-700">Poslední chyba: {activeJob.lastError}</p> : null}
          <p className="text-xs text-zinc-600">
            Požadavky: {activeJob.requestCount ?? 0} (úspěšné {activeJob.successfulRequestCount ?? 0}, neúspěšné{' '}
            {activeJob.failedRequestCount ?? 0}) · Tokeny: {activeJob.totalInputTokens ?? 0} in /{' '}
            {activeJob.totalOutputTokens ?? 0} out · Náklad: ~{activeJob.estimatedCostCzk} Kč (odhad) /{' '}
            {activeJob.actualCostCzk} Kč (skutečný)
          </p>

          {jobItems.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead>
                  <tr className="border-b text-zinc-500">
                    <th className="py-1 pr-2">#</th>
                    <th className="py-1 pr-2">Lokalita</th>
                    <th className="py-1 pr-2">Nabídka</th>
                    <th className="py-1 pr-2">Typ</th>
                    <th className="py-1 pr-2">Stav</th>
                    <th className="py-1 pr-2">Fáze</th>
                    <th className="py-1 pr-2">Pokus</th>
                    <th className="py-1 pr-2">Kvalita</th>
                    <th className="py-1 pr-2">Chyba</th>
                    <th className="py-1 pr-2">Akce</th>
                  </tr>
                </thead>
                <tbody>
                  {jobItems.map((item) => (
                    <tr key={item.id} className="border-b border-zinc-100 align-top">
                      <td className="py-1 pr-2">{item.order ?? '—'}</td>
                      <td className="py-1 pr-2">
                        {item.localityName ?? item.localitySlug ?? '—'}
                        {item.localitySlug ? <span className="block text-zinc-500">{item.localitySlug}</span> : null}
                      </td>
                      <td className="py-1 pr-2">{item.offerType ?? '—'}</td>
                      <td className="py-1 pr-2">{item.propertyType ?? item.intentSlug ?? '—'}</td>
                      <td className="py-1 pr-2">{itemStatusLabel(item.status)}</td>
                      <td className="py-1 pr-2">{item.phase ?? '—'}</td>
                      <td className="py-1 pr-2">{item.attempt}</td>
                      <td className="py-1 pr-2">
                        {item.qualityScore != null ? item.qualityScore : '—'}
                        {item.uniquenessScore != null ? ` / ${item.uniquenessScore}` : ''}
                      </td>
                      <td className="py-1 pr-2 max-w-[200px]">
                        {item.status === 'SKIPPED' && item.errorCode ? (
                          <span className="text-zinc-600" title={item.errorMessage ?? undefined}>
                            {item.errorCode}
                          </span>
                        ) : item.errorCode ? (
                          <span className="text-red-700" title={item.errorMessage ?? undefined}>
                            {item.errorCode}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-1 pr-2">
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            className="rounded border px-1 py-0.5"
                            onClick={() => setExpandedItemId(expandedItemId === item.id ? null : item.id)}
                          >
                            Detail
                          </button>
                          {item.status === 'FAILED' ? (
                            <button
                              type="button"
                              className="rounded border px-1 py-0.5"
                              disabled={busy}
                              onClick={() => void retryJobItem(item.id)}
                            >
                              Opakovat
                            </button>
                          ) : null}
                          {item.seoPageId ? (
                            <>
                              <Link
                                href={`/admin/seo/pages/${item.seoPageId}/preview`}
                                className="rounded border px-1 py-0.5 underline"
                              >
                                Náhled
                              </Link>
                              <Link
                                href={`/admin/seo/stranky/${item.seoPageId}`}
                                className="rounded border px-1 py-0.5 underline"
                              >
                                Stránka
                              </Link>
                            </>
                          ) : null}
                        </div>
                        {expandedItemId === item.id ? (
                          <div className="mt-1 rounded bg-zinc-50 p-2 text-[10px]">
                            {item.errorMessage ? <p className="text-red-800">Chyba: {item.errorMessage}</p> : null}
                            {item.inputJson ? (
                              <details className="mt-1">
                                <summary>Vstup</summary>
                                <pre className="max-h-32 overflow-auto">{JSON.stringify(item.inputJson, null, 2)}</pre>
                              </details>
                            ) : null}
                            {item.outputPreviewJson ? (
                              <details className="mt-1">
                                <summary>AI výstup (náhled)</summary>
                                <pre className="max-h-32 overflow-auto">{JSON.stringify(item.outputPreviewJson, null, 2)}</pre>
                              </details>
                            ) : null}
                            {item.durationMs != null ? <p>Doba: {item.durationMs} ms</p> : null}
                            {item.costCzk > 0 ? <p>Náklad: {item.costCzk} Kč</p> : null}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {showJobErrors && jobErrors.length > 0 ? (
            <details open className="mt-2 rounded border border-red-100 bg-red-50 p-2 text-xs">
              <summary className="cursor-pointer font-medium text-red-900">Chyby AI úlohy ({jobErrors.length})</summary>
              <ul className="mt-2 space-y-2">
                {jobErrors.map((err) => (
                  <li key={err.itemId} className="rounded bg-white p-2 border border-red-100">
                    <p className="font-medium">
                      Položka {err.index}: {err.localityName ?? err.localitySlug ?? '—'} / {err.offerType ?? '—'} /{' '}
                      {err.propertyType ?? err.intentSlug ?? '—'}
                    </p>
                    <p>Fáze: {err.phase ?? '—'}</p>
                    <p>Kód: {err.code ?? '—'}</p>
                    <p>Detail: {err.message ?? '—'}</p>
                    {err.httpStatus ? <p>HTTP: {err.httpStatus}</p> : null}
                    {err.attempt ? <p>Pokus: {err.attempt}</p> : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      {testResult ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-950">
          <p className="font-semibold">Testovací AI stránka vytvořena</p>
          <p>H1: {testResult.h1}</p>
          <p>Redakční titulek: {testResult.editorialTitle}</p>
          <p>Quality score: {testResult.qualityScore} · Uniqueness: {testResult.uniquenessScore}</p>
          <p>Nabídky v DB: {testResult.listingCount} · Náklad: ~{testResult.estimatedCostCzk} Kč</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link
              href={testResult.previewUrl ?? `/admin/seo/pages/${testResult.pageId}/preview`}
              className="rounded border bg-white px-2 py-1 text-xs underline"
            >
              Náhled
            </Link>
            <Link href={`/admin/seo/stranky/${testResult.pageId}`} className="rounded border bg-white px-2 py-1 text-xs underline">
              Upravit
            </Link>
            {testResult.publicPath ? (
              <a href={testResult.publicPath} target="_blank" rel="noreferrer" className="rounded border bg-white px-2 py-1 text-xs underline">
                Veřejná URL
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {showTestForm ? (
        <div className="rounded-xl border border-violet-200 bg-white p-4">
          <h3 className="mb-3 font-medium">Testovací AI stránka</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="relative text-sm sm:col-span-2">
              Lokalita
              <input
                value={localityQuery}
                onChange={(e) => {
                  setLocalityQuery(e.target.value);
                  setSelectedLocality(null);
                  setLocalityOpen(true);
                }}
                onFocus={() => setLocalityOpen(true)}
                placeholder="Začněte psát název obce…"
                className="mt-1 w-full rounded border px-2 py-1"
                autoComplete="off"
              />
              {localityOpen && localityHits.length > 0 ? (
                <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded border bg-white shadow">
                  {localityHits.map((hit) => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-violet-50"
                        onClick={() => selectLocality(hit)}
                      >
                        <span className="font-medium">{hit.name}</span>
                        {hit.district ? <span className="text-zinc-600"> · Okres {hit.district}</span> : null}
                        {hit.region ? <span className="text-zinc-500"> · {hit.region}</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {selectedLocality ? (
                <p className="mt-1 text-xs text-green-700">
                  Vybráno: {selectedLocality.name} (ID: {selectedLocality.id}, slug: {selectedLocality.slug})
                </p>
              ) : null}
            </label>
            <label className="text-sm">
              Kraj
              <input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className="mt-1 w-full rounded border px-2 py-1" />
            </label>
            <label className="text-sm">
              Okres
              <input value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} className="mt-1 w-full rounded border px-2 py-1" />
            </label>
            <label className="text-sm">
              Typ nabídky
              <select value={form.offerType} onChange={(e) => setForm({ ...form, offerType: e.target.value })} className="mt-1 w-full rounded border px-2 py-1">
                <option value="SALE">Prodej</option>
                <option value="RENT">Pronájem</option>
              </select>
            </label>
            <label className="text-sm">
              Typ nemovitosti
              <select value={form.propertyType} onChange={(e) => setForm({ ...form, propertyType: e.target.value })} className="mt-1 w-full rounded border px-2 py-1">
                <option value="APARTMENT">Byt</option>
                <option value="HOUSE">Dům</option>
                <option value="LAND">Pozemek</option>
                <option value="COMMERCIAL">Komerční</option>
                <option value="GARAGE">Garáž</option>
                <option value="OTHER">Jiné</option>
              </select>
            </label>
            <label className="text-sm">
              Cílové klíčové slovo
              <input value={form.primaryKeyword} onChange={(e) => setForm({ ...form, primaryKeyword: e.target.value })} className="mt-1 w-full rounded border px-2 py-1" />
            </label>
            <label className="text-sm sm:col-span-2">
              Sekundární klíčová slova (čárkou)
              <input value={form.secondaryKeywords} onChange={(e) => setForm({ ...form, secondaryKeywords: e.target.value })} className="mt-1 w-full rounded border px-2 py-1" />
            </label>
            <label className="text-sm">
              Tón
              <select value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })} className="mt-1 w-full rounded border px-2 py-1">
                {TONES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Cílová skupina
              <select value={form.targetAudience} onChange={(e) => setForm({ ...form, targetAudience: e.target.value })} className="mt-1 w-full rounded border px-2 py-1">
                {AUDIENCES.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Délka
              <select
                value={form.contentLength}
                onChange={(e) => setForm({ ...form, contentLength: e.target.value as typeof form.contentLength })}
                className="mt-1 w-full rounded border px-2 py-1"
              >
                <option value="SHORT">Krátká</option>
                <option value="MEDIUM">Střední</option>
                <option value="LONG">Dlouhá</option>
              </select>
            </label>
            <label className="text-sm">
              Status po vytvoření
              <select value={form.initialStatus} onChange={(e) => setForm({ ...form, initialStatus: e.target.value as typeof form.initialStatus })} className="mt-1 w-full rounded border px-2 py-1">
                <option value="DRAFT">DRAFT</option>
                <option value="REVIEW">REVIEW</option>
                <option value="PUBLISHED">PUBLISHED</option>
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <label className="flex items-center gap-1"><input type="checkbox" checked={form.useRuian} onChange={(e) => setForm({ ...form, useRuian: e.target.checked })} />RÚIAN</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={form.useCsu} onChange={(e) => setForm({ ...form, useCsu: e.target.checked })} />ČSÚ</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={form.useListings} onChange={(e) => setForm({ ...form, useListings: e.target.checked })} />Inzeráty</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={form.useLocalityFacts} onChange={(e) => setForm({ ...form, useLocalityFacts: e.target.checked })} />Zajímavosti</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={form.indexImmediately} onChange={(e) => setForm({ ...form, indexImmediately: e.target.checked })} />Indexovat ihned</label>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" disabled={busy} onClick={() => void runTest()} className="rounded-lg bg-violet-600 px-4 py-2 text-sm text-white disabled:opacity-50">
              {busy ? 'Generuji testovací AI stránku…' : 'Spustit generování'}
            </button>
            <button type="button" onClick={() => setShowTestForm(false)} className="rounded-lg border px-4 py-2 text-sm">
              Zrušit
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
