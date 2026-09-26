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
  Component,
  type ReactNode,
} from 'react';
import { ArrowLeft, Bot, Loader2, X } from 'lucide-react';
import { useFloatingUiRegister } from '@/components/floating/FloatingUiProvider';
import { FLOATING_Z } from '@/lib/floating-ui-geometry';
import {
  captureAiPropertyFinderLead,
  clearLegacyAiFinderModalState,
  readAiFinderConvenience,
  writeAiFinderConvenience,
  createAiPropertyFinderSession,
  createAiPropertyWatch,
  fetchAiPropertyFinderConfig,
  fetchAiPropertyFinderSession,
  fetchAiPropertyResultDetail,
  formatPropertyPrice,
  getAiFinderVisitorId,
  isFinderApiError,
  placeholderIcon,
  refineAiPropertySearch,
  searchAiProperties,
  trackAiPropertyFinderEvent,
  type AiPropertyFinderSeoContext,
  type PropertyResultDetailPayload,
  type PropertySearchResponse,
  type PropertySearchResult,
} from '@/lib/ai-property-finder-client';

type FinderStep = 'query' | 'email' | 'searching' | 'results' | 'detail';

type FinderContextValue = {
  seoContext: AiPropertyFinderSeoContext;
  enabled: boolean;
  open: boolean;
  sessionId: string | null;
  openFinder: (source: 'cta' | 'auto' | 'fab' | 'reopen') => void;
  closeFinder: () => void;
  handleHeaderClose: () => void;
  resultsScrollRef: React.RefObject<HTMLDivElement | null>;
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

function queryPlaceholders(seoContext: AiPropertyFinderSeoContext): string[] {
  const city = seoContext.locationName;
  return [
    `Rodinný dům ${city} a okolí do 8 milionů`,
    `Chata do 5 mil. Kč do 30 km od ${city}`,
    `Byt 3+kk ${city} do 6 milionů`,
  ];
}

const SEARCH_STEPS = [
  'Rozumím vašemu požadavku',
  'Hledám odpovídající nabídky…',
  'Porovnávám cenu a lokalitu',
  'Připravuji výsledky',
];

type ErrorBoundaryProps = { children: ReactNode; pagePath?: string };

type ErrorBoundaryState = { hasError: boolean };

/** Izolace AI finderu — pád nesmí shodit SEO stránku. */
export class AiPropertyFinderErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error('[AI_PROPERTY_FINDER_RENDER]', {
      pagePath: this.props.pagePath,
      message: error.message,
    });
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export function AiPropertyFinderProvider({
  seoContext,
  children,
}: {
  seoContext: AiPropertyFinderSeoContext;
  children: ReactNode;
}) {
  const convenience = useMemo(() => readAiFinderConvenience(), []);
  const visitorId = useMemo(() => getAiFinderVisitorId(), []);
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const defaultQuery = convenience.lastSearchQuery?.trim() || contextualHeadline(seoContext);
  const [query, setQuery] = useState(defaultQuery);
  const [step, setStep] = useState<FinderStep>('query');
  const [sessionId, setSessionId] = useState<string | null>(convenience.sessionId ?? null);
  const [leadEmailCaptured, setLeadEmailCaptured] = useState(convenience.leadEmailCaptured ?? false);
  const [leadEmail, setLeadEmail] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [response, setResponse] = useState<PropertySearchResponse | null>(null);
  const [detail, setDetail] = useState<PropertyResultDetailPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);
  const [searchProgress, setSearchProgress] = useState(0);
  const [searchProviderConfigured, setSearchProviderConfigured] = useState(false);
  const [watchEmail, setWatchEmail] = useState('');
  const [watchConsent, setWatchConsent] = useState(false);
  const [watchMsg, setWatchMsg] = useState<string | null>(null);
  const dismissedThisPageViewRef = useRef(false);
  const autoOpenedThisLoadRef = useRef(false);
  const resultsScrollRef = useRef<HTMLDivElement | null>(null);
  const savedResultsScrollTopRef = useRef(0);
  const pageScrollLockYRef = useRef(0);

  const persistConvenience = useCallback(
    (patch: Partial<{ sessionId: string | null; lastSearchQuery: string; leadEmailCaptured: boolean }>) => {
      writeAiFinderConvenience({
        sessionId: patch.sessionId !== undefined ? patch.sessionId : sessionId,
        lastSearchQuery: patch.lastSearchQuery !== undefined ? patch.lastSearchQuery : query,
        leadEmailCaptured: patch.leadEmailCaptured !== undefined ? patch.leadEmailCaptured : leadEmailCaptured,
      });
    },
    [leadEmailCaptured, query, sessionId],
  );

  useEffect(() => {
    clearLegacyAiFinderModalState();
  }, []);

  useEffect(() => {
    persistConvenience({});
  }, [persistConvenience]);

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
      persistConvenience({ sessionId: res.sessionId, lastSearchQuery: text });

      trackAiPropertyFinderEvent({
        eventName: 'AI_PROPERTY_FINDER_RESULTS',
        visitorId,
        sessionId: res.sessionId,
        meta: { count: res.results.length, path: seoContext.path },
      });
    },
    [ensureSession, leadEmailCaptured, persistConvenience, seoContext, sessionId, visitorId],
  );

  const resetToEntryForm = useCallback(() => {
    setStep('query');
    setDetail(null);
    setGateError(null);
  }, []);

  const openFinder = useCallback(
    async (source: 'cta' | 'auto' | 'fab' | 'reopen') => {
      if (source === 'auto') {
        resetToEntryForm();
        setResponse(null);
      }
      if (source === 'cta' || source === 'reopen' || source === 'fab') {
        dismissedThisPageViewRef.current = false;
      }
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
    [ensureSession, resetToEntryForm, seoContext.path, sessionId, visitorId],
  );

  useEffect(() => {
    if (!enabled || dismissedThisPageViewRef.current || autoOpenedThisLoadRef.current) return;
    autoOpenedThisLoadRef.current = true;
    const t = window.setTimeout(() => {
      if (dismissedThisPageViewRef.current) return;
      void openFinder('auto');
    }, 500);
    return () => window.clearTimeout(t);
  }, [enabled, openFinder]);

  useEffect(() => {
    if (!open) return;
    pageScrollLockYRef.current = window.scrollY;
    const { style } = document.body;
    const prevOverflow = style.overflow;
    const prevPosition = style.position;
    const prevTop = style.top;
    const prevWidth = style.width;
    style.overflow = 'hidden';
    style.position = 'fixed';
    style.top = `-${pageScrollLockYRef.current}px`;
    style.width = '100%';
    return () => {
      style.overflow = prevOverflow;
      style.position = prevPosition;
      style.top = prevTop;
      style.width = prevWidth;
      window.scrollTo(0, pageScrollLockYRef.current);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (step === 'detail') {
        setStep('results');
        setDetail(null);
        requestAnimationFrame(() => {
          if (resultsScrollRef.current) {
            resultsScrollRef.current.scrollTop = savedResultsScrollTopRef.current;
          }
        });
        return;
      }
      dismissedThisPageViewRef.current = true;
      setOpen(false);
      trackAiPropertyFinderEvent({
        eventName: 'AI_PROPERTY_FINDER_CLOSED',
        visitorId,
        sessionId: sessionId ?? undefined,
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, sessionId, step, visitorId]);

  const closeFinder = useCallback(() => {
    dismissedThisPageViewRef.current = true;
    setOpen(false);
    trackAiPropertyFinderEvent({
      eventName: 'AI_PROPERTY_FINDER_CLOSED',
      visitorId,
      sessionId: sessionId ?? undefined,
    });
  }, [sessionId, visitorId]);

  const handleHeaderClose = useCallback(() => {
    if (step === 'detail') {
      setStep('results');
      setDetail(null);
      requestAnimationFrame(() => {
        if (resultsScrollRef.current) {
          resultsScrollRef.current.scrollTop = savedResultsScrollTopRef.current;
        }
      });
      return;
    }
    closeFinder();
  }, [closeFinder, step]);

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
    persistConvenience({ lastSearchQuery: text });
  }, [leadEmailCaptured, persistConvenience, query, runSearchInternal, seoContext.path, sessionId, visitorId]);

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
    persistConvenience({ leadEmailCaptured: true, sessionId: sid });
    void runSearchInternal(text);
  }, [
    ensureSession,
    leadEmail,
    marketingConsent,
    persistConvenience,
    query,
    runSearchInternal,
    seoContext,
    sessionId,
    visitorId,
  ]);

  const openDetail = useCallback(
    async (row: PropertySearchResult) => {
      if (resultsScrollRef.current) {
        savedResultsScrollTopRef.current = resultsScrollRef.current.scrollTop;
      }
      setStep('detail');
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
    [response?.sessionId, sessionId, visitorId],
  );

  const backToResults = useCallback(() => {
    setStep('results');
    setDetail(null);
    requestAnimationFrame(() => {
      if (resultsScrollRef.current) {
        resultsScrollRef.current.scrollTop = savedResultsScrollTopRef.current;
      }
    });
  }, []);

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
  }, []);

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

  const value: FinderContextValue = {
    seoContext,
    enabled,
    open,
    sessionId,
    openFinder,
    closeFinder,
    handleHeaderClose,
    resultsScrollRef,
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

  return (
    <FinderContext.Provider value={value}>
      {children}
      {enabled ? (
        <>
          <AiPropertyFinderModal />
          <AiPropertyFinderStickyCta />
        </>
      ) : null}
    </FinderContext.Provider>
  );
}

