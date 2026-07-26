import { API_BASE_URL } from '@/lib/api';
import { nestAuthHeaders } from '@/lib/nest-client';

export type AiChatTestState = 'IDLE' | 'LOADING' | 'SUCCESS' | 'ERROR';

export type AiChatDiagnostics = {
  backend: { available: boolean };
  database: { available: boolean };
  openAi: {
    openAiEnabledEnv: boolean;
    globallyEnabled: boolean;
    chatEnabled: boolean;
    publicChatEnabled: boolean;
    testModeEnabled: boolean;
    supportEnabled: boolean;
    seoEnabled: boolean;
    adminTestEnabled: boolean;
    apiKeyConfigured: boolean;
    modelConfigured: boolean;
    model: string | null;
  };
  disabledReasons: string[];
  lastSuccessfulTest: string | null;
  lastError: string | null;
  lastErrorCode: string | null;
  usage: {
    requestsToday: number;
    dailyLimit: number;
    estimatedCostCzkMonth: number;
    monthlyBudgetCzk: number;
  };
};

export type AiChatTestSuccess = {
  success: true;
  reply: string;
  intent: string | null;
  confidence: number | null;
  model: string;
  durationMs: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
};

export type AiChatAdminError = {
  success: false;
  fallback?: false;
  code: string;
  message: string;
  httpStatus?: number;
  technicalContext?: Record<string, string | number | boolean | null>;
};

export type AiChatApiError = {
  name: string;
  httpStatus: number;
  code: string;
  message: string;
  technicalContext?: Record<string, string | number | boolean | null>;
};

const REQUEST_TIMEOUT_MS = 60_000;

async function adminAiChatRequest<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE_URL}/admin/ai-chat${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        ...nestAuthHeaders(token),
        'Content-Type': 'application/json',
        ...(init?.headers as Record<string, string> | undefined),
      },
    });

    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    if (!res.ok) {
      const errBody = body as Partial<AiChatAdminError> | null;
      const code = errBody?.code ?? (res.status === 401 ? 'UNAUTHORIZED' : 'UNKNOWN_AI_ERROR');
      const message =
        res.status === 401
          ? 'Přihlášení vypršelo.'
          : res.status === 403
            ? errBody?.message ?? 'Testovací AI chat může používat pouze administrátor.'
            : errBody?.message ?? `Chyba ${res.status}`;

      const error: AiChatApiError = {
        name: 'AiChatApiError',
        httpStatus: res.status,
        code,
        message,
        technicalContext: errBody?.technicalContext,
      };
      throw error;
    }

    return body as T;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      const error: AiChatApiError = {
        name: 'AiChatApiError',
        httpStatus: 504,
        code: 'OPENAI_TIMEOUT',
        message: 'Požadavek vypršel (timeout 60 s).',
      };
      throw error;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export function getAiChatDiagnostics(token: string) {
  return adminAiChatRequest<AiChatDiagnostics>(token, '/diagnostics');
}

