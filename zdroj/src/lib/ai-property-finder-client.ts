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

const DISMISS_KEY = 'xxrealit.ai-finder.dismissed-until';

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

async function finderFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export function fetchAiPropertyFinderConfig() {
  return finderFetch<AiPropertyFinderConfig>('/public/ai-property-finder/config');
}

export function trackAiPropertyFinderEvent(input: {
  eventName: string;
  visitorId?: string;
  sessionId?: string;
  meta?: Record<string, unknown>;
}) {
  void finderFetch('/public/ai-property-finder/event', {
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
}) {
  return finderFetch<PropertySearchResponse>('/public/ai-property-finder/refine', {
    method: 'POST',
    body: JSON.stringify(input),
  });
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