export function AiPropertyFinderHeroBlock() {
  const { openFinder, setQuery, seoContext, enabled } = useAiPropertyFinder();
  if (!enabled) return null;
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
  const detailLayout = showDetail;

  const shellClass = detailLayout
    ? 'flex h-[min(92vh,950px)] w-[min(94vw,1450px)] min-h-[480px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl max-md:fixed max-md:inset-0 max-md:h-[100dvh] max-md:max-h-[100dvh] max-md:w-full max-md:rounded-none'
    : 'flex max-h-[min(92vh,950px)] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[88vh] sm:rounded-2xl md:w-[min(96vw,720px)]';

  return (
    <div
      className="fixed inset-0 flex items-end justify-center bg-black/40 p-0 max-md:p-0 sm:items-center sm:p-6 md:p-8"
      style={{ zIndex: FLOATING_Z.modal }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="AI hledač nemovitostí"
        className={shellClass}
      >
        <div className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-zinc-200 bg-white px-3 py-2.5 max-md:pt-[max(0.5rem,env(safe-area-inset-top))] md:px-4">
          {showDetail ? (
            <button
              type="button"
              onClick={f.backToResults}
              className="flex shrink-0 items-center gap-1 rounded-lg p-2 text-sm font-semibold text-orange-700 hover:bg-orange-50 md:hidden"
              aria-label="Zpět na výsledky"
            >
              <ArrowLeft className="h-5 w-5" />
              <span>Zpět</span>
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-orange-600">🤖 AI hledač</p>
            <h2 className="truncate text-base font-bold text-zinc-900 md:text-lg">
              {showDetail
                ? 'Detail nabídky'
                : f.step === 'query'
                  ? 'Co hledáte?'
                  : f.step === 'email'
                    ? 'Ještě e-mail'
                    : 'Hledání na míru'}
            </h2>
          </div>
          <button
            type="button"
            onClick={f.handleHeaderClose}
            className="shrink-0 rounded-lg p-2 hover:bg-zinc-100"
            aria-label={showDetail ? 'Zavřít detail' : 'Zavřít'}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          ref={detailLayout ? undefined : f.resultsScrollRef}
          className={`flex min-h-0 flex-1 flex-col overscroll-contain ${detailLayout ? 'overflow-hidden px-0 py-0' : 'overflow-y-auto px-4 py-4'}`}
        >
          {showDetail && f.detail ? (
            <DetailView
              payload={f.detail}
              onBack={f.backToResults}
              visitorId={visitorId}
              sessionId={f.sessionId ?? f.response?.sessionId}
            />
          ) : null}
          {showDetail && !f.detail && f.busy ? (
            <Loader2 className="mx-auto my-8 h-8 w-8 animate-spin text-orange-600" />
          ) : null}

          {!showDetail && f.step === 'query' ? (
            <>
              <p className="text-sm text-zinc-600">Popište, jakou nemovitost hledáte. AI prohledá XXREALIT i další dostupné zdroje.</p>
              <ul className="mt-3 space-y-1 text-xs italic text-zinc-500">
                {queryPlaceholders(f.seoContext).map((ex) => (
                  <li key={ex}>„{ex}"</li>
                ))}
              </ul>
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
                Najít nabídky pomocí AI
              </button>
              <p className="mt-3 text-xs text-zinc-500">
                Hledáme na XXREALIT
                {f.searchProviderConfigured ? ' i v dalších dostupných veřejných zdrojích.' : '.'}
              </p>
            </>
          ) : null}

          {!showDetail && f.step === 'email' ? (
            <>
              <p className="text-base font-semibold text-zinc-900">Kam vám můžeme případně poslat nové nabídky?</p>
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
                {f.busy ? 'Ukládám…' : 'Pokračovat v hledání'}
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

function ListingFallbackContent({
  row,
  d,
  title,
  images,
  bodyOnly = false,
}: {
  row: PropertySearchResult;
  d: PropertyResultDetailPayload['detail'];
  title: string;
  images: string[];
  bodyOnly?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-4 pb-6 pt-2 md:px-6">
      {images.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {images.map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="" className="h-48 w-auto max-w-full rounded-xl object-cover md:h-56" />
          ))}
        </div>
      ) : (
        <div className="flex h-36 items-center justify-center rounded-xl bg-orange-50 text-4xl md:h-48">
          {placeholderIcon(title)}
        </div>
      )}
      {!bodyOnly ? (
        <>
          <h3 className="mt-4 text-xl font-bold text-zinc-900">{title}</h3>
          <p className="mt-1 text-lg font-semibold text-orange-600">
            {formatPropertyPrice(d?.price ?? row.price, d?.currency ?? row.currency)}
          </p>
          {(d?.location ?? row.location) ? (
            <p className="text-sm text-zinc-600">{d?.location ?? row.location}</p>
          ) : null}
        </>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-600">
        {(d?.disposition ?? row.disposition) ? <span>Dispozice: {d?.disposition ?? row.disposition}</span> : null}
        {(d?.area ?? row.area) ? <span>Plocha: {d?.area ?? row.area} m²</span> : null}
      </div>
      {(d?.description ?? row.descriptionSnippet) ? (
        <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
          {d?.description ?? row.descriptionSnippet}
        </p>
      ) : null}
      {d?.contactName || d?.contactPhone ? (
        <p className="mt-4 text-sm text-zinc-800">
          Kontakt: {[d?.contactName, d?.contactPhone].filter(Boolean).join(' · ')}
        </p>
      ) : null}
      {!bodyOnly ? (
        <p className="mt-4 text-xs text-zinc-500">
          {row.isInternal ? 'XXREALIT' : 'Externí nabídka'} · Zdroj: {row.source}
        </p>
      ) : (
        <p className="mt-4 text-xs text-zinc-500">Náhled portálu nelze vložit — zobrazujeme dostupná data.</p>
      )}
    </div>
  );
}

function ExternalListingEmbed({ url, fallback }: { url: string; fallback: ReactNode }) {
  const [embedState, setEmbedState] = useState<'pending' | 'shown' | 'blocked'>('pending');
  const timeoutRef = useRef<number | null>(null);

  const clearEmbedTimeout = useCallback(() => {
    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    setEmbedState('pending');
    clearEmbedTimeout();
    timeoutRef.current = window.setTimeout(() => {
      setEmbedState((prev) => (prev === 'pending' ? 'blocked' : prev));
    }, 5000);
    return () => clearEmbedTimeout();
  }, [url, clearEmbedTimeout]);

  if (!url.startsWith('https://') || embedState === 'blocked') {
    return <>{fallback}</>;
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-zinc-50">
      {embedState === 'pending' ? (
        <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center bg-white/80">
          <Loader2 className="h-8 w-8 animate-spin text-orange-600" aria-hidden />
        </div>
      ) : null}
      <iframe
        title="Náhled nabídky"
        src={url}
        className="min-h-0 w-full flex-1 border-0 bg-white"
        referrerPolicy="no-referrer"
        onLoad={() => {
          clearEmbedTimeout();
          setEmbedState('shown');
        }}
        onError={() => {
          clearEmbedTimeout();
          setEmbedState('blocked');
        }}
      />
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
  const location = d?.location ?? row.location;
  const embedUrl = row.isExternal && row.sourceUrl.startsWith('https://') ? row.sourceUrl : null;

  const fallback = (
    <ListingFallbackContent row={row} d={d} title={title} images={images} bodyOnly={Boolean(embedUrl)} />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-zinc-100 bg-white px-4 py-3 md:px-6">
        <button
          type="button"
          onClick={onBack}
          className="mb-2 hidden items-center gap-1 text-sm font-semibold text-orange-700 hover:underline md:flex"
        >
          <ArrowLeft className="h-4 w-4" /> Zpět na výsledky
        </button>
        <h3 className="text-lg font-bold leading-snug text-zinc-900 md:text-xl">{title}</h3>
        <p className="mt-1 text-base font-semibold text-orange-600 md:text-lg">
          {formatPropertyPrice(d?.price ?? row.price, d?.currency ?? row.currency)}
        </p>
        {location ? <p className="mt-0.5 text-sm text-zinc-600">{location}</p> : null}
        <p className="mt-2 text-xs text-zinc-500">
          {row.isInternal ? 'XXREALIT' : 'Externí nabídka'} · Zdroj: {row.source}
        </p>
        {row.isInternal && d?.sourceUrl ? (
          <Link
            href={d.sourceUrl}
            className="mt-3 inline-block text-sm font-semibold text-orange-700 underline"
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
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {embedUrl ? (
          <ExternalListingEmbed url={embedUrl} fallback={fallback} />
        ) : (
          fallback
        )}
      </div>
    </div>
  );
}

function AiPropertyFinderStickyCta() {
  const { open, openFinder } = useAiPropertyFinder();
  const stackRef = useFloatingUiRegister('ai-finder-cta', 3);
  if (open) return null;
  return (
    <div
      ref={stackRef}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[535]"
      data-floating-ui
      data-floating-ui-id="ai-finder-cta"
      style={{ zIndex: FLOATING_Z.aiFinderCta }}
    >
      <button
        type="button"
        onClick={() => void openFinder('reopen')}
        className="pointer-events-auto fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] hidden max-w-[260px] rounded-2xl border-2 border-orange-300 bg-white px-4 py-3 text-left shadow-2xl hover:border-orange-400 lg:block"
      >
        <span className="text-2xl" aria-hidden>
          🤖
        </span>
        <span className="mt-1 block text-sm font-bold text-zinc-900">Nenašli jste vhodnou nemovitost?</span>
        <span className="mt-2 block rounded-xl bg-orange-600 px-3 py-2 text-center text-xs font-bold text-white">
          Najít nemovitost pomocí AI
        </span>
      </button>
      <button
        type="button"
        onClick={() => void openFinder('reopen')}
        className="pointer-events-auto fixed inset-x-4 rounded-2xl bg-orange-600 px-4 py-3.5 text-center text-sm font-bold text-white shadow-2xl hover:bg-orange-700 lg:hidden"
        style={{
          bottom: 'max(0.75rem, env(safe-area-inset-bottom))',
        }}
      >
        🤖 Najít nemovitost pomocí AI
      </button>
    </div>
  );
}

export function AiPropertyFinderWidget({ seoContext }: { seoContext: AiPropertyFinderSeoContext }) {
  return (
    <AiPropertyFinderProvider seoContext={seoContext}>
      <AiPropertyFinderHeroBlock />
    </AiPropertyFinderProvider>
  );
}
