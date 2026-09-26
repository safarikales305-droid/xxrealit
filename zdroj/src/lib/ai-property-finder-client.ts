import { API_BASE_URL } from './api';

export type AiPropertyFinderSeoContext = {
  intentSlug: string;
  locationSlug: string;
  locationName: string;
  intentLabel: string;
  path: string;
};

export type AiPropertyFinderConfig = {
  enabled: boolean;
  popupDelaySec: number;
  popupScrollPercent: number;
  popupOnInteraction: boolean;
  popupAsCtaOnly: boolean;
  searchProviderConfigured?: boolean;
};

export type AiPropertyFinderEventName =
  | 'AI_FINDER_SHOWN'
  | 'AI_FINDER_OPENED'
  | 'AI_SEARCH_STARTED'
  | 'AI_SEARCH_COMPLETED'
  | 'AI_RESULT_CLICKED'
  | 'AI_EXTERNAL_RESULT_CLICKED'
  | 'AI_QUERY_REFINED'
  | 'AI_WATCH_CREATED'
  | 'AI_FINDER_DISMISSED'
  | 'AI_PROPERTY_FINDER_OPEN'
  | 'AI_PROPERTY_FINDER_QUERY'
  | 'AI_PROPERTY_FINDER_EMAIL_REQUESTED'
  | 'AI_PROPERTY_FINDER_LEAD_CREATED'
  | 'AI_PROPERTY_FINDER_SEARCH_STARTED'
  | 'AI_PROPERTY_FINDER_RESULTS'
  | 'AI_PROPERTY_FINDER_RESULT_DETAIL'
  | 'AI_PROPERTY_FINDER_EXTERNAL_CLICK'
  | 'AI_PROPERTY_FINDER_CLOSED'
  | 'AI_PROPERTY_FINDER_REOPENED';

export type PropertySearchResult = {
  id: string;
  source: string;
  sourceType: string;
  sourceUrl: string;
  title: string;
  price?: number | null;
  currency: string;
  location?: string;
  area?: number | null;
  disposition?: string | null;
  descriptionSnippet?: string;
  imageUrl?: string | null;
  imageUsageAllowed: boolean;
  contactDisplayAllowed: boolean;
  contactName?: string | null;
  contactPhone?: string | null;
  isInternal: boolean;
  isExternal: boolean;
  matchScore: number;
  matchReasons: string[];
};

export type PropertySearchResponse = {
  sessionId: string;
  criteriaSummary: string[];
  results: PropertySearchResult[];
  internalCount: number;
  externalCount: number;
  clarifyingQuestion?: string;
  expandSuggestions?: Array<{ id: string; label: string; patch: Record<string, unknown> }>;
  externalDiscoveryConfigured: boolean;
  message?: string;
  criteria?: Record<string, unknown>;
};

export type PropertyResultDetailPayload = {
  result: PropertySearchResult;
  detail: {
    title: string;
    description: string;
    price: number | null;
    currency: string;
    location: string;
    area: number | null;
    disposition: string | null;
    images: string[];
    contactName: string | null;
    contactPhone: string | null;
    sourceUrl: string;
  } | null;
};

export type FinderApiError = { ok: false; status: number; message: string };

const DISMISS_KEY = 'xxrealit.ai-finder.dismissed-until';
/** @deprecated modal UI state — do not restore step/detail on page load */
export const AI_FINDER_UI_STATE_KEY = 'xxrealit.ai-finder.ui';
export const AI_FINDER_CONVENIENCE_KEY = 'xxrealit.ai-finder.convenience';

export type AiFinderConvenienceState = {
  sessionId: string | null;
  lastSearchQuery: string;
  leadEmailCaptured: boolean;
};

export function readAiFinderConvenience(): Partial<AiFinderConvenienceState> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(AI_FINDER_CONVENIENCE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as AiFinderConvenienceState;
  } catch {
    return {};
  }
}

export function writeAiFinderConvenience(state: AiFinderConvenienceState): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(AI_FINDER_CONVENIENCE_KEY, JSON.stringify(state));
    sessionStorage.removeItem(AI_FINDER_UI_STATE_KEY);
  } catch {
    /* ignore */
  }
}

export function clearLegacyAiFinderModalState(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(AI_FINDER_UI_STATE_KEY);
  } catch {
    /* ignore */
  }
}

