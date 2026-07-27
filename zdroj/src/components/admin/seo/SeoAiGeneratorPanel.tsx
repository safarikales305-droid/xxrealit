'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  nestAdminSeoAiCancelJob,
  nestAdminSeoAiCreateJob,
  nestAdminSeoAiEstimateJob,
  nestAdminSeoAiGenerateTest,
  nestAdminSeoAiGetActiveJob,
  nestAdminSeoAiGetJob,
  nestAdminSeoAiPauseJob,
  nestAdminSeoAiResumeJob,
  type SeoAiGenerateTestResult,
  type SeoAiJobEstimate,
  type SeoAiJobView,
} from '@/lib/nest-client';

const TONES = ['Odborný', 'Přirozený', 'Rodinné bydlení', 'Investiční', 'Luxusní', 'Stručný', 'Průvodce lokalitou'];
const AUDIENCES = ['kupující', 'nájemci', 'rodiny', 'investoři', 'senioři', 'studenti', 'majitelé', 'makléři', 'stavební firmy'];

type Props = {
  token: string;
  onRefresh?: () => void;
};

export function SeoAiGeneratorPanel({ token, onRefresh }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showTestForm, setShowTestForm] = useState(false);
  const [testResult, setTestResult] = useState<SeoAiGenerateTestResult | null>(null);
  const [estimate, setEstimate] = useState<SeoAiJobEstimate | null>(null);
  const [activeJob, setActiveJob] = useState<SeoAiJobView | null>(null);

  const [form, setForm] = useState({
    locationSlug: 'pardubice',
    offerType: 'PRODEJ',
    propertyType: 'BYT',
    region: 'Pardubický kraj',
    district: 'Pardubice',
    primaryKeyword: 'byty na prodej Pardubice',
    secondaryKeywords: 'byt Pardubice, prodej bytu',
    tone: 'Přirozený',
    length: 'medium' as 'short' | 'medium' | 'long',
    targetAudience: 'kupující',
    useRuian: true,
    useCsu: true,
    useListings: true,
    useLocalFacts: true,
    initialStatus: 'DRAFT' as 'DRAFT' | 'REVIEW' | 'PUBLISHED',
    indexImmediately: false,
  });

  const refreshJob = useCallback(async () => {
    const job = await nestAdminSeoAiGetActiveJob(token);
    if (job?.id) {
      const full = await nestAdminSeoAiGetJob(token, job.id);
      setActiveJob(full);
    } else {
      setActiveJob(null);
    }
  }, [token]);

  useEffect(() => {
    void refreshJob();
  }, [refreshJob]);

  useEffect(() => {
    if (!activeJob || !['PENDING', 'RUNNING', 'PAUSED'].includes(activeJob.status)) return;
    const id = setInterval(() => void refreshJob(), 3000);
    return () => clearInterval(id);
  }, [activeJob, refreshJob]);

  async function runTest() {
    setBusy(true);
    setError(null);
    setMsg(null);
    setTestResult(null);
    try {
      const res = await nestAdminSeoAiGenerateTest(token, {
        locationSlug: form.locationSlug.trim(),
        offerType: form.offerType,
        propertyType: form.propertyType,
        region: form.region || undefined,
        district: form.district || undefined,
        primaryKeyword: form.primaryKeyword || undefined,
        secondaryKeywords: form.secondaryKeywords.split(',').map((k) => k.trim()).filter(Boolean),
        tone: form.tone,
        length: form.length,
        targetAudience: form.targetAudience,
        useRuian: form.useRuian,
        useCsu: form.useCsu,
        useListings: form.useListings,
        useLocalFacts: form.useLocalFacts,
        initialStatus: form.initialStatus,
        indexImmediately: form.indexImmediately,
      });
      if (!res?.success) {
        setError('AI generování selhalo.');
        return;
      }
      setTestResult(res);
      setMsg('Testovací AI stránka byla vytvořena.');
      setShowTestForm(false);
      onRefresh?.();
      await refreshJob();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI generování selhalo.');
    } finally {
      setBusy(false);
    }
  }

  async function startBatch(count: number) {
    setBusy(true);
    setError(null);
    try {
      const est = await nestAdminSeoAiEstimateJob(token, {
        count,
        locationSlug: form.locationSlug,
        offerType: form.offerType,
        propertyType: form.propertyType,
        tone: form.tone,
        targetAudience: form.targetAudience,
      });
      setEstimate(est);
      if (!est) {
        setError('Nepodařilo se odhadnout náklady.');
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
        locationSlug: form.locationSlug,
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
        setError('Nepodařilo se spustit AI úlohu.');
        return;
      }
      setMsg(`AI úloha spuštěna (${count} stránek).`);
      await refreshJob();
      onRefresh?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Spuštění AI úlohy selhalo.');
    } finally {
      setBusy(false);
    }
  }

  async function jobAction(action: 'pause' | 'resume' | 'cancel') {
    if (!activeJob?.id) return;
    setBusy(true);
    try {
      if (action === 'pause') await nestAdminSeoAiPauseJob(token, activeJob.id);
      if (action === 'resume') await nestAdminSeoAiResumeJob(token, activeJob.id);
      if (action === 'cancel') await nestAdminSeoAiCancelJob(token, activeJob.id);
      await refreshJob();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Akce s úlohou selhala.');
    } finally {
      setBusy(false);
    }
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

      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      {msg ? <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{msg}</p> : null}

      <div className="flex flex-wrap gap-2">
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
        {activeJob && ['PENDING', 'RUNNING', 'PAUSED'].includes(activeJob.status) ? (
          <button type="button" disabled={busy} onClick={() => void jobAction('cancel')} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700">
            Zrušit AI úlohu
          </button>
        ) : null}
      </div>

      {estimate ? (
        <p className="text-xs text-violet-800">
          Odhad: {estimate.pageCount} stránek · ~{estimate.estimatedTokens} tokenů · ~{estimate.estimatedCostCzk} Kč ·
          denně {estimate.dailyUsed}/{estimate.dailyLimit}
        </p>
      ) : null}

      {activeJob ? (
        <div className="rounded-lg border border-violet-100 bg-white p-3 text-sm">
          <p>
            AI úloha: <strong>{activeJob.status}</strong> · {activeJob.processedCount}/{activeJob.requestedCount} ·
            vytvořeno {activeJob.createdCount} · ke kontrole {activeJob.reviewCount} · chyby {activeJob.errorCount}
          </p>
          {activeJob.currentItem ? <p className="text-xs text-zinc-600">Aktuálně: {activeJob.currentItem}</p> : null}
          <p className="text-xs text-zinc-600">
            Náklad: ~{activeJob.estimatedCostCzk} Kč (odhad) / {activeJob.actualCostCzk} Kč (skutečný)
          </p>
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
            <Link href={`/admin/seo/pages/${testResult.pageId}/preview`} className="rounded border bg-white px-2 py-1 text-xs underline">
              Náhled
            </Link>
            <Link href={`/admin/seo/stranky/${testResult.pageId}`} className="rounded border bg-white px-2 py-1 text-xs underline">
              Upravit
            </Link>
            <a href={testResult.publicPath} target="_blank" rel="noreferrer" className="rounded border bg-white px-2 py-1 text-xs underline">
              Veřejná URL
            </a>
          </div>
        </div>
      ) : null}

      {showTestForm ? (
        <div className="rounded-xl border border-violet-200 bg-white p-4">
          <h3 className="mb-3 font-medium">Testovací AI stránka</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Lokalita (slug)
              <input value={form.locationSlug} onChange={(e) => setForm({ ...form, locationSlug: e.target.value })} className="mt-1 w-full rounded border px-2 py-1" />
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
                <option value="PRODEJ">Prodej</option>
                <option value="PRONAJEM">Pronájem</option>
              </select>
            </label>
            <label className="text-sm">
              Typ nemovitosti
              <select value={form.propertyType} onChange={(e) => setForm({ ...form, propertyType: e.target.value })} className="mt-1 w-full rounded border px-2 py-1">
                <option value="BYT">Byt</option>
                <option value="DUM">Dům</option>
                <option value="POZEMEK">Pozemek</option>
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
                {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="text-sm">
              Cílová skupina
              <select value={form.targetAudience} onChange={(e) => setForm({ ...form, targetAudience: e.target.value })} className="mt-1 w-full rounded border px-2 py-1">
                {AUDIENCES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <label className="text-sm">
              Délka
              <select value={form.length} onChange={(e) => setForm({ ...form, length: e.target.value as typeof form.length })} className="mt-1 w-full rounded border px-2 py-1">
                <option value="short">Krátká</option>
                <option value="medium">Střední</option>
                <option value="long">Dlouhá</option>
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
            <label className="flex items-center gap-1"><input type="checkbox" checked={form.useLocalFacts} onChange={(e) => setForm({ ...form, useLocalFacts: e.target.checked })} />Zajímavosti</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={form.indexImmediately} onChange={(e) => setForm({ ...form, indexImmediately: e.target.checked })} />Indexovat ihned</label>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" disabled={busy} onClick={() => void runTest()} className="rounded-lg bg-violet-600 px-4 py-2 text-sm text-white disabled:opacity-50">
              {busy ? 'Generuji…' : 'Spustit generování'}
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
