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
