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
