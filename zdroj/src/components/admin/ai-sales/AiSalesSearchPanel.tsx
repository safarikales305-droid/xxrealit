'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  analyzeSearchResult,
  dncSearchResult,
  getSearch,
  getSearchResults,
  listSearchProviders,
  PARTNER_TYPE_LABELS,
  PARTNER_TYPES,
  rejectSearchResult,
  saveSearchResult,
  SEARCH_SOURCES,
  startSearch,
  verifySearchResult,
  type AiSalesApiError,
  type AiSalesSearchProviderInfo,
  type AiSalesSearchResult,
} from '@/lib/ai-sales-admin-api';

type Props = {
  token: string;
  onSaved?: () => void;
  onOpenSettings?: () => void;
};

type SkippedSource = { source: string; code: string; message: string };

const SOURCE_LABELS: Record<string, string> = {
  INTERNAL_DATABASE: 'Interní DB',
  APPROVED_WEB_PROVIDER: 'Web',
};

export function AiSalesSearchPanel({ token, onSaved, onOpenSettings }: Props) {
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
  const [providers, setProviders] = useState<AiSalesSearchProviderInfo[]>([]);
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [processingResultId, setProcessingResultId] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<(AiSalesApiError & { message: string }) | null>(null);
  const [analyzeWarning, setAnalyzeWarning] = useState<string | null>(null);
  const [partialWarning, setPartialWarning] = useState<string | null>(null);
  const [skippedSources, setSkippedSources] = useState<SkippedSource[]>([]);
  const [searchId, setSearchId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<AiSalesSearchResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const webProvider = providers.find((p) => p.id === 'APPROVED_WEB_PROVIDER');
  const webAvailable = webProvider?.available ?? false;

  const captureSearchError = useCallback((e: unknown, fallbackMessage: string) => {
    const err = e as Error & AiSalesApiError;
    setSearchError({
      message: err.message || fallbackMessage,
      code: err.code ?? 'UNKNOWN_ERROR',
      httpStatus: err.httpStatus ?? 500,
      success: false,
      phase: err.phase,
    });
  }, []);

  const ensureToken = useCallback((): boolean => {
    if (!token) {
      setSearchError({
        message: 'Přihlášení vypršelo. Přihlaste se znovu.',
        code: 'UNAUTHORIZED',
        httpStatus: 401,
        success: false,
      });
      return false;
    }
    return true;
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void listSearchProviders(token)
      .then((res) => {
        setProviders(res.providers ?? []);
        const web = res.providers?.find((p) => p.id === 'APPROVED_WEB_PROVIDER');
        if (!web?.available) {
          setForm((prev) => ({
            ...prev,
            sources: prev.sources.filter((s) => s !== 'APPROVED_WEB_PROVIDER'),
          }));
        }
      })
      .catch(() => setProviders([]))
      .finally(() => setProvidersLoaded(true));
  }, [token]);

  const buildSources = useCallback(
    (sources: string[]) => {
      const filtered = sources.filter((s) => {
        if (s === 'APPROVED_WEB_PROVIDER') return webAvailable;
        return true;
      });
      return filtered.length > 0 ? filtered : ['INTERNAL_DATABASE'];
    },
    [webAvailable],
  );

  const applyPartialFromJob = useCallback((job: {
    partial?: boolean;
    skippedSources?: SkippedSource[];
    errorCode?: string | null;
    errorMessage?: string | null;
  }) => {
    const skipped = job.skippedSources ?? [];
    setSkippedSources(skipped);
    if (job.partial || job.errorCode === 'PARTIAL' || skipped.length > 0) {
      const webSkipped = skipped.find((s) => s.source === 'APPROVED_WEB_PROVIDER');
      if (webSkipped) {
        setPartialWarning(
          'Vyhledávání proběhlo pouze v interní databázi XXREALIT. Webový provider nebyl použit, protože není nakonfigurován.',
        );
      } else if (skipped.length > 0) {
        setPartialWarning(skipped.map((s) => s.message).join(' '));
      } else if (job.errorMessage) {
        setPartialWarning(job.errorMessage);
      }
    } else {
      setPartialWarning(null);
      setSkippedSources([]);
    }
  }, []);

  const pollSearch = useCallback(
    async (id: string) => {
      if (!token) return;
      try {
        const job = await getSearch(token, id);
        setJobStatus(job.status);
        setProgress(job.progressPercent ?? 0);

        if (job.status === 'COMPLETED' || job.status === 'FAILED') {
          const rows = await getSearchResults(token, id);
          setResults(rows);

          if (rows.length > 0 || job.status === 'COMPLETED') {
            applyPartialFromJob(job);
            setSearchError(null);
          } else if (job.status === 'FAILED') {
            setSearchError({
              message: job.errorMessage ?? 'Vyhledávání selhalo.',
              code: job.errorCode ?? 'SEARCH_FAILED',
              httpStatus: 500,
              success: false,
            });
          }

          setBusy(false);
          return;
        }

        setTimeout(() => void pollSearch(id), 1500);
      } catch (e) {
        captureSearchError(e, 'Nepodařilo se načíst stav vyhledávání.');
        setBusy(false);
      }
    },
    [token, captureSearchError, applyPartialFromJob],
  );

  const refreshResults = useCallback(async () => {
    if (searchId) {
      await pollSearch(searchId);
    }
  }, [searchId, pollSearch]);

  async function runSearch(overrideSources?: string[]) {
    if (!ensureToken()) return;
    setBusy(true);
    setSearchError(null);
    setPartialWarning(null);
    setSkippedSources([]);
    setAnalyzeWarning(null);
    setResults([]);
    setSearchId(null);

    const sources = buildSources(overrideSources ?? form.sources);

    try {
      const res = await startSearch(token, {
        partnerType: form.partnerType,
        region: form.region || undefined,
        district: form.district || undefined,
        city: form.city || undefined,
        keywords: form.keywords.split(',').map((k) => k.trim()).filter(Boolean),
        specialization: form.specialization || undefined,
        sources,
        limit: form.limit,
      });

      if (res.partial && res.skippedSources?.length) {
        setSkippedSources(res.skippedSources);
        const webSkipped = res.skippedSources.find((s) => s.source === 'APPROVED_WEB_PROVIDER');
        if (webSkipped) {
          setPartialWarning(
            'Vyhledávání proběhlo pouze v interní databázi XXREALIT. Webový provider nebyl použit, protože není nakonfigurován.',
          );
        }
      }

      setSearchId(res.searchId);
      setJobStatus(res.status);
      void pollSearch(res.searchId);
    } catch (e) {
      captureSearchError(e, 'Vyhledávání se nepodařilo spustit.');
      setBusy(false);
    }
  }

  async function retryInternalOnly() {
    setForm((prev) => ({
      ...prev,
      sources: ['INTERNAL_DATABASE'],
    }));
    await runSearch(['INTERNAL_DATABASE']);
  }

  async function bulkSave() {
    if (!ensureToken()) return;
    setBusy(true);
    try {
      for (const id of selected) {
        await saveSearchResult(token, id);
      }
      onSaved?.();
      await refreshResults();
    } catch (e) {
      captureSearchError(e, 'Hromadné uložení se nezdařilo.');
    } finally {
      setBusy(false);
    }
  }

  const handleVerifyResult = async (resultId: string) => {
    if (!ensureToken()) return;
    setProcessingResultId(resultId);
    setAnalyzeWarning(null);
    try {
      await verifySearchResult(token, resultId);
      await refreshResults();
    } catch (e) {
      console.error('Nepodařilo se ověřit výsledek vyhledávání:', e);
      setAnalyzeWarning('Ověření kontaktu se nepodařilo dokončit.');
    } finally {
      setProcessingResultId(null);
    }
  };

  const handleSaveResult = async (resultId: string) => {
    if (!ensureToken()) return;
    setProcessingResultId(resultId);
    setAnalyzeWarning(null);
    try {
      const res = await saveSearchResult(token, resultId) as {
        analysisUnavailable?: boolean;
        warning?: { message?: string };
      };
      if (res.analysisUnavailable) {
        setAnalyzeWarning(res.warning?.message ?? 'AI analýza je dočasně nedostupná.');
      }
      onSaved?.();
      await refreshResults();
    } catch (e) {
      captureSearchError(e, 'Partnera se nepodařilo uložit.');
    } finally {
      setProcessingResultId(null);
    }
  };

  const handleAnalyzeResult = async (resultId: string) => {
    if (!ensureToken()) return;
    setProcessingResultId(resultId);
    setAnalyzeWarning(null);
    try {
      const res = await analyzeSearchResult(token, resultId) as {
        analysisUnavailable?: boolean;
        warning?: { message?: string };
        partial?: boolean;
      };
      if (res.analysisUnavailable || res.partial) {
        setAnalyzeWarning(res.warning?.message ?? 'AI analýza je dočasně nedostupná.');
      }
      onSaved?.();
      await refreshResults();
    } catch (e) {
      const err = e as Error & AiSalesApiError;
      if (/OPENAI|analýz/i.test(err.code ?? '')) {
        setAnalyzeWarning('AI analýza je dočasně nedostupná.');
      } else {
        setAnalyzeWarning(err.message || 'AI analýzu se nepodařilo spustit.');
      }
    } finally {
      setProcessingResultId(null);
    }
  };

  const handleRejectResult = async (resultId: string) => {
    if (!ensureToken()) return;
    setProcessingResultId(resultId);
    try {
      await rejectSearchResult(token, resultId);
      await refreshResults();
    } catch (e) {
      setAnalyzeWarning(e instanceof Error ? e.message : 'Výsledek se nepodařilo zamítnout.');
    } finally {
      setProcessingResultId(null);
    }
  };

  const handleDncResult = async (resultId: string) => {
    if (!ensureToken()) return;
    setProcessingResultId(resultId);
    try {
      await dncSearchResult(token, resultId);
      await refreshResults();
    } catch (e) {
      setAnalyzeWarning(e instanceof Error ? e.message : 'Kontakt se nepodařilo přidat do DO_NOT_CONTACT.');
    } finally {
      setProcessingResultId(null);
    }
  };

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSource(sourceId: string, checked: boolean) {
    if (sourceId === 'APPROVED_WEB_PROVIDER' && !webAvailable) return;
    setForm({
      ...form,
      sources: checked
        ? [...form.sources, sourceId]
        : form.sources.filter((x) => x !== sourceId),
    });
  }

  const rowBusy = (resultId: string) => busy || processingResultId === resultId;

  function formatLocation(r: AiSalesSearchResult) {
    return [r.city, r.region].filter(Boolean).join(', ') || '—';
  }

  function formatSource(r: AiSalesSearchResult) {
    return SOURCE_LABELS[r.source] ?? r.source;
  }

  function formatStatus(r: AiSalesSearchResult) {
    if (r.savedProspectId) return 'Uložen';
    if (r.doNotContact) return 'DNC';
    if (r.verificationStatus === 'DUPLICATE') return 'Duplicita';
    return 'Nový';
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
        <div className="flex flex-col gap-2 text-sm">
          {SEARCH_SOURCES.map((s) => {
            const isWeb = s.id === 'APPROVED_WEB_PROVIDER';
            const disabled = isWeb && !webAvailable;
            return (
              <div key={s.id} className="flex flex-wrap items-center gap-2">
                <label className={`flex items-center gap-1 ${disabled ? 'text-zinc-400' : ''}`}>
                  <input
                    type="checkbox"
                    checked={form.sources.includes(s.id)}
                    disabled={disabled || !providersLoaded}
                    onChange={(e) => toggleSource(s.id, e.target.checked)}
                  />
                  {s.label}
                </label>
                {isWeb && !webAvailable && providersLoaded ? (
                  <>
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Nenakonfigurováno</span>
                    {onOpenSettings ? (
                      <button type="button" className="text-xs underline text-orange-700" onClick={onOpenSettings}>
                        Otevřít nastavení
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
        <button type="button" disabled={busy || processingResultId !== null} onClick={() => void runSearch()} className="rounded bg-orange-600 px-4 py-2 text-sm text-white disabled:opacity-50">
          {busy ? 'Vyhledávám…' : 'Vyhledat partnery'}
        </button>
        {busy && jobStatus ? (
          <p className="text-xs text-zinc-500">Stav: {jobStatus} · průběh {progress}%</p>
        ) : null}
      </div>

      {partialWarning ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Částečný výsledek vyhledávání</p>
          <p className="mt-1">{partialWarning}</p>
          {skippedSources.length > 0 ? (
            <ul className="mt-2 list-disc pl-4 text-xs">
              {skippedSources.map((s) => (
                <li key={`${s.source}-${s.code}`}>{s.message}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {analyzeWarning ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {analyzeWarning}
        </div>
      ) : null}

      {searchError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">Vyhledávání se nepodařilo dokončit</p>
          <p className="mt-1">Kód: <code>{searchError.code}</code> · HTTP {searchError.httpStatus}</p>
          <p className="mt-1">{searchError.message}</p>
          {searchError.code === 'SEARCH_PROVIDER_NOT_CONFIGURED' ? (
            <p className="mt-2 text-xs">Nastavte SERPAPI_API_KEY nebo BING_SEARCH_API_KEY na backendu, nebo použijte interní databázi.</p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-3">
            <button type="button" className="underline" onClick={() => void retryInternalOnly()}>
              Pokračovat pouze s interní databází
            </button>
            <button type="button" className="underline" onClick={() => void runSearch()}>
              Zkusit znovu
            </button>
          </div>
        </div>
      ) : null}

      {results.length === 0 && !busy && !searchError ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-sm text-zinc-600">
          Zadejte kritéria a spusťte vyhledávání. Interní databáze XXREALIT je vždy dostupná; webový provider vyžaduje API klíč.
        </div>
      ) : null}

      {results.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-zinc-600">Nalezeno {results.length} kontaktů</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || processingResultId !== null || selected.size === 0} onClick={() => void bulkSave()} className="rounded border px-3 py-1 text-xs disabled:opacity-50">Uložit vybrané ({selected.size})</button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b bg-zinc-50">
                <tr>
                  <th className="px-2 py-2" />
                  <th className="px-2 py-2">Název / jméno</th>
                  <th className="px-2 py-2">Typ partnera</th>
                  <th className="px-2 py-2">Lokalita</th>
                  <th className="px-2 py-2">E-mail</th>
                  <th className="px-2 py-2">Telefon</th>
                  <th className="px-2 py-2">Web</th>
                  <th className="px-2 py-2">Zdroj</th>
                  <th className="px-2 py-2">Ověření</th>
                  <th className="px-2 py-2">Stav</th>
                  <th className="px-2 py-2">Akce</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id} className="border-b border-zinc-100">
                    <td className="px-2 py-2">
                      <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} disabled={r.doNotContact || r.verificationStatus === 'DUPLICATE'} />
                    </td>
                    <td className="px-2 py-2 font-medium">
                      <div>{r.companyName}</div>
                      {r.contactName ? <div className="text-zinc-500">{r.contactName}</div> : null}
                    </td>
                    <td className="px-2 py-2">{PARTNER_TYPE_LABELS[r.partnerType] ?? r.partnerType}</td>
                    <td className="px-2 py-2">{formatLocation(r)}</td>
                    <td className="px-2 py-2">{r.publicEmail ?? '—'}</td>
                    <td className="px-2 py-2">{r.publicPhone ?? '—'}</td>
                    <td className="px-2 py-2 max-w-[120px] truncate">
                      {r.website ? (
                        <a href={r.website.startsWith('http') ? r.website : `https://${r.website}`} target="_blank" rel="noreferrer" className="underline">
                          {r.website}
                        </a>
                      ) : '—'}
                    </td>
                    <td className="px-2 py-2">{formatSource(r)}</td>
                    <td className="px-2 py-2">
                      <span className={`rounded px-1 ${r.doNotContact ? 'bg-red-100 text-red-800' : 'bg-zinc-100'}`}>{r.verificationStatus}</span>
                    </td>
                    <td className="px-2 py-2">{formatStatus(r)}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        <button type="button" disabled={rowBusy(r.id)} onClick={() => void handleVerifyResult(r.id)} className="underline">
                          {processingResultId === r.id ? '…' : 'Zkontrolovat'}
                        </button>
                        <button type="button" disabled={rowBusy(r.id)} onClick={() => void handleAnalyzeResult(r.id)} className="underline">Analyzovat pomocí AI</button>
                        <button type="button" disabled={rowBusy(r.id) || r.doNotContact || Boolean(r.savedProspectId)} onClick={() => void handleSaveResult(r.id)} className="underline">Uložit jako potenciálního partnera</button>
                        <button type="button" disabled={rowBusy(r.id)} onClick={() => void handleRejectResult(r.id)} className="underline">Zamítnout</button>
                        <button type="button" disabled={rowBusy(r.id)} onClick={() => void handleDncResult(r.id)} className="text-red-700 underline">DNC</button>
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
