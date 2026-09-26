'use client';

import Link from 'next/link';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ArrowLeft, Bot, Loader2, X } from 'lucide-react';
import {
  AI_FINDER_UI_STATE_KEY,
  captureAiPropertyFinderLead,
  createAiPropertyFinderSession,
  createAiPropertyWatch,
  fetchAiPropertyFinderConfig,
  fetchAiPropertyFinderSession,
  fetchAiPropertyResultDetail,
  formatPropertyPrice,
  getAiFinderVisitorId,
  isFinderApiError,
  placeholderIcon,
  readAiFinderDismissed,
  refineAiPropertySearch,
  searchAiProperties,
  trackAiPropertyFinderEvent,
  type AiPropertyFinderSeoContext,
  type PropertyResultDetailPayload,
  type PropertySearchResponse,
  type PropertySearchResult,
} from '@/lib/ai-property-finder-client';

type FinderStep = 'query' | 'email' | 'searching' | 'results' | 'detail';

type UiPersist = {
  sessionId: string | null;
  query: string;
  step: FinderStep;
  detailId: string | null;
  leadEmailCaptured: boolean;
  response: PropertySearchResponse | null;
};

type FinderContextValue = {
  seoContext: AiPropertyFinderSeoContext;
  enabled: boolean;
  open: boolean;
  sessionId: string | null;
  openFinder: (source: 'cta' | 'auto' | 'fab' | 'reopen') => void;
  closeFinder: () => void;
  query: string;
  setQuery: (q: string) => void;
  submitQuery: () => void;
  leadEmail: string;
  setLeadEmail: (e: string) => void;
  marketingConsent: boolean;
  setMarketingConsent: (v: boolean) => void;
  submitLeadAndSearch: () => void;
  leadEmailCaptured: boolean;
  busy: boolean;
  step: FinderStep;
  response: PropertySearchResponse | null;
  searchProgress: number;
  detail: PropertyResultDetailPayload | null;
  openDetail: (row: PropertySearchResult) => void;
  backToResults: () => void;
  runRefine: (text: string) => void;
  resetToQuery: () => void;
  watchEmail: string;
  setWatchEmail: (e: string) => void;
  watchConsent: boolean;
  setWatchConsent: (v: boolean) => void;
  submitWatch: () => void;
  watchMsg: string | null;
  gateError: string | null;
  searchProviderConfigured: boolean;
};

const FinderContext = createContext<FinderContextValue | null>(null);

function useAiPropertyFinder(): FinderContextValue {
  const ctx = useContext(FinderContext);
  if (!ctx) throw new Error('AiPropertyFinderProvider missing');
  return ctx;
}

function contextualHeadline(ctx: AiPropertyFinderSeoContext): string {
  const type = ctx.intentSlug.includes('byt')
    ? 'byt'
    : ctx.intentSlug.includes('dom')
      ? 'dům'
      : ctx.intentSlug.includes('chat')
        ? 'chalupu'
        : 'nemovitost';
  return `Hledám ${type} v ${ctx.locationName}`;
}

function readPersistedUi(): Partial<UiPersist> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(AI_FINDER_UI_STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<UiPersist>;
  } catch {
    return null;
  }
}

