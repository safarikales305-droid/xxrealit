import { API_BASE_URL } from './api';
import { getAuthHeaders } from './nest-client';

export type AiVisualizationView = {
  id: string;
  status: 'DRAFT' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number;
  propertyType: string | null;
  style: string | null;
  renovationLevel: 'LIGHT' | 'RENOVATION' | 'MAJOR' | null;
  userPrompt: string | null;
  originalPreviewUrl: string | null;
  resultPreviewUrl: string | null;
  publicShareId: string | null;
  parentId: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type AiVisualizationConfig = {
  enabled: boolean;
  anonymousEnabled: boolean;
  maxUploadBytes: number;
  propertyTypes: Array<{ id: string; label: string; emoji: string }>;
  styles: Array<{ id: string; label: string }>;
  renovationLevels: Array<{ id: string; label: string; description: string }>;
  storageConfigured?: boolean;
  providerReady?: boolean;
};

const SESSION_KEY = 'xxrealit_ai_viz_session';

export function getAiVisualizationAnonymousSessionId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function persistActiveVisualizationId(id: string) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem('xxrealit_ai_viz_active', id);
}

export function readActiveVisualizationId(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('xxrealit_ai_viz_active');
}

async function vizFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (!API_BASE_URL) return null;
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function fetchAiVisualizationConfig() {
  return vizFetch<AiVisualizationConfig>('/public/ai-visualization/config');
}

export const AI_VIZ_MARKETING_CONSENT_LABEL =
  'Souhlasím, že anonymizovaná fotografie před/po může být použita pro prezentaci služby XXREALIT na sociálních sítích.';

const ATTRIBUTION_KEY = 'xxrealit_ai_viz_attribution';

export function persistAiVisualizationAttributionFromUrl() {
  if (typeof window === 'undefined') return;
  const p = new URLSearchParams(window.location.search);
  if (p.get('utm_campaign') !== 'ai_visualization') return;
  sessionStorage.setItem(
    ATTRIBUTION_KEY,
    JSON.stringify({
      utmSource: p.get('utm_source'),
      utmMedium: p.get('utm_medium'),
      utmCampaign: p.get('utm_campaign'),
      utmContent: p.get('utm_content'),
      capturedAt: new Date().toISOString(),
    }),
  );
}

export function readAiVisualizationAttribution(): Record<string, string | null | undefined> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(ATTRIBUTION_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string | null | undefined>) : null;
  } catch {
    return null;
  }
}

export function trackAiVisualizationEvent(input: {
  eventName: string;
  visualizationId?: string;
  anonymousSessionId?: string;
  meta?: Record<string, unknown>;
}) {
  void vizFetch('/public/ai-visualization/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({
      ...input,
      anonymousSessionId: input.anonymousSessionId ?? getAiVisualizationAnonymousSessionId(),
      meta: { ...(readAiVisualizationAttribution() ?? {}), ...(input.meta ?? {}) },
    }),
  });
}

export async function uploadAiVisualizationPhoto(file: File): Promise<AiVisualizationView | { message: string } | null> {
  if (!API_BASE_URL) return null;
  const fd = new FormData();
  fd.append('photo', file);
  fd.append('anonymousSessionId', getAiVisualizationAnonymousSessionId());
  const res = await fetch(`${API_BASE_URL}/public/ai-visualization/upload`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: fd,
  });
  if (!res.ok) {
    try {
      const body = (await res.json()) as { message?: string | string[] };
      const message = typeof body.message === 'string' ? body.message : 'Nahrání se nepodařilo.';
      return { message };
    } catch {
      return { message: 'Nahrání se nepodařilo.' };
    }
  }
  return (await res.json()) as AiVisualizationView;
}

export async function generateAiVisualization(input: {
  visualizationId: string;
  propertyType: string;
  style: string;
  renovationLevel: 'LIGHT' | 'RENOVATION' | 'MAJOR';
  userPrompt?: string;
  idempotencyKey: string;
  parentId?: string;
  marketingConsent?: boolean;
}): Promise<AiVisualizationView | { message: string } | null> {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}/public/ai-visualization/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({
      ...input,
      anonymousSessionId: getAiVisualizationAnonymousSessionId(),
    }),
  });
  if (!res.ok) {
    try {
      const body = (await res.json()) as { message?: string | string[] };
      return { message: typeof body.message === 'string' ? body.message : 'Generování nelze spustit.' };
    } catch {
      return { message: 'Generování nelze spustit.' };
    }
  }
  return (await res.json()) as AiVisualizationView;
}

