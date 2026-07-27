'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  analyzeSearchResult,
  dncSearchResult,
  enrichSearchResult,
  enrichSearchResultsBatch,
  getSearch,
  getSearchResultContacts,
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
  type AiSalesPublicContact,
  type AiSalesSearchProviderInfo,
  type AiSalesSearchResult,
  type EnrichmentResult,
} from '@/lib/ai-sales-admin-api';

type Props = {
  token: string;
  onSaved?: () => void;
  onOpenSettings?: () => void;
};

type SkippedSource = { source: string; code: string; message: string };

type ContactSelection = {
  selectedContactIds: string[];
  primaryEmailContactId: string | null;
  primaryPhoneContactId: string | null;
};

const EMPTY_CONTACT_SELECTION: ContactSelection = {
  selectedContactIds: [],
  primaryEmailContactId: null,
  primaryPhoneContactId: null,
};

function maskSearchResultId(id: string): string {
  if (id.length <= 10) return id;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

function filterContactsForResult(contacts: AiSalesPublicContact[], resultId: string): AiSalesPublicContact[] {
  return contacts.filter((contact) => contact.searchResultId === resultId);
}

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
  const [savingResultId, setSavingResultId] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<(AiSalesApiError & { message: string }) | null>(null);
  const [analyzeWarning, setAnalyzeWarning] = useState<string | null>(null);
  const [partialWarning, setPartialWarning] = useState<string | null>(null);
  const [skippedSources, setSkippedSources] = useState<SkippedSource[]>([]);
  const [searchId, setSearchId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<AiSalesSearchResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [contactPreview, setContactPreview] = useState<{
    resultId: string;
    companyName: string;
    contacts: AiSalesPublicContact[];
    visitedPages: EnrichmentResult['visitedPages'];
  } | null>(null);
  const [contactSelectionByResult, setContactSelectionByResult] = useState<Record<string, ContactSelection>>({});
  const [contactMismatch, setContactMismatch] = useState<{
    resultId: string;
    message: string;
    validContactIds: string[];
    invalidContactIds: string[];
  } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<{
    resultId: string;
    prospectId: string;
    savedContacts: number;
    emailsSaved: number;
    phonesSaved: number;
    primaryEmail: string | null;
    primaryPhone: string | null;
    action: string;
  } | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

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

  const getSelectionForResult = useCallback(
    (resultId: string): ContactSelection => contactSelectionByResult[resultId] ?? EMPTY_CONTACT_SELECTION,
    [contactSelectionByResult],
  );

  const setSelectionForResult = useCallback((resultId: string, patch: Partial<ContactSelection>) => {
    setContactSelectionByResult((prev) => ({
      ...prev,
      [resultId]: { ...(prev[resultId] ?? EMPTY_CONTACT_SELECTION), ...patch },
    }));
  }, []);

  function initContactSelection(resultId: string, contacts: AiSalesPublicContact[]) {
    const validContacts = filterContactsForResult(contacts, resultId);
    const ids = validContacts.map((c) => c.id);
    setSelectionForResult(resultId, {
      selectedContactIds: ids,
      primaryEmailContactId:
        validContacts.find((c) => c.type === 'EMAIL' && c.isPrimary)?.id ??
        validContacts.find((c) => c.type === 'EMAIL')?.id ??
        null,
      primaryPhoneContactId:
        validContacts.find((c) => c.type === 'PHONE' && c.isPrimary)?.id ??
        validContacts.find((c) => c.type === 'PHONE')?.id ??
        null,
    });
  }

  function toggleContactSelection(resultId: string, contactId: string) {
    const current = getSelectionForResult(resultId);
    const selected = new Set(current.selectedContactIds);
    if (selected.has(contactId)) selected.delete(contactId);
    else selected.add(contactId);
    setSelectionForResult(resultId, { selectedContactIds: [...selected] });
  }

  function selectAllContacts(resultId: string, contacts: AiSalesPublicContact[]) {
    const validContacts = filterContactsForResult(contacts, resultId);
    setSelectionForResult(resultId, { selectedContactIds: validContacts.map((c) => c.id) });
  }

  function clearContactSelection(resultId: string) {
    setSelectionForResult(resultId, {
      selectedContactIds: [],
      primaryEmailContactId: null,
      primaryPhoneContactId: null,
    });
  }

  function setPrimaryContact(resultId: string, contactId: string, type: 'EMAIL' | 'PHONE') {
    const current = getSelectionForResult(resultId);
    const selected = new Set(current.selectedContactIds);
    selected.add(contactId);
    if (type === 'EMAIL') {
      setSelectionForResult(resultId, {
        selectedContactIds: [...selected],
        primaryEmailContactId: contactId,
      });
    } else {
      setSelectionForResult(resultId, {
        selectedContactIds: [...selected],
        primaryPhoneContactId: contactId,
      });
    }
  }

  function buildValidSavePayload(
    resultId: string,
    contacts: AiSalesPublicContact[],
    overrideContactIds?: string[],
  ) {
    const validContacts = filterContactsForResult(contacts, resultId);
    const selection = getSelectionForResult(resultId);
    const sourceIds = overrideContactIds ?? selection.selectedContactIds;
    const validSelectedContactIds = sourceIds.filter((id) => validContacts.some((c) => c.id === id));

    let primaryEmailContactId = selection.primaryEmailContactId;
    let primaryPhoneContactId = selection.primaryPhoneContactId;
    if (primaryEmailContactId && !validSelectedContactIds.includes(primaryEmailContactId)) {
      primaryEmailContactId = null;
    }
    if (primaryPhoneContactId && !validSelectedContactIds.includes(primaryPhoneContactId)) {
      primaryPhoneContactId = null;
    }

    return { validContacts, validSelectedContactIds, primaryEmailContactId, primaryPhoneContactId };
  }

  async function bulkSave() {
    if (!ensureToken()) return;
    setBusy(true);
    try {
      for (const id of selected) {
        const contacts = filterContactsForResult(await getSearchResultContacts(token, id), id);
        await saveSearchResult(token, id, {
          selectedContactIds: contacts.map((c) => c.id),
          primaryEmailContactId: contacts.find((c) => c.type === 'EMAIL' && c.isPrimary)?.id,
          primaryPhoneContactId: contacts.find((c) => c.type === 'PHONE' && c.isPrimary)?.id,
        });
      }
      onSaved?.();
      await refreshResults();
    } catch (e) {
      captureSearchError(e, 'Hromadné uložení se nezdařilo.');
    } finally {
      setBusy(false);
    }
  }

  async function bulkEnrich() {
    if (!ensureToken() || selected.size === 0) return;
    setBusy(true);
    try {
      await enrichSearchResultsBatch(token, [...selected]);
      await refreshResults();
    } catch (e) {
      captureSearchError(e, 'Hromadné dohledání kontaktů selhalo.');
    } finally {
      setBusy(false);
    }
  }

  const handleEnrichResult = async (resultId: string) => {
    if (!ensureToken()) return;
    const resultRow = results.find((r) => r.id === resultId);
    setEnrichingId(resultId);
    setAnalyzeWarning(null);
    setContactMismatch(null);
    try {
      const res = await enrichSearchResult(token, resultId);
      if (res.searchResultId && res.searchResultId !== resultId) {
        setAnalyzeWarning('Odpověď dohledání neodpovídá vybrané firmě. Zkuste to znovu.');
        return;
      }

      const rawContacts =
        res.contacts.length > 0
          ? (res.contacts as AiSalesPublicContact[])
          : await getSearchResultContacts(token, resultId);
      const contacts = filterContactsForResult(
        rawContacts.map((c) => ({ ...c, searchResultId: c.searchResultId ?? resultId })),
        resultId,
      );

      setContactPreview({
        resultId,
        companyName: resultRow?.companyName ?? '—',
        contacts,
        visitedPages: res.visitedPages ?? [],
      });
      initContactSelection(resultId, contacts);
      await refreshResults();
    } catch (e) {
      setAnalyzeWarning(e instanceof Error ? e.message : 'Dohledání kontaktů selhalo.');
    } finally {
      setEnrichingId(null);
    }
  };

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

  const handleSaveResult = async (
    resultId: string,
    forceWithoutContacts = false,
    overrideContactIds?: string[],
  ) => {
    if (!ensureToken()) return;
    if (!resultId) {
      setSearchError({
        message: 'Chybí výsledek vyhledávání.',
        code: 'INVALID_REQUEST',
        httpStatus: 400,
        success: false,
      });
      return;
    }

    const contacts =
      contactPreview?.resultId === resultId
        ? contactPreview.contacts
        : filterContactsForResult(await getSearchResultContacts(token, resultId), resultId);

    const validContactsList = filterContactsForResult(contacts, resultId);
    const contactIdsSource =
      overrideContactIds ??
      (contactPreview?.resultId === resultId
        ? getSelectionForResult(resultId).selectedContactIds
        : validContactsList.map((c) => c.id));

    let { validContacts, validSelectedContactIds, primaryEmailContactId, primaryPhoneContactId } =
      buildValidSavePayload(resultId, contacts, contactIdsSource);

    if (contactPreview?.resultId !== resultId) {
      primaryEmailContactId =
        validContacts.find((c) => c.type === 'EMAIL' && c.isPrimary)?.id ??
        validContacts.find((c) => c.type === 'EMAIL')?.id ??
        null;
      primaryPhoneContactId =
        validContacts.find((c) => c.type === 'PHONE' && c.isPrimary)?.id ??
        validContacts.find((c) => c.type === 'PHONE')?.id ??
        null;
      if (primaryEmailContactId && !validSelectedContactIds.includes(primaryEmailContactId)) {
        primaryEmailContactId = null;
      }
      if (primaryPhoneContactId && !validSelectedContactIds.includes(primaryPhoneContactId)) {
        primaryPhoneContactId = null;
      }
    }

    if (!forceWithoutContacts && validContacts.length > 0 && validSelectedContactIds.length === 0) {
      const ok = window.confirm(
        'Nevybrali jste žádný kontakt. Partner bude uložen bez e-mailu a telefonu. Pokračovat?',
      );
      if (!ok) return;
    }

    setProcessingResultId(resultId);
    setSavingResultId(resultId);
    setAnalyzeWarning(null);
    setSaveSuccess(null);
    setContactMismatch(null);
    try {
      const res = await saveSearchResult(token, resultId, {
        selectedContactIds: forceWithoutContacts ? [] : validSelectedContactIds,
        primaryEmailContactId: primaryEmailContactId ?? undefined,
        primaryPhoneContactId: primaryPhoneContactId ?? undefined,
      });

      if (res.analysisUnavailable) {
        const w = res.warning;
        setAnalyzeWarning(typeof w === 'object' && w?.message ? w.message : 'AI analýza je dočasně nedostupná.');
      }

      setSaveSuccess({
        resultId,
        prospectId: res.prospectId,
        savedContacts: res.savedContacts,
        emailsSaved: res.emailsSaved ?? 0,
        phonesSaved: res.phonesSaved ?? 0,
        primaryEmail: res.primaryEmail,
        primaryPhone: res.primaryPhone,
        action: res.action,
      });
      setSaveNotice(null);
      if (contactPreview?.resultId === resultId) {
        setContactPreview(null);
      }

      onSaved?.();
      await refreshResults();
    } catch (e) {
      const err = e as Error & AiSalesApiError;
      if (err.code === 'CONTACT_RESULT_MISMATCH') {
        setContactMismatch({
          resultId,
          message: err.message || 'Některé vybrané kontakty nepatří k ukládané firmě.',
          validContactIds: err.validContactIds ?? [],
          invalidContactIds: err.invalidContactIds ?? [],
        });
        return;
      }
      setSearchError({
        message: err.message || 'Partnera se nepodařilo uložit.',
        code: err.code ?? 'SAVE_PROSPECT_FAILED',
        httpStatus: err.httpStatus ?? 500,
        success: false,
        phase: err.phase ?? 'SAVE_PROSPECT_WITH_CONTACTS',
      });
    } finally {
      setProcessingResultId(null);
      setSavingResultId(null);
    }
  };

  async function reloadContactsForResult(resultId: string) {
    if (!ensureToken()) return;
    const resultRow = results.find((r) => r.id === resultId);
    const contacts = filterContactsForResult(await getSearchResultContacts(token, resultId), resultId);
    setContactPreview({
      resultId,
      companyName: resultRow?.companyName ?? contactPreview?.companyName ?? '—',
      contacts,
      visitedPages: contactPreview?.resultId === resultId ? contactPreview.visitedPages : [],
    });
    initContactSelection(resultId, contacts);
    setContactMismatch(null);
  }

  function clearInvalidContactSelection(resultId: string) {
    const mismatch = contactMismatch?.resultId === resultId ? contactMismatch : null;
    if (!mismatch) return;
    setSelectionForResult(resultId, { selectedContactIds: mismatch.validContactIds });
    if (contactPreview?.resultId === resultId) {
      setContactPreview({
        ...contactPreview,
        contacts: filterContactsForResult(contactPreview.contacts, resultId),
      });
    }
    setContactMismatch(null);
  }

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

  const rowBusy = (resultId: string) =>
    busy || processingResultId === resultId || enrichingId === resultId || savingResultId === resultId;

  function formatLocation(r: AiSalesSearchResult) {
    return [r.city, r.region].filter(Boolean).join(', ') || '—';
  }

  function formatSource(r: AiSalesSearchResult) {
    return SOURCE_LABELS[r.source] ?? r.source;
  }

  function formatStatus(r: AiSalesSearchResult) {
    if (r.savedProspectId) return 'ULOŽENO';
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

      {savingResultId ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          Ukládám partnera a kontakty…
        </div>
      ) : null}

      {saveSuccess ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          <p className="font-semibold">Partner byl uložen ({saveSuccess.action === 'UPDATED' ? 'aktualizován' : 'vytvořen'})</p>
          <p>Uloženo kontaktů: {saveSuccess.savedContacts}</p>
          <p>Uloženo e-mailů: {saveSuccess.emailsSaved}</p>
          <p>Uloženo telefonů: {saveSuccess.phonesSaved}</p>
          <p>Primární e-mail: {saveSuccess.primaryEmail ?? '—'}</p>
          <p>Primární telefon: {saveSuccess.primaryPhone ?? '—'}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <a
              href={`/admin/marketing/ai-sales?tab=prospects&prospectId=${saveSuccess.prospectId}`}
              className="rounded border border-green-300 bg-white px-3 py-1 text-xs"
            >
              Otevřít partnera
            </a>
            <a
              href={`/admin/marketing/ai-sales?tab=message&prospectId=${saveSuccess.prospectId}`}
              className="rounded bg-orange-600 px-3 py-1 text-xs text-white"
            >
              Vytvořit nabídku
            </a>
          </div>
        </div>
      ) : null}

      {saveNotice ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{saveNotice}</div>
      ) : null}

      {contactMismatch ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">Výběr kontaktů obsahoval údaje jiné firmy.</p>
          <p className="mt-1">{contactMismatch.message}</p>
          <p className="mt-1 text-xs">
            Neplatných kontaktů: {contactMismatch.invalidContactIds.length} · Platných:{' '}
            {contactMismatch.validContactIds.length}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded border border-amber-400 bg-white px-3 py-1 text-xs"
              onClick={() => clearInvalidContactSelection(contactMismatch.resultId)}
            >
              Vyčistit neplatné kontakty
            </button>
            <button
              type="button"
              className="rounded border border-amber-400 bg-white px-3 py-1 text-xs"
              onClick={() => void reloadContactsForResult(contactMismatch.resultId)}
            >
              Načíst kontakty znovu
            </button>
            <button
              type="button"
              className="rounded bg-green-600 px-3 py-1 text-xs text-white"
              onClick={() =>
                void handleSaveResult(contactMismatch.resultId, false, contactMismatch.validContactIds)
              }
            >
              Uložit pouze platné kontakty
            </button>
            <button
              type="button"
              className="rounded border px-3 py-1 text-xs"
              onClick={() => setContactMismatch(null)}
            >
              Zrušit
            </button>
          </div>
        </div>
      ) : null}

      {contactPreview ? (
        (() => {
          const previewResultId = contactPreview.resultId;
          const validContacts = filterContactsForResult(contactPreview.contacts, previewResultId);
          const selection = getSelectionForResult(previewResultId);
          const selectedCount = selection.selectedContactIds.filter((id) =>
            validContacts.some((c) => c.id === id),
          ).length;
          const savedRow = results.find((r) => r.id === previewResultId);

          return (
        <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-semibold">Nalezené kontakty a zdroje</p>
            <button
              type="button"
              className="text-xs underline"
              onClick={() => {
                setContactPreview(null);
                setContactMismatch(null);
              }}
            >
              Zavřít
            </button>
          </div>
          <div className="mb-3 rounded border border-zinc-100 bg-zinc-50 p-2 text-xs text-zinc-700">
            <p>
              <span className="font-medium">Firma:</span> {contactPreview.companyName}
            </p>
            <p>
              <span className="font-medium">Search result ID:</span>{' '}
              <code>{maskSearchResultId(previewResultId)}</code>
            </p>
            <p>
              <span className="font-medium">Nalezeno kontaktů pro tuto firmu:</span> {validContacts.length}
            </p>
            <p>
              <span className="font-medium">Vybráno:</span> {selectedCount}
            </p>
          </div>
          {contactPreview.visitedPages.length > 0 ? (
            <div className="mb-3">
              <p className="text-xs font-medium text-zinc-600">Navštívené stránky ({contactPreview.visitedPages.length})</p>
              <ul className="mt-1 list-disc pl-4 text-xs">
                {contactPreview.visitedPages.map((p) => (
                  <li key={p.url}>
                    <a href={p.url} target="_blank" rel="noreferrer" className="underline">
                      {p.title || p.url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {validContacts.length === 0 ? (
            <p className="text-zinc-600">Veřejný e-mail ani telefon nebyly na webu nalezeny.</p>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  className="rounded border px-2 py-0.5"
                  onClick={() => selectAllContacts(previewResultId, validContacts)}
                >
                  Vybrat vše
                </button>
                <button
                  type="button"
                  className="rounded border px-2 py-0.5"
                  onClick={() => clearContactSelection(previewResultId)}
                >
                  Zrušit výběr
                </button>
              </div>
              <ul className="space-y-2">
                {validContacts.map((c) => (
                  <li key={c.id} className="rounded border border-zinc-100 bg-zinc-50 p-2">
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={selection.selectedContactIds.includes(c.id)}
                        onChange={() => toggleContactSelection(previewResultId, c.id)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <p className="font-medium">
                          {c.type}: {c.value}
                          {c.isPrimary ? ' · primární' : ''}
                          {selection.primaryEmailContactId === c.id ? ' · primární e-mail' : ''}
                          {selection.primaryPhoneContactId === c.id ? ' · primární telefon' : ''}
                        </p>
                        {c.label ? <p className="text-xs text-zinc-600">{c.label}</p> : null}
                        {c.sourceUrl ? (
                          <p className="text-xs text-zinc-600">
                            Zdroj:{' '}
                            <a href={c.sourceUrl} target="_blank" rel="noreferrer" className="underline">
                              {c.sourceUrl}
                            </a>
                          </p>
                        ) : null}
                        {c.sourceTextSnippet ? (
                          <p className="mt-1 text-xs text-zinc-500">„{c.sourceTextSnippet}“</p>
                        ) : null}
                        <div className="mt-1 flex flex-wrap gap-2 text-xs">
                          {c.type === 'EMAIL' ? (
                            <button
                              type="button"
                              className="underline"
                              onClick={() => setPrimaryContact(previewResultId, c.id, 'EMAIL')}
                            >
                              Nastavit jako primární e-mail
                            </button>
                          ) : null}
                          {c.type === 'PHONE' ? (
                            <button
                              type="button"
                              className="underline"
                              onClick={() => setPrimaryContact(previewResultId, c.id, 'PHONE')}
                            >
                              Nastavit jako primární telefon
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={rowBusy(previewResultId)}
                onClick={() => void handleSaveResult(previewResultId)}
                className="mt-3 rounded bg-green-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {savingResultId === previewResultId
                  ? 'Ukládám partnera a kontakty…'
                  : savedRow?.savedProspectId
                    ? `Aktualizovat vybrané kontakty a partnera (${selectedCount})`
                    : `Uložit vybrané kontakty a partnera (${selectedCount})`}
              </button>
            </>
          )}
        </div>
          );
        })()
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
            <button type="button" disabled={busy || enrichingId !== null || selected.size === 0} onClick={() => void bulkEnrich()} className="rounded border border-orange-200 bg-orange-50 px-3 py-1 text-xs text-orange-900 disabled:opacity-50">Dohledat kontakty u vybraných ({selected.size})</button>
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
                      <span className={`rounded px-1 ${r.doNotContact ? 'bg-red-100 text-red-800' : 'bg-zinc-100'}`}>
                        {r.contactVerificationStatus ?? r.verificationStatus}
                      </span>
                    </td>
                    <td className="px-2 py-2">{formatStatus(r)}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        <button type="button" disabled={rowBusy(r.id) || !r.website} onClick={() => void handleEnrichResult(r.id)} className="rounded border border-orange-200 bg-orange-50 px-2 py-0.5 text-orange-900">
                          {enrichingId === r.id ? '…' : 'Dohledat kontakty'}
                        </button>
                        <button type="button" disabled={rowBusy(r.id)} onClick={() => void handleVerifyResult(r.id)} className="rounded border px-2 py-0.5">
                          Zkontrolovat
                        </button>
                        <button type="button" disabled={rowBusy(r.id)} onClick={() => void handleAnalyzeResult(r.id)} className="rounded border px-2 py-0.5">
                          Analyzovat
                        </button>
                        <button
                          type="button"
                          disabled={rowBusy(r.id) || r.doNotContact}
                          onClick={() => void handleSaveResult(r.id)}
                          className="rounded border px-2 py-0.5 bg-green-50 border-green-200 disabled:opacity-50"
                        >
                          {r.savedProspectId ? 'Aktualizovat partnera' : 'Uložit partnera'}
                        </button>
                        <button type="button" disabled={rowBusy(r.id)} onClick={() => void handleRejectResult(r.id)} className="rounded border px-2 py-0.5">
                          Zamítnout
                        </button>
                        <button type="button" disabled={rowBusy(r.id)} onClick={() => void handleDncResult(r.id)} className="rounded border border-red-200 px-2 py-0.5 text-red-700">
                          DNC
                        </button>
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