function writePersistedUi(state: UiPersist) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(AI_FINDER_UI_STATE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

const SEARCH_STEPS = [
  'Rozumím vašemu požadavku',
  'Hledám odpovídající nabídky…',
  'Porovnávám cenu a lokalitu',
  'Připravuji výsledky',
];

export function AiPropertyFinderProvider({
  seoContext,
  children,
}: {
  seoContext: AiPropertyFinderSeoContext;
  children: ReactNode;
}) {
  const persisted = useMemo(() => readPersistedUi(), []);
  const visitorId = useMemo(() => getAiFinderVisitorId(), []);
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(persisted?.query ?? contextualHeadline(seoContext));
  const [step, setStep] = useState<FinderStep>(persisted?.step ?? 'query');
  const [sessionId, setSessionId] = useState<string | null>(persisted?.sessionId ?? null);
  const [leadEmailCaptured, setLeadEmailCaptured] = useState(persisted?.leadEmailCaptured ?? false);
  const [leadEmail, setLeadEmail] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [response, setResponse] = useState<PropertySearchResponse | null>(persisted?.response ?? null);
  const [detail, setDetail] = useState<PropertyResultDetailPayload | null>(null);
  const [detailId, setDetailId] = useState<string | null>(persisted?.detailId ?? null);
  const [busy, setBusy] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);
  const [searchProgress, setSearchProgress] = useState(0);
  const [searchProviderConfigured, setSearchProviderConfigured] = useState(false);
  const [watchEmail, setWatchEmail] = useState('');
  const [watchConsent, setWatchConsent] = useState(false);
  const [watchMsg, setWatchMsg] = useState<string | null>(null);
  const scrollTracked = useRef(false);
  const [autoShown, setAutoShown] = useState(false);

  const persist = useCallback(
    (patch: Partial<UiPersist>) => {
      writePersistedUi({
        sessionId,
        query,
        step,
        detailId,
        leadEmailCaptured,
        response,
        ...patch,
      });
    },
    [detailId, leadEmailCaptured, query, response, sessionId, step],
  );

  useEffect(() => {
    persist({});
  }, [persist]);

  useEffect(() => {
    void fetchAiPropertyFinderConfig().then((cfg) => {
      if (!cfg || isFinderApiError(cfg)) return;
      if (!cfg.enabled) return;
      setEnabled(true);
      setSearchProviderConfigured(cfg.searchProviderConfigured === true);
    });
  }, []);

  useEffect(() => {
    if (!sessionId || !leadEmailCaptured) return;
    void fetchAiPropertyFinderSession(sessionId).then((s) => {
      if (!s || isFinderApiError(s)) return;
      setLeadEmailCaptured(s.leadEmailCaptured);
    });
  }, [leadEmailCaptured, sessionId]);

  const ensureSession = useCallback(async () => {
    if (sessionId) return sessionId;
    const created = await createAiPropertyFinderSession({
      visitorId,
      sourcePage: seoContext.path,
      seoContext,
    });
    if (!created || isFinderApiError(created)) return null;
    setSessionId(created.sessionId);
    setLeadEmailCaptured(created.leadEmailCaptured);
    return created.sessionId;
  }, [seoContext, sessionId, visitorId]);

  const runSearchInternal = useCallback(
    async (text: string, refine = false) => {
      setGateError(null);
      setBusy(true);
      setStep('searching');
      setSearchProgress(0);
      const tick = window.setInterval(() => {
        setSearchProgress((p) => Math.min(SEARCH_STEPS.length - 1, p + 1));
      }, 900);

      trackAiPropertyFinderEvent({
        eventName: 'AI_PROPERTY_FINDER_SEARCH_STARTED',
        visitorId,
        sessionId: sessionId ?? undefined,
        meta: { path: seoContext.path, refine },
      });

      const sid = sessionId ?? (await ensureSession());
      const res =
        refine && sid
          ? await refineAiPropertySearch({ sessionId: sid, message: text, seoContext, visitorId })
          : await searchAiProperties({
              query: text,
              sessionId: sid ?? undefined,
              visitorId,
              seoContext,
            });

      window.clearInterval(tick);
      setBusy(false);

      if (!res || isFinderApiError(res)) {
        setGateError(isFinderApiError(res) ? res.message : 'Hledání se nepodařilo. Zkuste to znovu.');
        setStep(leadEmailCaptured ? 'query' : 'email');
        return;
      }

      setSessionId(res.sessionId);
      setResponse(res);
      setStep('results');
      setSearchProgress(SEARCH_STEPS.length);
      persist({ sessionId: res.sessionId, response: res, step: 'results', query: text });

      trackAiPropertyFinderEvent({
        eventName: 'AI_PROPERTY_FINDER_RESULTS',
        visitorId,
        sessionId: res.sessionId,
        meta: { count: res.results.length, path: seoContext.path },
      });
    },
    [ensureSession, leadEmailCaptured, persist, seoContext, sessionId, visitorId],
  );

  const openFinder = useCallback(
    async (source: 'cta' | 'auto' | 'fab' | 'reopen') => {
      setOpen(true);
      await ensureSession();
      const event =
        source === 'reopen'
          ? 'AI_PROPERTY_FINDER_REOPENED'
          : source === 'auto'
            ? 'AI_FINDER_SHOWN'
            : 'AI_PROPERTY_FINDER_OPEN';
      trackAiPropertyFinderEvent({
        eventName: event,
        visitorId,
        sessionId: sessionId ?? undefined,
        meta: { path: seoContext.path, source },
      });
      if (source !== 'auto' && source !== 'reopen') {
        trackAiPropertyFinderEvent({
          eventName: 'AI_PROPERTY_FINDER_OPEN',
          visitorId,
          sessionId: sessionId ?? undefined,
          meta: { path: seoContext.path, source },
        });
      }
    },
    [ensureSession, seoContext.path, sessionId, visitorId],
  );

  useEffect(() => {
    if (!enabled || readAiFinderDismissed()) return;
    let timer: number | undefined;
    let cfg: Awaited<ReturnType<typeof fetchAiPropertyFinderConfig>> | null = null;

    const onScroll = () => {
      if (scrollTracked.current || !cfg || isFinderApiError(cfg) || cfg.popupAsCtaOnly) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const pct = max > 0 ? (window.scrollY / max) * 100 : 0;
      if (pct >= cfg.popupScrollPercent) {
        scrollTracked.current = true;
        if (!autoShown && !readAiFinderDismissed()) {
          setAutoShown(true);
          void openFinder('auto');
        }
      }
    };

    void fetchAiPropertyFinderConfig().then((loaded) => {
      cfg = loaded;
      if (!loaded || isFinderApiError(loaded) || !loaded.enabled || loaded.popupAsCtaOnly) return;
      window.addEventListener('scroll', onScroll, { passive: true });
      timer = window.setTimeout(() => {
        if (!autoShown && !readAiFinderDismissed()) {
          setAutoShown(true);
          void openFinder('auto');
        }
      }, loaded.popupDelaySec * 1000);
    });

    return () => {
      if (timer != null) window.clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
    };
  }, [autoShown, enabled, openFinder]);

  const closeFinder = useCallback(() => {
    setOpen(false);
    trackAiPropertyFinderEvent({
      eventName: 'AI_PROPERTY_FINDER_CLOSED',
      visitorId,
      sessionId: sessionId ?? undefined,
    });
  }, [sessionId, visitorId]);

  const submitQuery = useCallback(() => {
    const text = query.trim();
    if (!text) return;
    setGateError(null);
    trackAiPropertyFinderEvent({
      eventName: 'AI_PROPERTY_FINDER_QUERY',
      visitorId,
      sessionId: sessionId ?? undefined,
      meta: { path: seoContext.path },
    });
    if (leadEmailCaptured) {
      void runSearchInternal(text);
      return;
    }
    setStep('email');
    trackAiPropertyFinderEvent({
      eventName: 'AI_PROPERTY_FINDER_EMAIL_REQUESTED',
      visitorId,
      sessionId: sessionId ?? undefined,
    });
    persist({ step: 'email', query: text });
  }, [leadEmailCaptured, persist, query, runSearchInternal, seoContext.path, sessionId, visitorId]);

  const submitLeadAndSearch = useCallback(async () => {
    const text = query.trim();
    if (!text) return;
    setGateError(null);
    setBusy(true);
    const sid = (await ensureSession()) ?? sessionId;
    if (!sid) {
      setBusy(false);
      setGateError('Relace se nepodařila vytvořit.');
      return;
    }
    const cap = await captureAiPropertyFinderLead({
      sessionId: sid,
      email: leadEmail,
      query: text,
      marketingConsent,
      visitorId,
      seoContext,
    });
    setBusy(false);
    if (!cap || isFinderApiError(cap)) {
      setGateError(isFinderApiError(cap) ? cap.message : 'E-mail se nepodařilo uložit.');
      return;
    }
    if (cap.leadCreated) {
      trackAiPropertyFinderEvent({
        eventName: 'AI_PROPERTY_FINDER_LEAD_CREATED',
        visitorId,
        sessionId: sid,
        meta: { path: seoContext.path, marketingConsent },
      });
    }
    setLeadEmailCaptured(true);
    setWatchEmail(leadEmail);
    persist({ leadEmailCaptured: true, sessionId: sid });
    void runSearchInternal(text);
  }, [
    ensureSession,
    leadEmail,
    marketingConsent,
    persist,
    query,
    runSearchInternal,
    seoContext,
    sessionId,
    visitorId,
  ]);

  const openDetail = useCallback(
    async (row: PropertySearchResult) => {
      setStep('detail');
      setDetailId(row.id);
      persist({ step: 'detail', detailId: row.id });
      trackAiPropertyFinderEvent({
        eventName: 'AI_PROPERTY_FINDER_RESULT_DETAIL',
        visitorId,
        sessionId: sessionId ?? response?.sessionId ?? undefined,
        meta: { id: row.id, source: row.source },
      });
      const sid = sessionId ?? response?.sessionId;
      if (!sid) {
        setDetail({ result: row, detail: null });
        return;
      }
      setBusy(true);
      const payload = await fetchAiPropertyResultDetail(sid, row.id);
      setBusy(false);
      if (!payload || isFinderApiError(payload)) {
        setDetail({ result: row, detail: null });
        return;
      }
      setDetail(payload);
    },
    [persist, response?.sessionId, sessionId, visitorId],
  );

  const backToResults = useCallback(() => {
    setStep('results');
    setDetail(null);
    setDetailId(null);
    persist({ step: 'results', detailId: null });
  }, [persist]);

  const runRefine = useCallback(
    (text: string) => {
      trackAiPropertyFinderEvent({
        eventName: 'AI_QUERY_REFINED',
        visitorId,
        sessionId: sessionId ?? undefined,
      });
      void runSearchInternal(text, true);
    },
    [runSearchInternal, sessionId, visitorId],
  );

  const resetToQuery = useCallback(() => {
    setResponse(null);
    setStep('query');
    persist({ step: 'query', response: null });
  }, [persist]);

  const submitWatch = useCallback(async () => {
    if (!response?.criteria) return;
    const res = await createAiPropertyWatch({
      email: watchEmail,
      consent: watchConsent,
      sessionId: response.sessionId,
      criteria: response.criteria,
    });
    if (res && !isFinderApiError(res) && res.ok) {
      setWatchMsg('Marketingové hlídání uloženo.');
      trackAiPropertyFinderEvent({
        eventName: 'AI_WATCH_CREATED',
        visitorId,
        sessionId: response.sessionId,
      });
    }
  }, [response, visitorId, watchConsent, watchEmail]);

  useEffect(() => {
    if (!open || step !== 'detail' || !detailId || detail || !response) return;
    const row = response.results.find((r) => r.id === detailId);
    if (row) void openDetail(row);
  }, [detail, detailId, open, openDetail, response, step]);

  const value: FinderContextValue = {
    seoContext,
    enabled,
    open,
    sessionId,
    openFinder,
    closeFinder,
    query,
    setQuery,
    submitQuery,
    leadEmail,
    setLeadEmail,
    marketingConsent,
    setMarketingConsent,
    submitLeadAndSearch,
    leadEmailCaptured,
    busy,
    step,
    response,
    searchProgress,
    detail,
    openDetail,
    backToResults,
    runRefine,
    resetToQuery,
    watchEmail,
    setWatchEmail,
    watchConsent,
    setWatchConsent,
    submitWatch,
    watchMsg,
    gateError,
    searchProviderConfigured,
  };

  if (!enabled) return <>{children}</>;

  return (
    <FinderContext.Provider value={value}>
      {children}
      <AiPropertyFinderModal />
      <AiPropertyFinderStickyCta />
    </FinderContext.Provider>
  );
}