export function readAiFinderDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const until = Number.parseInt(localStorage.getItem(DISMISS_KEY) ?? '0', 10);
    return until > Date.now();
  } catch {
    return false;
  }
}

export function dismissAiFinder(days = 7): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + days * 24 * 60 * 60 * 1000));
  } catch {
    /* ignore */
  }
}

export function getAiFinderVisitorId(): string {
  if (typeof window === 'undefined') return 'ssr';
  try {
    const key = 'xxr_visitor_id';
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID?.() ?? `v_${Date.now()}`;
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return `v_${Date.now()}`;
  }
}

async function finderFetch<T>(path: string, init?: RequestInit): Promise<T | FinderApiError | null> {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      let message = res.statusText;
      try {
        const body = (await res.json()) as { message?: string | string[] };
        if (typeof body.message === 'string') message = body.message;
        else if (Array.isArray(body.message)) message = body.message.join(', ');
      } catch {
        /* ignore */
      }
      return { ok: false, status: res.status, message };
    }
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function isFinderApiError(v: unknown): v is FinderApiError {
  return Boolean(v && typeof v === 'object' && 'ok' in v && (v as FinderApiError).ok === false);
}

export function fetchAiPropertyFinderConfig() {
  return finderFetch<AiPropertyFinderConfig>('/public/ai-property-finder/config');
}

export function trackAiPropertyFinderEvent(input: {
  eventName: AiPropertyFinderEventName;
  visitorId?: string;
  sessionId?: string;
  meta?: Record<string, unknown>;
}) {
  void finderFetch('/public/ai-property-finder/event', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function createAiPropertyFinderSession(input: {
  visitorId?: string;
  sourcePage?: string;
  seoContext?: AiPropertyFinderSeoContext;
}) {
  return finderFetch<{ sessionId: string; leadEmailCaptured: boolean; contextualPrompt?: string | null }>(
    '/public/ai-property-finder/session',
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export function fetchAiPropertyFinderSession(sessionId: string) {
  return finderFetch<{ sessionId: string; leadEmailCaptured: boolean; resultsCount: number }>(
    `/public/ai-property-finder/session/${encodeURIComponent(sessionId)}`,
  );
}

export function captureAiPropertyFinderLead(input: {
  sessionId: string;
  email: string;
  query: string;
  marketingConsent?: boolean;
  visitorId?: string;
  seoContext?: AiPropertyFinderSeoContext;
}) {
  return finderFetch<{
    ok: boolean;
    leadCreated: boolean;
    sessionId: string;
    criteriaSummary: string[];
  }>('/public/ai-property-finder/capture-lead', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function searchAiProperties(input: {
  query: string;
  sessionId?: string;
  visitorId?: string;
  seoContext?: AiPropertyFinderSeoContext;
}) {
  return finderFetch<PropertySearchResponse>('/public/ai-property-finder/search', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function refineAiPropertySearch(input: {
  sessionId: string;
  message: string;
  seoContext?: AiPropertyFinderSeoContext;
  visitorId?: string;
}) {
  return finderFetch<PropertySearchResponse>('/public/ai-property-finder/refine', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchAiPropertyResultDetail(sessionId: string, resultId: string) {
  return finderFetch<PropertyResultDetailPayload>(
    `/public/ai-property-finder/result/${encodeURIComponent(sessionId)}/${encodeURIComponent(resultId)}`,
  );
}

export function createAiPropertyWatch(input: {
  email: string;
  consent: boolean;
  sessionId?: string;
  criteria: Record<string, unknown>;
}) {
  return finderFetch<{ ok: boolean; id: string }>('/public/ai-property-finder/watch', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function placeholderIcon(propertyType?: string): string {
  const t = (propertyType ?? '').toLowerCase();
  if (t.includes('byt')) return '🏢';
  if (t.includes('pozem')) return '🌳';
  if (t.includes('chalup') || t.includes('chat')) return '🏡';
  return '🏠';
}

export function formatPropertyPrice(price: number | null | undefined, currency = 'CZK'): string {
  if (price == null || price <= 0) return 'Cena na dotaz';
  return `${new Intl.NumberFormat('cs-CZ').format(price)} ${currency === 'CZK' ? 'Kč' : currency}`;
}
