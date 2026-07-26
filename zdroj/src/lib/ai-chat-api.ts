import { API_BASE_URL } from '@/lib/api';

export type AiChatMessage = {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';
  content: string;
  createdAt: string;
  structuredPayload?: { type: string; items?: AiChatPropertyCard[] } | null;
  success: boolean;
};

export type AiChatPropertyCard = {
  id: string;
  slug: string | null;
  title: string;
  city: string;
  layout: string | null;
  area: number | null;
  priceHidden: boolean;
  priceLabel: string | null;
  imageUrl: string | null;
  path: string;
  reason?: string;
};

export type AiChatConfig = {
  enabled: boolean;
  greeting: string;
  openDelaySeconds: number;
  greetingDelaySeconds: number;
  doNotReopenMinutes: number;
  maxMessageLength: number;
};

const SESSION_KEY = 'xxrealit_ai_chat_session';

export function getStoredSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(SESSION_KEY);
}

export function storeSessionId(id: string) {
  localStorage.setItem(SESSION_KEY, id);
}

export async function fetchAiChatConfig(pageType?: string, path?: string): Promise<AiChatConfig | null> {
  if (!API_BASE_URL) return null;
  const params = new URLSearchParams();
  if (pageType) params.set('pageType', pageType);
  if (path) params.set('path', path);
  const qs = params.toString();
  try {
    const res = await fetch(`${API_BASE_URL}/ai-chat/config${qs ? `?${qs}` : ''}`);
    if (!res.ok) return null;
    return (await res.json()) as AiChatConfig;
  } catch {
    return null;
  }
}

async function chatFetch<T>(
  path: string,
  init?: RequestInit,
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init?.headers as Record<string, string>) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE_URL}/ai-chat${path}`, { ...init, headers });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message ?? `Chyba ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function createAiChatSession(
  body: { sourcePageType?: string; sourceUrl?: string; sourceEntityId?: string },
  token?: string | null,
) {
  return chatFetch<{ publicSessionId: string; greeting: AiChatMessage }>(
    '/sessions',
    { method: 'POST', body: JSON.stringify(body) },
    token,
  );
}

export async function sendAiChatMessage(
  publicSessionId: string,
  content: string,
  token?: string | null,
) {
  return chatFetch<{ message: AiChatMessage; properties: AiChatPropertyCard[] }>(
    `/sessions/${encodeURIComponent(publicSessionId)}/messages`,
    { method: 'POST', body: JSON.stringify({ content }) },
    token,
  );
}

export async function submitAiChatFeedback(
  publicSessionId: string,
  body: { messageId: string; rating: 'UP' | 'DOWN'; category?: string; comment?: string },
  token?: string | null,
) {
  return chatFetch(
    `/sessions/${encodeURIComponent(publicSessionId)}/feedback`,
    { method: 'POST', body: JSON.stringify(body) },
    token,
  );
}

export async function requestAiChatContact(
  publicSessionId: string,
  body: {
    name?: string;
    email?: string;
    phone?: string;
    consentStorage: boolean;
    consentTransfer: boolean;
    consentContact: boolean;
  },
  token?: string | null,
) {
  return chatFetch(
    `/sessions/${encodeURIComponent(publicSessionId)}/request-contact`,
    { method: 'POST', body: JSON.stringify(body) },
    token,
  );
}

export const AI_CHAT_QUICK_ACTIONS = [
  'Hledám nemovitost',
  'Chci prodat nemovitost',
  'Chci pronajmout nemovitost',
  'Jsem makléř',
  'Mám realitní kancelář',
  'Mám stavební firmu',
  'Jsem investor',
  'Potřebuji podporu',
] as const;