export function AiPropertyFinderHeroBlock() {
  const { openFinder, setQuery, seoContext } = useAiPropertyFinder();
  const example = `„Hledám dům v ${seoContext.locationName} do 5 mil. Kč se zahradou“`;

  return (
    <section className="mt-8 overflow-hidden rounded-3xl border-2 border-orange-200 bg-gradient-to-br from-orange-50 via-white to-amber-50 p-6 shadow-md sm:flex sm:items-center sm:gap-6 sm:p-8">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-orange-600 text-white shadow-lg sm:h-20 sm:w-20">
        <Bot className="h-10 w-10 sm:h-12 sm:w-12" strokeWidth={2} aria-hidden />
      </div>
      <div className="mt-4 min-w-0 flex-1 sm:mt-0">
        <p className="text-xs font-bold uppercase tracking-wider text-orange-700">🤖 AI hledač nemovitostí</p>
        <h2 className="mt-1 text-xl font-bold text-zinc-900 sm:text-2xl">Nenašli jste, co hledáte?</h2>
        <p className="mt-2 text-sm text-zinc-700">AI XXREALIT vám pomůže najít nabídky podle vašich požadavků.</p>
        <p className="mt-2 text-sm italic text-zinc-600">{example}</p>
        <button
          type="button"
          onClick={() => {
            setQuery(contextualHeadline(seoContext));
            void openFinder('cta');
          }}
          className="mt-4 w-full rounded-2xl bg-orange-600 px-6 py-4 text-sm font-bold uppercase tracking-wide text-white shadow-lg transition hover:bg-orange-700 sm:w-auto"
        >
          🔎 Najít nemovitost pomocí AI
        </button>
        <p className="mt-3 text-xs text-zinc-500">AI prohledá dostupné nabídky podle vašich požadavků.</p>
      </div>
    </section>
  );
}