export function pollAiVisualizationStatus(id: string) {
  const sid = encodeURIComponent(getAiVisualizationAnonymousSessionId());
  return vizFetch<AiVisualizationView>(`/public/ai-visualization/status/${encodeURIComponent(id)}?anonymousSessionId=${sid}`, {
    headers: getAuthHeaders(),
    cache: 'no-store',
  });
}

export async function fetchAiVisualizationSession(): Promise<{ items: AiVisualizationView[] } | null> {
  const sid = encodeURIComponent(getAiVisualizationAnonymousSessionId());
  return vizFetch<{ items: AiVisualizationView[] }>(
    `/public/ai-visualization/session?anonymousSessionId=${sid}`,
    { headers: getAuthHeaders(), cache: 'no-store' },
  );
}

export async function deleteAiVisualizationFromSession(id: string): Promise<boolean> {
  if (!API_BASE_URL) return false;
  const res = await fetch(`${API_BASE_URL}/public/ai-visualization/${encodeURIComponent(id)}/session`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ anonymousSessionId: getAiVisualizationAnonymousSessionId() }),
  });
  return res.ok;
}

export function resolveVisualizationRootId(viz: Pick<AiVisualizationView, 'id' | 'parentId'>): string {
  return viz.parentId ?? viz.id;
}

export type GalleryCard = {
  rootId: string;
  display: AiVisualizationView;
  variantCount: number;
};

/** Jedna karta galerie = jedna nahraná fotografie (root) + nejlepší dokončený výsledek. */
export function buildGalleryCards(items: AiVisualizationView[]): GalleryCard[] {
  const byRoot = new Map<string, AiVisualizationView[]>();
  for (const item of items) {
    const rootId = resolveVisualizationRootId(item);
    const list = byRoot.get(rootId) ?? [];
    list.push(item);
    byRoot.set(rootId, list);
  }
  const cards: GalleryCard[] = [];
  for (const [rootId, group] of byRoot) {
    const completed = group.filter((g) => g.status === 'COMPLETED' && g.resultPreviewUrl);
    const display =
      completed.sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt))[0] ??
      group.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!display) continue;
    cards.push({ rootId, display, variantCount: group.length });
  }
  return cards.sort((a, b) => b.display.createdAt.localeCompare(a.display.createdAt));
}

export function countCompletedRoots(items: AiVisualizationView[]): number {
  return buildGalleryCards(items).filter((c) => c.display.status === 'COMPLETED').length;
}

export async function enableAiVisualizationShare(id: string) {
  return vizFetch<{ publicShareId: string }>(`/public/ai-visualization/${encodeURIComponent(id)}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ anonymousSessionId: getAiVisualizationAnonymousSessionId() }),
  });
}

export async function claimAiVisualization(id: string) {
  return vizFetch<AiVisualizationView>(`/ai-visualization/claim/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ anonymousSessionId: getAiVisualizationAnonymousSessionId() }),
  });
}

export function aiVisualizationDownloadUrl(id: string): string {
  return `${API_BASE_URL}/ai-visualization/download/${encodeURIComponent(id)}`;
}

export async function downloadAiVisualization(id: string): Promise<boolean> {
  const url = aiVisualizationDownloadUrl(id);
  const res = await fetch(url, { headers: getAuthHeaders() });
  if (res.status === 401 || res.status === 403) return false;
  if (!res.ok) return false;
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `xxrealit-vizualizace-${id}.png`;
  a.click();
  URL.revokeObjectURL(a.href);
  return true;
}

export function progressStepLabel(progress: number): string {
  if (progress >= 100) return 'Hotovo';
  if (progress >= 90) return 'Dokončuji vizualizaci…';
  if (progress >= 65) return 'AI vytváří novou podobu…';
  if (progress >= 40) return 'Navrhuji rekonstrukci…';
  if (progress >= 20) return 'Rozpoznávám prostor…';
  return 'Analyzuji fotografii…';
}

export type RenovationLineItem = {
  id: string;
  label: string;
  amountMin: number;
  amountMax: number;
};

export type AiRenovationEstimate = {
  id: string;
  visualizationId: string;
  location: string | null;
  areaSqm: number | null;
  scopePartial: boolean;
  materialTier: 'ECONOMY' | 'STANDARD' | 'PREMIUM';
  lineItems: RenovationLineItem[];
  estimateMin: number;
  estimateMax: number;
  reserveMin: number | null;
  reserveMax: number | null;
  totalMinWithReserve: number | null;
  totalMaxWithReserve: number | null;
  pricingVersion: string;
  region: string | null;
  calculatedAt: string;
};

export type RenovationCompanyOption = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  region: string | null;
  categories: string[];
};

export type AiRenovationRequestResult = {
  id: string;
  publicId: string;
  status: string;
  companiesCount: number;
  poptavkaUrl: string;
};