export function testAiChatConnection(token: string) {
  return adminAiChatRequest<AiChatTestSuccess | AiChatAdminError>(token, '/test-connection', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function runAiChatAdminTest(token: string, message: string) {
  return adminAiChatRequest<AiChatTestSuccess>(token, '/test', {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export type AiKnowledgeItem = {
  id: string;
  title: string;
  category: string;
  question: string;
  answer: string;
  keywordsJson?: string[] | null;
  priority: number;
  status: string;
  source: string;
  version: number;
  updatedAt: string;
};

export type AiPromptItem = {
  id: string;
  name: string | null;
  feature: string;
  version: string;
  systemPrompt: string;
  status: string;
  changeDescription: string | null;
  activatedAt: string | null;
  updatedAt: string;
};

export const PROMPT_TYPES = [
  'MAIN_CHAT', 'INTENT_CLASSIFICATION', 'PROPERTY_SEARCH', 'AGENT_REGISTRATION',
  'AGENCY_COOPERATION', 'CONSTRUCTION_COMPANY', 'INVESTOR', 'SELL_PROPERTY',
  'RENT_PROPERTY', 'SUPPORT', 'LEAD_QUALIFICATION', 'CONVERSATION_SUMMARY',
  'QUALITY_EVALUATION', 'PROFILE_EXTRACTION',
] as const;

export const KNOWLEDGE_CATEGORIES = [
  'PORTAL_GENERAL', 'REGISTRATION', 'LISTINGS', 'AGENTS', 'AGENCIES',
  'CONSTRUCTION_COMPANIES', 'INVESTORS', 'CREDITS', 'PAYMENTS', 'PRIVACY',
  'SUPPORT', 'SEO', 'SOCIAL_NETWORKS', 'COOPERATION', 'PROPERTY_SEARCH',
  'SELL_PROPERTY', 'RENT_PROPERTY',
] as const;

export function listAiKnowledge(token: string, qs?: string) {
  return adminAiChatRequest<AiKnowledgeItem[]>(token, `/knowledge${qs ? `?${qs}` : ''}`);
}

export function createAiKnowledge(token: string, body: Record<string, unknown>) {
  return adminAiChatRequest<AiKnowledgeItem>(token, '/knowledge', { method: 'POST', body: JSON.stringify(body) });
}

export function updateAiKnowledge(token: string, id: string, body: Record<string, unknown>) {
  return adminAiChatRequest<AiKnowledgeItem>(token, `/knowledge/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

export function approveAiKnowledge(token: string, id: string) {
  return adminAiChatRequest<AiKnowledgeItem>(token, `/knowledge/${id}/approve`, { method: 'POST', body: '{}' });
}

export function archiveAiKnowledge(token: string, id: string) {
  return adminAiChatRequest<AiKnowledgeItem>(token, `/knowledge/${id}/archive`, { method: 'POST', body: '{}' });
}

export function duplicateAiKnowledge(token: string, id: string) {
  return adminAiChatRequest<AiKnowledgeItem>(token, `/knowledge/${id}/duplicate`, { method: 'POST', body: '{}' });
}

export function testAiKnowledge(token: string, id: string, message: string) {
  return adminAiChatRequest<Record<string, unknown>>(token, `/knowledge/${id}/test`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export function deleteAiKnowledge(token: string, id: string) {
  return adminAiChatRequest<{ success: boolean }>(token, `/knowledge/${id}`, { method: 'DELETE' });
}

export function listAiPrompts(token: string, feature?: string) {
  const qs = feature ? `?feature=${encodeURIComponent(feature)}` : '';
  return adminAiChatRequest<AiPromptItem[]>(token, `/prompts${qs}`);
}

export function createAiPrompt(token: string, body: Record<string, unknown>) {
  return adminAiChatRequest<AiPromptItem>(token, '/prompts', { method: 'POST', body: JSON.stringify(body) });
}

export function updateAiPrompt(token: string, id: string, body: Record<string, unknown>) {
  return adminAiChatRequest<AiPromptItem>(token, `/prompts/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

export function activateAiPrompt(token: string, id: string) {
  return adminAiChatRequest<AiPromptItem>(token, `/prompts/${id}/activate`, { method: 'POST', body: '{}' });
}

export function archiveAiPrompt(token: string, id: string) {
  return adminAiChatRequest<AiPromptItem>(token, `/prompts/${id}/archive`, { method: 'POST', body: '{}' });
}

export function duplicateAiPrompt(token: string, id: string) {
  return adminAiChatRequest<AiPromptItem>(token, `/prompts/${id}/duplicate`, { method: 'POST', body: '{}' });
}

export function testAiPrompt(token: string, id: string, body: { message: string; pageType?: string; userRole?: string }) {
  return adminAiChatRequest<Record<string, unknown>>(token, `/prompts/${id}/test`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function deleteAiPrompt(token: string, id: string) {
  return adminAiChatRequest<{ success: boolean }>(token, `/prompts/${id}`, { method: 'DELETE' });
}

export function restoreAiPrompt(token: string, feature: string) {
  return adminAiChatRequest<AiPromptItem>(token, `/prompts/restore/${encodeURIComponent(feature)}`, {
    method: 'POST',
    body: '{}',
  });
}
