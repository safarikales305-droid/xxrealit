'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  analyzeSearchResult,
  dncSearchResult,
  getSearch,
  getSearchResults,
  PARTNER_TYPE_LABELS,
  PARTNER_TYPES,
  rejectSearchResult,
  saveSearchResult,
  SEARCH_SOURCES,
  startSearch,
  verifySearchResult,
  type AiSalesApiError,
  type AiSalesSearchResult,
} from '@/lib/ai-sales-admin-api';

type Props = { token: string; onSaved?: () => void };

export function AiSalesSearchPanel({ token, onSaved }: Props) {
  const [form, setForm] = useState({
    partnerType: 'REAL_ESTATE_AGENCY',
    region: 'Pardubický kraj',
    district: '',
    city: 'Pardubice',
    keywords: 'prodej bytů, prodej domů',
    specialization: '',
    limit: 30,
    sources: ['INTERNAL_DATABASE'] as string[],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<(AiSalesApiError & { message: string }) | null>(null);
  const [searchId, setSearchId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<AiSalesSearchResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const pollSearch = useCallback(
    async (id: string) => {
      try {
        const job = await getSearch(token, id);
        setJobStatus(job.status);
        setProgress(job.progressPercent ?? 0);
        if (job.status === 'COMPLETED' || job.status === 'FAILED') {
          const rows = await getSearchResults(token, id);
          setResults(rows);
          setBusy(false);
          return;
        }
        setTimeout(() => void pollSearch(id), 1500);
      } catch (e) {
        const err = e as Error & AiSalesApiError;
        setError({ message: err.message, code: err.code ?? 'UNKNOWN_ERROR', httpStatus: err.httpStatus ?? 500, success: false });
        setBusy(false);
      }
    },
    [token],
  );

  async function runSearch() {
    setBusy(true);
    setError(null);
    setResults([]);
    setSearchId(null);
    try {
      const res = await startSearch(token, {
        partnerType: form.partnerType,
        region: form.region || undefined,
        district: form.district || undefined,
        city: form.city || undefined,
        keywords: form.keywords.split(',').map((k) => k.trim()).filter(Boolean),
        specialization: form.specialization || undefined,
        sources: form.sources,
        limit: form.limit,
      });
      setSearchId(res.searchId);
      setJobStatus(res.status);
      void pollSearch(res.searchId);
    } catch (e) {
      const err = e as Error & AiSalesApiError;
      setError({
        message: err.message,
        code: err.code ?? 'UNKNOWN_ERROR',
        httpStatus: err.httpStatus ?? 500,
        success: false,
        phase: err.phase,
      });
      setBusy(false);
    }
  }

  async function bulkSave() {
    setBusy(true);
    try {
      for (const id of selected) {
        await saveSearchResult(token, id);
      }
      onSaved?.();
      if (searchId) await pollSearch(searchId);
    } catch (e) {
      const err = e as Error & AiSalesApiError;
      setError({ message: err.message, code: err.code ?? 'UNKNOWN_ERROR', httpStatus: err.httpStatus ?? 500, success: false });
    } finally {
      setBusy(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-3">
        <h3 className="font-semibold">Vyhledat partnery</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <select value={form.partnerType} onChange={(e) => setForm({ ...form, partnerType: e.target.value })} className="rounded border px-2 py-1 text-sm">
            {PARTNER_TYPES.map((t) => <option key={t} value={t}>{PARTNER_TYPE_LABELS[t]}</option>)}
          </select>
          <input placeholder="Kraj" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className="rounded border px-2 py-1 text-sm" />
          <input placeholder="Okres" value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} className="rounded border px-2 py-1 text-sm" />
          <input placeholder="Město" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="rounded border px-2 py-1 text-sm" />
          <input placeholder="Klíčová slova (čárkou)" value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} className="rounded border px-2 py-1 text-sm sm:col-span-2" />
          <input type="number" placeholder="Limit" value={form.limit} onChange={(e) => setForm({ ...form, limit: Number(e.target.value) })} className="rounded border px-2 py-1 text-sm" />
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          {SEARCH_SOURCES.map((s) => (
            <label key={s.id} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={form.sources.includes(s.id)}
                onChange={(e) => {
                  setForm({
                    ...form,
                    sources: e.target.checked
                      ? [...form.sources, s.id]
                      : form.sources.filter((x) => x !== s.id),
                  });
                }}
              />
              {s.label}
            </label>
          ))}
        </div>
        <button type="button" disabled={busy} onClick={() => void runSearch()} className="rounded bg-orange-600 px-4 py-2 text-sm text-white disabled:opacity-50">
          {busy ? 'Vyhledávám…' : 'Vyhledat partnery'}
        </button>
        {busy && jobStatus ? (
          <p className="text-xs text-zinc-500">Stav: {jobStatus} · průběh {progress}%</p>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">AI obchodníka se nepodařilo spustit</p>
          <p className="mt-1">Kód: <code>{error.code}</code> · HTTP {error.httpStatus}</p>
          <p className="mt-1">{error.message}</p>
          {error.code === 'SEARCH_PROVIDER_NOT_CONFIGURED' ? (
            <p className="mt-2 text-xs">Dostupné možnosti: interní databáze, ruční vložení, CSV import.</p>
          ) : null}
          <button type="button" className="mt-2 underline" onClick={() => void runSearch()}>Zkusit znovu</button>
        </div>
      ) : null}

      {results.length === 0 && !busy ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-sm text-zinc-600">
          Zadejte kritéria a spusťte vyhledávání. Webový zdroj vyžaduje BING_SEARCH_API_KEY nebo SERPAPI_API_KEY na backendu.
        </div>
      ) : null}

      {results.length > 0 ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || selected.size === 0} onClick={() => void bulkSave()} className="rounded border px-3 py-1 text-xs disabled:opacity-50">Uložit vybrané ({selected.size})</button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b bg-zinc-50">
                <tr>
                  <th className="px-2 py-2" />
                  <th className="px-2 py-2">Firma</th>
                  <th className="px-2 py-2">Typ</th>
                  <th className="px-2 py-2">Město</th>
                  <th className="px-2 py-2">Web</th>
                  <th className="px-2 py-2">E-mail</th>
                  <th className="px-2 py-2">Zdroj</th>
                  <th className="px-2 py-2">Ověření</th>
                  <th className="px-2 py-2">Akce</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id} className="border-b border-zinc-100">
                    <td className="px-2 py-2">
                      <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} disabled={r.doNotContact || r.verificationStatus === 'DUPLICATE'} />
                    </td>
                    <td className="px-2 py-2 font-medium">{r.companyName}</td>
                    <td className="px-2 py-2">{PARTNER_TYPE_LABELS[r.partnerType] ?? r.partnerType}</td>
                    <td className="px-2 py-2">{r.city ?? '—'}</td>
                    <td className="px-2 py-2 max-w-[120px] truncate">{r.website ?? '—'}</td>
                    <td className="px-2 py-2">{r.publicEmail ?? '—'}</td>
                    <td className="px-2 py-2">{r.source}</td>
                    <td className="px-2 py-2">
                      <span className={`rounded px-1 ${r.doNotContact ? 'bg-red-100 text-red-800' : 'bg-zinc-100'}`}>{r.verificationStatus}</span>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        {r.sourceUrl ? <a href={r.sourceUrl.startsWith('http') ? r.sourceUrl : '#'} target="_blank" rel="noreferrer" className="underline">Zdroj</a> : null}
                        <button type="button" disabled={busy} onClick={() => void verifySearchResult(token, r.id).then(() => searchId && pollSearch(searchId))} className="underline">Zkontrolovat</button>
                        <button type="button" disabled={busy || r.doNotContact} onClick={() => void saveSearchResult(token, r.id).then(() => onSaved?.())} className="underline">Uložit</button>
                        <button type="button" disabled={busy} onClick={() => void analyzeSearchResult(token, r.id)} className="underline">Analyzovat</button>
                        <button type="button" disabled={busy} onClick={() => void rejectSearchResult(token, r.id)} className="underline">Zamítnout</button>
                        <button type="button" disabled={busy} onClick={() => void dncSearchResult(token, r.id)} className="text-red-700 underline">DNC</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