export function formatCzkAmount(n: number): string {
  return new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 }).format(n);
}

export function formatCzkRange(min: number, max: number): string {
  return `${formatCzkAmount(min)} – ${formatCzkAmount(max)} Kč`;
}

async function renovationFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data: T } | { message: string }> {
  if (!API_BASE_URL) return { message: 'API není dostupné.' };
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
        ...getAuthHeaders(),
      },
    });
    if (!res.ok) {
      try {
        const body = (await res.json()) as { message?: string | string[] };
        const message = Array.isArray(body.message) ? body.message[0] : body.message;
        return { message: message ?? 'Požadavek se nepodařil.' };
      } catch {
        return { message: 'Požadavek se nepodařil.' };
      }
    }
    return { data: (await res.json()) as T };
  } catch {
    return { message: 'Síťová chyba.' };
  }
}

export async function createAiRenovationEstimate(input: {
  visualizationId: string;
  location?: string;
  areaSqm?: number;
  scopePartial?: boolean;
  materialTier?: 'ECONOMY' | 'STANDARD' | 'PREMIUM';
}) {
  return renovationFetch<AiRenovationEstimate>('/public/ai-visualization/renovation/estimate', {
    method: 'POST',
    body: JSON.stringify({
      ...input,
      anonymousSessionId: getAiVisualizationAnonymousSessionId(),
    }),
  });
}

export async function createAiRenovationProjectEstimate(input: {
  primaryVisualizationId: string;
  location?: string;
  areaSqm?: number;
  scopePartial?: boolean;
  materialTier?: 'ECONOMY' | 'STANDARD' | 'PREMIUM';
}) {
  return renovationFetch<AiRenovationEstimate>('/public/ai-visualization/renovation/estimate-project', {
    method: 'POST',
    body: JSON.stringify({
      ...input,
      anonymousSessionId: getAiVisualizationAnonymousSessionId(),
    }),
  });
}

export async function fetchRenovationCompanies(input: { visualizationId: string; location?: string }) {
  const q = new URLSearchParams({ visualizationId: input.visualizationId });
  if (input.location?.trim()) q.set('location', input.location.trim());
  return renovationFetch<{ items: RenovationCompanyOption[] }>(
    `/public/ai-visualization/renovation/companies?${q.toString()}`,
    { method: 'GET', headers: { 'Content-Type': 'application/json' } },
  );
}

export async function sendAiRenovationRequest(input: {
  visualizationId: string;
  estimateId: string;
  email?: string;
  phone?: string;
  companyIds: string[];
  transferConsent: boolean;
  marketingConsent?: boolean;
  idempotencyKey: string;
  description?: string;
}) {
  return renovationFetch<AiRenovationRequestResult>('/public/ai-visualization/renovation/request', {
    method: 'POST',
    body: JSON.stringify({
      ...input,
      anonymousSessionId: getAiVisualizationAnonymousSessionId(),
    }),
  });
}

export type PublicPoptavkaView = {
  publicId: string;
  status: string;
  location: string | null;
  description: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  areaSqm: number | null;
  scopePartial: boolean;
  materialTier: string;
  propertyType: string | null;
  style: string | null;
  renovationLevel: string | null;
  userPrompt: string | null;
  originalPreviewUrl: string | null;
  resultPreviewUrl: string | null;
  lineItems: RenovationLineItem[];
  pricingVersion: string;
  calculatedAt: string;
  contactEmail?: string;
  recipients: Array<{
    id: string;
    companyId: string;
    companyName: string;
    status: string;
    offerPrice: number | null;
    canRespond: boolean;
  }>;
};

export async function fetchPublicPoptavka(publicId: string) {
  return renovationFetch<PublicPoptavkaView>(
    `/public/ai-renovation/poptavka/${encodeURIComponent(publicId)}`,
    { method: 'GET', headers: { 'Content-Type': 'application/json' } },
  );
}

export async function respondToRenovationPoptavka(
  publicId: string,
  input: {
    companyId: string;
    status: 'INTERESTED' | 'NO_CAPACITY' | 'OFFER_SENT';
    offerPrice?: number;
    offerMessage?: string;
  },
) {
  return renovationFetch<{ ok: boolean }>(
    `/public/ai-renovation/poptavka/${encodeURIComponent(publicId)}/respond`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export async function fetchAdminRenovationRequests() {
  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}/admin/ai-visualization/renovation-requests`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) return null;
  return (await res.json()) as {
    items: Array<{
      id: string;
      publicId: string;
      email: string;
      location: string | null;
      propertyType: string | null;
      status: string;
      budgetMin: number | null;
      budgetMax: number | null;
      companiesCount: number;
      responsesCount: number;
      createdAt: string;
    }>;
  };
}
