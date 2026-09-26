'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MapPin, X } from 'lucide-react';
import {
  createAiPropertyWatch,
  dismissAiFinder,
  fetchAiPropertyFinderConfig,
  formatPropertyPrice,
  getAiFinderVisitorId,
  placeholderIcon,
  readAiFinderDismissed,
  refineAiPropertySearch,
  searchAiProperties,
  trackAiPropertyFinderEvent,
  type AiPropertyFinderSeoContext,
  type PropertySearchResponse,
  type PropertySearchResult,
} from '@/lib/ai-property-finder-client';

type Props = {
  seoContext: AiPropertyFinderSeoContext;
};

function contextualHeadline(ctx: AiPropertyFinderSeoContext): string {
  const type =
    ctx.intentSlug.includes('byt') ? 'byt' : ctx.intentSlug.includes('dom') ? 'dům' : ctx.intentSlug.includes('chat') ? 'chalupu' : 'nemovitost';
  const tx = ctx.intentSlug.startsWith('pronajem') ? 'pronájem' : 'prodej';
  return `Hledáte ${type} v ${ctx.locationName}?`;
}

export function AiPropertyFinderWidget({ seoContext }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [autoShown, setAutoShown] = useState(false);
  const [query, setQuery] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [response, setResponse] = useState<PropertySearchResponse | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [watchEmail, setWatchEmail] = useState('');
  const [watchConsent, setWatchConsent] = useState(false);
  const [watchMsg, setWatchMsg] = useState<string | null>(null);
  const [searchProviderConfigured, setSearchProviderConfigured] = useState(false);
  const visitorId = useMemo(() => getAiFinderVisitorId(), []);
  const scrollTracked = useRef(false);

  const headline = useMemo(() => contextualHeadline(seoContext), [seoContext]);

  useEffect(() => {
    void fetchAiPropertyFinderConfig().then((cfg) => {
      if (!cfg?.enabled) return;
      setEnabled(true);
      setSearchProviderConfigured(cfg.searchProviderConfigured === true);
    });
  }, []);

  const openFinder = useCallback(
    (source: 'cta' | 'auto' | 'fab') => {
      setOpen(true);
      trackAiPropertyFinderEvent({
        eventName: source === 'auto' ? 'AI_FINDER_SHOWN' : 'AI_FINDER_OPENED',
        visitorId,
        sessionId: sessionId ?? undefined,
        meta: { path: seoContext.path, source },
      });
    },
    [seoContext.path, sessionId, visitorId],
  );

  useEffect(() => {
    if (!enabled || readAiFinderDismissed()) return;
    let timer: number | undefined;
    let cfg: Awaited<ReturnType<typeof fetchAiPropertyFinderConfig>> | null = null;

    const onScroll = () => {
      if (scrollTracked.current || !cfg || cfg.popupAsCtaOnly) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const pct = max > 0 ? (window.scrollY / max) * 100 : 0;
      if (pct >= cfg.popupScrollPercent) {
        scrollTracked.current = true;
        if (!autoShown && !readAiFinderDismissed()) {
          setAutoShown(true);
          openFinder('auto');
        }
      }
    };

    void fetchAiPropertyFinderConfig().then((loaded) => {
      cfg = loaded;
      if (!loaded?.enabled || loaded.popupAsCtaOnly) return;
      window.addEventListener('scroll', onScroll, { passive: true });
      timer = window.setTimeout(() => {
        if (!autoShown && !readAiFinderDismissed()) {
          setAutoShown(true);
          openFinder('auto');
        }
      }, loaded.popupDelaySec * 1000);
    });

    return () => {
      if (timer != null) window.clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
    };
  }, [autoShown, enabled, openFinder]);

  async function runSearch(text: string, refine = false) {
    setBusy(true);
    setWatchMsg(null);
    const res = refine && sessionId
      ? await refineAiPropertySearch({ sessionId, message: text, seoContext })
      : await searchAiProperties({ query: text, sessionId: sessionId ?? undefined, visitorId, seoContext });
    setBusy(false);
    if (!res) return;
    setSessionId(res.sessionId);
    setResponse(res);
    trackAiPropertyFinderEvent({
      eventName: refine ? 'AI_QUERY_REFINED' : 'AI_SEARCH_COMPLETED',
      visitorId,
      sessionId: res.sessionId,
      meta: { count: res.results.length, path: seoContext.path },
    });
  }

  function closePopup() {
    setOpen(false);
    dismissAiFinder(7);
    trackAiPropertyFinderEvent({
      eventName: 'AI_FINDER_DISMISSED',
      visitorId,
      sessionId: sessionId ?? undefined,
    });
  }

  function onResultClick(row: PropertySearchResult) {
    trackAiPropertyFinderEvent({
      eventName: row.isExternal ? 'AI_EXTERNAL_RESULT_CLICKED' : 'AI_RESULT_CLICKED',
      visitorId,
      sessionId: sessionId ?? undefined,
      meta: { id: row.id, source: row.source },
    });
  }

  async function submitWatch() {
    if (!response?.criteria) return;
    const res = await createAiPropertyWatch({
      email: watchEmail,
      consent: watchConsent,
      sessionId: response.sessionId,
      criteria: response.criteria,
    });
    if (res?.ok) {
      setWatchMsg('Hlídání uloženo — pošleme upozornění na nové nabídky.');
      trackAiPropertyFinderEvent({
        eventName: 'AI_WATCH_CREATED',
        visitorId,
        sessionId: response.sessionId,
      });
    }
  }

  if (!enabled) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => openFinder('fab')}
        className="fixed bottom-5 right-5 z-40 rounded-full bg-orange-600 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-orange-700 md:bottom-8 md:right-8"
      >
        🤖 AI – Najít nemovitost
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="AI hledač nemovitostí"
            className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[88vh] sm:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">🤖 AI hledač nemovitostí</p>
                <h2 className="text-lg font-bold text-zinc-900">Hledáte nemovitost v této lokalitě?</h2>
              </div>
              <button type="button" onClick={closePopup} className="rounded-lg p-2 hover:bg-zinc-100" aria-label="Zavřít">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {!response ? (
                <>
                  <p className="text-sm text-zinc-600">{headline}</p>
                  <p className="mt-2 text-sm text-zinc-600">
                    Napište nám, co přesně hledáte. AI XXREALIT prohledá dostupné nabídky a připraví vám přehled.
                  </p>
                  <textarea
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    rows={3}
                    placeholder="Např. rodinný dům do 5 mil. Kč, zahrada, min. 100 m²"
                    className="mt-4 w-full rounded-xl border border-zinc-300 px-3 py-3 text-sm"
                  />
                  <button
                    type="button"
                    disabled={busy || !query.trim()}
                    onClick={() => {
                      trackAiPropertyFinderEvent({
                        eventName: 'AI_SEARCH_STARTED',
                        visitorId,
                        meta: { path: seoContext.path },
                      });
                      void runSearch(query.trim());
                    }}
                    className="mt-3 w-full rounded-xl bg-orange-600 py-3 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50"
                  >
                    {busy ? 'Hledám…' : '🔎 NAJÍT NEMOVITOSTI'}
                  </button>
                  <p className="mt-3 text-xs text-zinc-500">
                    Hledáme na XXREALIT
                    {searchProviderConfigured ? ' i v dalších dostupných veřejných zdrojích.' : ' (externí vyhledávání vyžaduje search provider v backendu).'}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-base font-semibold text-zinc-900">
                    🤖 AI XXREALIT našla {response.results.length} odpovídajících nabídek
                  </p>
                  {response.criteriaSummary.length ? (
                    <ul className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-600">
                      {response.criteriaSummary.map((line) => (
                        <li key={line} className="rounded-full bg-zinc-100 px-2 py-1">
                          {line}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {response.message ? <p className="mt-2 text-sm text-zinc-600">{response.message}</p> : null}
                  {response.clarifyingQuestion ? (
                    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{response.clarifyingQuestion}</p>
                  ) : null}

                  <div className="mt-4 flex gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setViewMode('list')}
                      className={`rounded-full px-3 py-1 ${viewMode === 'list' ? 'bg-orange-100 text-orange-800' : 'bg-zinc-100'}`}
                    >
                      SEZNAM
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('map')}
                      className={`rounded-full px-3 py-1 ${viewMode === 'map' ? 'bg-orange-100 text-orange-800' : 'bg-zinc-100'}`}
                    >
                      MAPA
                    </button>
                  </div>

                  {viewMode === 'map' ? (
                    <div className="mt-4 flex h-40 items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50 text-sm text-zinc-500">
                      <MapPin className="mr-2 h-4 w-4" /> Mapa zobrazí výsledky se souřadnicemi (postupné doplnění).
                    </div>
                  ) : (
                    <ul className="mt-4 space-y-3">
                      {response.results.map((row) => (
                        <li key={row.id} className="rounded-xl border border-zinc-200 p-3">
                          <div className="flex gap-3">
                            <div className="flex h-20 w-24 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-2xl">
                              {row.imageUrl && row.imageUsageAllowed ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={row.imageUrl} alt="" className="h-full w-full rounded-lg object-cover" />
                              ) : (
                                placeholderIcon(row.title)
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-zinc-900">{row.title}</p>
                              <p className="text-sm text-zinc-600">{row.location}</p>
                              <p className="mt-1 text-sm font-semibold text-orange-600">{formatPropertyPrice(row.price, row.currency)}</p>
                              <p className="text-xs text-emerald-700">✓ odpovídá {row.matchScore} %</p>
                              <p className="text-[11px] text-zinc-500">{row.matchReasons.map((r) => `✓ ${r}`).join(' · ')}</p>
                              <p className="mt-1 text-[11px] text-zinc-500">
                                {row.isInternal ? 'XXREALIT' : `Externí nabídka · Zdroj: ${row.source}`}
                              </p>
                              {row.isInternal ? (
                                <Link
                                  href={row.sourceUrl}
                                  onClick={() => onResultClick(row)}
                                  className="mt-2 inline-block text-sm font-semibold text-orange-700 underline"
                                >
                                  ZOBRAZIT NABÍDKU
                                </Link>
                              ) : (
                                <a
                                  href={row.sourceUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={() => onResultClick(row)}
                                  className="mt-2 inline-block text-sm font-semibold text-orange-700 underline"
                                >
                                  OTEVŘÍT PŮVODNÍ INZERÁT
                                </a>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {response.expandSuggestions?.length ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {response.expandSuggestions.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className="rounded-lg border border-orange-300 px-3 py-1 text-xs font-medium text-orange-800"
                          onClick={() => void runSearch(s.label, true)}
                        >
                          {s.label}
                        </button>
                      ))}
                      <button type="button" className="rounded-lg border px-3 py-1 text-xs" onClick={() => setResponse(null)}>
                        UPRAVIT POŽADAVKY
                      </button>
                    </div>
                  ) : null}

                  <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    <p className="text-sm font-medium text-zinc-800">Chcete, aby vám AI hlídala nové nabídky?</p>
                    <input
                      type="email"
                      value={watchEmail}
                      onChange={(e) => setWatchEmail(e.target.value)}
                      placeholder="E-mail"
                      className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                    />
                    <label className="mt-2 flex items-center gap-2 text-xs text-zinc-600">
                      <input type="checkbox" checked={watchConsent} onChange={(e) => setWatchConsent(e.target.checked)} />
                      Souhlasím s upozorněním na nové nabídky
                    </label>
                    <button
                      type="button"
                      disabled={!watchEmail || !watchConsent}
                      onClick={() => void submitWatch()}
                      className="mt-2 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      HLÍDAT NOVÉ NABÍDKY
                    </button>
                    {watchMsg ? <p className="mt-2 text-xs text-emerald-700">{watchMsg}</p> : null}
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
                      disabled={busy || !chatInput.trim()}
                      onClick={() => {
                        void runSearch(chatInput.trim(), true);
                        setChatInput('');
                      }}
                      className="rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Odeslat'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
