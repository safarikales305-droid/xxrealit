import { HttpException } from '@nestjs/common';
import { SeoAiHttpException } from './seo-ai.errors';

export type SeoAiJobItemError = {
  code: string;
  message: string;
  phase: string;
  httpStatus: number;
  technicalContext?: Record<string, string | number | boolean | null>;
};

const RETRYABLE_CODES = new Set([
  'OPENAI_TIMEOUT',
  'OPENAI_CONNECTION_ERROR',
  'OPENAI_RATE_LIMITED',
  'OPENAI_QUOTA_EXCEEDED',
  'DATABASE_ERROR',
  'DATABASE_TRANSACTION_TIMEOUT',
]);

export function isRetryableSeoAiError(code: string): boolean {
  return RETRYABLE_CODES.has(code);
}

export function extractSeoAiJobError(err: unknown, phase = 'AI_GENERATION'): SeoAiJobItemError {
  if (err instanceof SeoAiHttpException) {
    const body = err.getResponse();
    const o = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    const technicalContext: Record<string, string | number | boolean | null> = {};
    for (const [k, v] of Object.entries(o)) {
      if (['code', 'message', 'phase', 'success'].includes(k)) continue;
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null) {
        technicalContext[k] = v;
      }
    }
    return {
      code: String(o.code ?? 'AI_GENERATION_FAILED'),
      message: String(o.message ?? err.message),
      phase: String(o.phase ?? phase),
      httpStatus: err.getStatus(),
      technicalContext: Object.keys(technicalContext).length ? technicalContext : undefined,
    };
  }

  if (err instanceof HttpException) {
    const res = err.getResponse();
    const msg =
      typeof res === 'string'
        ? res
        : typeof res === 'object' && res !== null && 'message' in res
          ? String((res as { message: unknown }).message)
          : err.message;
    return {
      code: 'INVALID_REQUEST',
      message: msg,
      phase,
      httpStatus: err.getStatus(),
    };
  }

  const msg = err instanceof Error ? err.message : String(err);
  if (/LOCALITY_NOT_FOUND|Lokalita nenalezena/i.test(msg)) {
    return { code: 'LOCALITY_NOT_FOUND', message: msg, phase: 'LOCALITY_RESOLUTION', httpStatus: 400 };
  }
  if (/prompt|SEO_PAGE_GENERATION/i.test(msg) && /not found|chybí|missing/i.test(msg)) {
    return { code: 'ACTIVE_PROMPT_NOT_FOUND', message: msg, phase: 'PROMPT_LOAD', httpStatus: 400 };
  }
  if (/prisma|P1001|P2024|database/i.test(msg)) {
    return { code: 'DATABASE_ERROR', message: msg, phase: 'DATABASE_SAVE', httpStatus: 503 };
  }

  return { code: 'AI_GENERATION_FAILED', message: msg || 'Neznámá chyba.', phase, httpStatus: 500 };
}