function ResultCard({ row, onDetail }: { row: PropertySearchResult; onDetail: () => void }) {
  return (
    <li className="rounded-xl border border-zinc-200 p-3">
      <div className="flex gap-3">
        <div className="flex h-24 w-28 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-2xl">
          {row.imageUrl && row.imageUsageAllowed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.imageUrl} alt="" className="h-full w-full rounded-lg object-cover" />
          ) : (
            placeholderIcon(row.title)
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-zinc-900">{row.title}</p>
          {row.location ? <p className="text-sm text-zinc-600">{row.location}</p> : null}
          <p className="mt-1 text-sm font-semibold text-orange-600">{formatPropertyPrice(row.price, row.currency)}</p>
          {row.descriptionSnippet ? (
            <p className="mt-1 line-clamp-2 text-xs text-zinc-600">{row.descriptionSnippet}</p>
          ) : null}
          <p className="mt-2 text-[11px] font-medium text-zinc-500">
            {row.isInternal ? 'XXREALIT' : 'Externí nabídka'} · Zdroj: {row.source}
          </p>
          <button
            type="button"
            onClick={onDetail}
            className="mt-2 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-700"
          >
            Zobrazit detail
          </button>
        </div>
      </div>
    </li>
  );
}

function AiPropertyFinderModal() {
  const f = useAiPropertyFinder();
  const [chatInput, setChatInput] = useState('');
  const visitorId = useMemo(() => getAiFinderVisitorId(), []);

  if (!f.open) return null;

  const showResults = f.step === 'results' && f.response;
  const showDetail = f.step === 'detail';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="AI hledač nemovitostí"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[88vh] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">🤖 AI hledač nemovitostí</p>
            <h2 className="text-lg font-bold text-zinc-900">Hledání na míru</h2>
          </div>
          <button type="button" onClick={f.closeFinder} className="rounded-lg p-2 hover:bg-zinc-100" aria-label="Zavřít">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {showDetail && f.detail ? (
            <DetailView payload={f.detail} onBack={f.backToResults} visitorId={visitorId} sessionId={f.sessionId ?? f.response?.sessionId} />
          ) : null}
          {showDetail && !f.detail && f.busy ? (
            <Loader2 className="mx-auto my-8 h-8 w-8 animate-spin text-orange-600" />
          ) : null}

          {!showDetail && f.step === 'query' ? (
            <>
              <p className="text-sm text-zinc-600">Napište, co hledáte. AI XXREALIT prohledá dostupné nabídky.</p>
              <textarea
                value={f.query}
                onChange={(e) => f.setQuery(e.target.value)}
                rows={4}
                className="mt-4 w-full rounded-xl border border-zinc-300 px-3 py-3 text-sm"
                placeholder="Např. rodinný dům do 5 mil. Kč, zahrada, min. 100 m²"
              />
              <button
                type="button"
                disabled={f.busy || !f.query.trim()}
                onClick={f.submitQuery}
                className="mt-3 w-full rounded-xl bg-orange-600 py-3 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50"
              >
                Vyhledat nemovitosti
              </button>
              <p className="mt-3 text-xs text-zinc-500">
                Hledáme na XXREALIT
                {f.searchProviderConfigured ? ' i v dalších dostupných veřejných zdrojích.' : '.'}
              </p>
            </>
          ) : null}

          {!showDetail && f.step === 'email' ? (
            <>
              <p className="text-base font-semibold text-zinc-900">Kam vám můžeme poslat nové odpovídající nabídky?</p>
              <input
                type="email"
                value={f.leadEmail}
                onChange={(e) => f.setLeadEmail(e.target.value)}
                placeholder="E-mailová adresa"
                className="mt-4 w-full rounded-xl border border-zinc-300 px-3 py-3 text-sm"
                autoComplete="email"
              />
              <button
                type="button"
                disabled={f.busy || !f.leadEmail.trim()}
                onClick={() => void f.submitLeadAndSearch()}
                className="mt-3 w-full rounded-xl bg-orange-600 py-3 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {f.busy ? 'Ukládám…' : 'Zobrazit nalezené nabídky'}
              </button>
              <label className="mt-4 flex items-start gap-2 text-xs text-zinc-600">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={f.marketingConsent}
                  onChange={(e) => f.setMarketingConsent(e.target.checked)}
                />
                <span>
                  Chci dostávat marketingové tipy a novinky XXREALIT (volitelné, oddělené od zaslání výsledků tohoto
                  hledání).
                </span>
              </label>
              <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
                E-mail použijeme k zobrazení výsledků AI hledání a k zaslání odpovídajících nabídek této služby. Zpracování
                probíhá dle{' '}
                <Link href="/privacy" className="text-orange-700 underline">
                  zásad ochrany osobních údajů XXREALIT
                </Link>
                . Marketingové zprávy zasíláme pouze s vaším výslovným souhlasem výše.
              </p>
            </>
          ) : null}

          {!showDetail && f.step === 'searching' ? (
            <div className="py-6">
              <ul className="space-y-3 text-sm">
                {SEARCH_STEPS.map((label, idx) => {
                  const done = idx < f.searchProgress;
                  const active = idx === f.searchProgress;
                  return (
                    <li key={label} className="flex items-center gap-2 text-zinc-700">
                      <span className={done ? 'text-emerald-600' : active ? 'text-orange-600' : 'text-zinc-400'}>
                        {done ? '✓' : active ? '●' : '○'}
                      </span>
                      {label}
                    </li>
                  );
                })}
              </ul>
              <Loader2 className="mx-auto mt-6 h-8 w-8 animate-spin text-orange-600" />
            </div>
          ) : null}

          {!showDetail && showResults ? (
            <>
              <p className="text-base font-semibold text-zinc-900">
                {f.response!.results.length > 0
                  ? `Našel jsem ${f.response!.results.length} odpovídajících nabídek.`
                  : 'Nenašel jsem přesnou shodu.'}
              </p>
              {f.response!.message ? <p className="mt-2 text-sm text-zinc-600">{f.response!.message}</p> : null}
              {f.response!.results.length === 0 ? (
                <button type="button" onClick={f.resetToQuery} className="mt-4 text-sm font-semibold text-orange-700 underline">
                  Upravit parametry hledání
                </button>
              ) : (
                <ul className="mt-4 space-y-3">
                  {f.response!.results.map((row) => (
                    <ResultCard key={row.id} row={row} onDetail={() => void f.openDetail(row)} />
                  ))}
                </ul>
              )}

              {f.response!.expandSuggestions?.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {f.response!.expandSuggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="rounded-lg border border-orange-300 px-3 py-1 text-xs font-medium text-orange-800"
                      onClick={() => f.runRefine(s.label)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-sm font-medium text-zinc-800">Volitelně: hlídat nové nabídky e-mailem</p>
                <input
                  type="email"
                  value={f.watchEmail}
                  onChange={(e) => f.setWatchEmail(e.target.value)}
                  placeholder="E-mail"
                  className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
                <label className="mt-2 flex items-center gap-2 text-xs text-zinc-600">
                  <input type="checkbox" checked={f.watchConsent} onChange={(e) => f.setWatchConsent(e.target.checked)} />
                  Souhlasím s marketingovými upozorněními na nové nabídky
                </label>
                <button
                  type="button"
                  disabled={!f.watchEmail || !f.watchConsent}
                  onClick={() => void f.submitWatch()}
                  className="mt-2 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Hlídat nové nabídky
                </button>
                {f.watchMsg ? <p className="mt-2 text-xs text-emerald-700">{f.watchMsg}</p> : null}
              </div>

              <div className="mt-4 flex gap-2">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Upřesněte hledání…"
                  className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={f.busy || !chatInput.trim()}
                  onClick={() => {
                    f.runRefine(chatInput.trim());
                    setChatInput('');
                  }}
                  className="rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Odeslat
                </button>
              </div>
            </>
          ) : null}

          {f.gateError ? <p className="mt-3 text-sm text-red-600">{f.gateError}</p> : null}
        </div>
      </div>
    </div>
  );
}

function DetailView({
  payload,
  onBack,
  visitorId,
  sessionId,
}: {
  payload: PropertyResultDetailPayload;
  onBack: () => void;
  visitorId: string;
  sessionId?: string;
}) {
  const row = payload.result;
  const d = payload.detail;
  const title = d?.title ?? row.title;
  const images = d?.images?.length ? d.images : row.imageUrl && row.imageUsageAllowed ? [row.imageUrl] : [];

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 flex items-center gap-1 text-sm font-semibold text-orange-700">
        <ArrowLeft className="h-4 w-4" /> Zpět na výsledky
      </button>
      {images.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {images.map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="" className="h-40 w-auto max-w-full rounded-xl object-cover" />
          ))}
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center rounded-xl bg-orange-50 text-4xl">{placeholderIcon(title)}</div>
      )}
      <h3 className="mt-4 text-xl font-bold text-zinc-900">{title}</h3>
      <p className="mt-1 text-lg font-semibold text-orange-600">
        {formatPropertyPrice(d?.price ?? row.price, d?.currency ?? row.currency)}
      </p>
      {(d?.location ?? row.location) ? <p className="text-sm text-zinc-600">{d?.location ?? row.location}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-600">
        {(d?.disposition ?? row.disposition) ? <span>Dispozice: {d?.disposition ?? row.disposition}</span> : null}
        {(d?.area ?? row.area) ? <span>Plocha: {d?.area ?? row.area} m²</span> : null}
      </div>
      {(d?.description ?? row.descriptionSnippet) ? (
        <p className="mt-4 whitespace-pre-wrap text-sm text-zinc-700">{d?.description ?? row.descriptionSnippet}</p>
      ) : null}
      {d?.contactName || d?.contactPhone ? (
        <p className="mt-4 text-sm text-zinc-800">
          Kontakt: {[d?.contactName, d?.contactPhone].filter(Boolean).join(' · ')}
        </p>
      ) : null}
      <p className="mt-4 text-xs text-zinc-500">
        {row.isInternal ? 'XXREALIT' : 'Externí nabídka'} · Zdroj: {row.source}
      </p>
      {row.isInternal && d?.sourceUrl ? (
        <Link
          href={d.sourceUrl}
          className="mt-4 inline-block text-sm font-semibold text-orange-700 underline"
          onClick={() =>
            trackAiPropertyFinderEvent({
              eventName: 'AI_RESULT_CLICKED',
              visitorId,
              sessionId,
              meta: { id: row.id, intent: 'original_listing' },
            })
          }
        >
          Zobrazit inzerát na XXREALIT
        </Link>
      ) : null}
      {row.isExternal && row.sourceUrl ? (
        <a
          href={row.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-6 inline-block text-sm text-zinc-600 underline"
          onClick={() =>
            trackAiPropertyFinderEvent({
              eventName: 'AI_PROPERTY_FINDER_EXTERNAL_CLICK',
              visitorId,
              sessionId,
              meta: { id: row.id, source: row.source },
            })
          }
        >
          Zobrazit původní inzerát
        </a>
      ) : null}
    </div>
  );
}

function AiPropertyFinderStickyCta() {
  const { open, openFinder } = useAiPropertyFinder();
  if (open) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => void openFinder('reopen')}
        className="fixed bottom-20 right-4 z-40 hidden max-w-[220px] rounded-2xl bg-orange-600 px-4 py-3 text-left text-sm font-bold text-white shadow-xl hover:bg-orange-700 sm:bottom-8 sm:right-8 sm:block"
      >
        <span className="text-lg">🤖</span>
        <span className="mt-1 block leading-tight">Najít nemovitost pomocí AI</span>
      </button>
      <button
        type="button"
        onClick={() => void openFinder('reopen')}
        className="fixed inset-x-4 bottom-4 z-40 rounded-2xl bg-orange-600 px-4 py-3 text-center text-sm font-bold text-white shadow-xl hover:bg-orange-700 sm:hidden"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        🤖 Najít nemovitost pomocí AI
      </button>
    </>
  );
}

export function AiPropertyFinderWidget({ seoContext }: { seoContext: AiPropertyFinderSeoContext }) {
  return (
    <AiPropertyFinderProvider seoContext={seoContext}>
      <AiPropertyFinderHeroBlock />
    </AiPropertyFinderProvider>
  );
}
