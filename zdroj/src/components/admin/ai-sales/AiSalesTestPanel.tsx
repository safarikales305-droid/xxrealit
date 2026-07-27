'use client';

import { useState } from 'react';
import {
  getDiagnostics,
  getOpenAiDiagnostics,
  PARTNER_TYPE_LABELS,
  PARTNER_TYPES,
  testAnalysis,
  testOpenAi,
  testSearchProviderApi,
  type AiSalesApiError,
} from '@/lib/ai-sales-admin-api';

type Props = { token: string };

type TestError = { code: string; message: string; httpStatus: number; phase?: string };

export function AiSalesTestPanel({ token }: Props) {
  const [openAiResult, setOpenAiResult] = useState<Record<string, unknown> | null>(null);
  const [analysisResult, setAnalysisResult] = useState<Record<string, unknown> | null>(null);
  const [searchResult, setSearchResult] = useState<Record<string, unknown> | null>(null);
  const [diagnostics, setDiagnostics] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, TestError>>({});

  const [analysisForm, setAnalysisForm] = useState({
    companyName: 'Test Reality Pardubice',
    partnerType: 'REAL_ESTATE_AGENCY',
    city: 'Pardubice',
    publicInformation: 'Realitní kancelář nabízí byty a domy v Pardubickém kraji.',
  });

  const [searchForm, setSearchForm] = useState({
    providerKey: 'INTERNAL_DATABASE',
    partnerType: 'REAL_ESTATE_AGENCY',
    city: 'Pardubice',
    limit: 5,
  });

  function captureError(key: string, e: unknown) {
    const err = e as Error & AiSalesApiError;
    setErrors((prev) => ({
      ...prev,
      [key]: {
        code: err.code ?? 'UNKNOWN_ERROR',
        message: err.message ?? 'Neznámá chyba',
        httpStatus: err.httpStatus ?? 500,
        phase: err.phase,
      },
    }));
  }

  async function runOpenAiTest() {
    setBusy('openai');
    setErrors((prev) => ({ ...prev, openai: undefined as never }));
    try {
      const [diag, openAiDiag, res] = await Promise.all([
        getDiagnostics(token),
        getOpenAiDiagnostics(token),
        testOpenAi(token),
      ]);
      setDiagnostics({ ...diag, openAiDiagnostics: openAiDiag });
      setOpenAiResult(res);
    } catch (e) {
      captureError('openai', e);
      setOpenAiResult(null);
    } finally {
      setBusy(null);
    }
  }

  async function runAnalysisTest() {
    setBusy('analysis');
    setErrors((prev) => ({ ...prev, analysis: undefined as never }));
    try {
      const res = await testAnalysis(token, analysisForm);
      setAnalysisResult(res);
    } catch (e) {
      captureError('analysis', e);
      setAnalysisResult(null);
    } finally {
      setBusy(null);
    }
  }

  async function runSearchTest() {
    setBusy('search');
    setErrors((prev) => ({ ...prev, search: undefined as never }));
    try {
      const res = await testSearchProviderApi(token, searchForm);
      setSearchResult(res);
    } catch (e) {
      captureError('search', e);
      setSearchResult(null);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {diagnostics ? (
        <div className="rounded-xl border bg-zinc-50 p-3 text-xs">
          <p className="font-semibold">Diagnostika</p>
          <pre className="mt-1 max-h-32 overflow-auto">{JSON.stringify(diagnostics, null, 2)}</pre>
        </div>
      ) : null}

      <TestBlock
        title="A. Otestovat OpenAI pro AI obchodníka"
        busy={busy === 'openai'}
        error={errors.openai}
        onRun={() => void runOpenAiTest()}
        result={openAiResult}
      />

      <div className="rounded-2xl border bg-white p-4 space-y-2">
        <h3 className="font-semibold">B. Otestovat analýzu partnera</h3>
        <input value={analysisForm.companyName} onChange={(e) => setAnalysisForm({ ...analysisForm, companyName: e.target.value })} className="w-full rounded border px-2 py-1 text-sm" />
        <select value={analysisForm.partnerType} onChange={(e) => setAnalysisForm({ ...analysisForm, partnerType: e.target.value })} className="w-full rounded border px-2 py-1 text-sm">
          {PARTNER_TYPES.map((t) => <option key={t} value={t}>{PARTNER_TYPE_LABELS[t]}</option>)}
        </select>
        <textarea value={analysisForm.publicInformation} onChange={(e) => setAnalysisForm({ ...analysisForm, publicInformation: e.target.value })} className="w-full rounded border px-2 py-1 text-sm" rows={3} />
        <button type="button" disabled={busy === 'analysis'} onClick={() => void runAnalysisTest()} className="rounded bg-orange-600 px-3 py-1 text-sm text-white disabled:opacity-50">
          {busy === 'analysis' ? 'Testuji…' : 'Spustit test analýzy'}
        </button>
        {errors.analysis ? <ErrorBox error={errors.analysis} onRetry={() => void runAnalysisTest()} /> : null}
        {analysisResult ? <pre className="max-h-64 overflow-auto rounded bg-zinc-50 p-2 text-xs">{JSON.stringify(analysisResult, null, 2)}</pre> : null}
      </div>

      <div className="rounded-2xl border bg-white p-4 space-y-2">
        <h3 className="font-semibold">C. Otestovat vyhledávací provider</h3>
        <select value={searchForm.providerKey} onChange={(e) => setSearchForm({ ...searchForm, providerKey: e.target.value })} className="w-full rounded border px-2 py-1 text-sm">
          <option value="INTERNAL_DATABASE">Interní databáze XXREALIT</option>
          <option value="BING_WEB_SEARCH">Bing Web Search</option>
          <option value="SERPAPI">SerpAPI</option>
        </select>
        <input value={searchForm.city} onChange={(e) => setSearchForm({ ...searchForm, city: e.target.value })} className="w-full rounded border px-2 py-1 text-sm" placeholder="Město" />
        <button type="button" disabled={busy === 'search'} onClick={() => void runSearchTest()} className="rounded bg-orange-600 px-3 py-1 text-sm text-white disabled:opacity-50">
          {busy === 'search' ? 'Testuji…' : 'Spustit test vyhledávání'}
        </button>
        {errors.search ? <ErrorBox error={errors.search} onRetry={() => void runSearchTest()} /> : null}
        {searchResult ? <pre className="max-h-64 overflow-auto rounded bg-zinc-50 p-2 text-xs">{JSON.stringify(searchResult, null, 2)}</pre> : null}
      </div>
    </div>
  );
}

function TestBlock({
  title,
  busy,
  error,
  onRun,
  result,
}: {
  title: string;
  busy: boolean;
  error?: TestError;
  onRun: () => void;
  result: Record<string, unknown> | null;
}) {
  return (
    <div className="rounded-2xl border bg-white p-4 space-y-2">
      <h3 className="font-semibold">{title}</h3>
      <button type="button" disabled={busy} onClick={onRun} className="rounded bg-orange-600 px-3 py-1 text-sm text-white disabled:opacity-50">
        {busy ? 'Testuji…' : 'Spustit test'}
      </button>
      {error ? <ErrorBox error={error} onRetry={onRun} /> : null}
      {result ? <pre className="max-h-48 overflow-auto rounded bg-zinc-50 p-2 text-xs">{JSON.stringify(result, null, 2)}</pre> : null}
    </div>
  );
}

function ErrorBox({ error, onRetry }: { error: TestError; onRetry: () => void }) {
  return (
    <div className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-900">
      <p className="font-semibold">Chyba testu</p>
      <p>HTTP {error.httpStatus} · kód: {error.code}{error.phase ? ` · fáze: ${error.phase}` : ''}</p>
      <p className="mt-1">{error.message}</p>
      <button type="button" className="mt-2 underline" onClick={onRetry}>Zkusit znovu</button>
    </div>
  );
}
