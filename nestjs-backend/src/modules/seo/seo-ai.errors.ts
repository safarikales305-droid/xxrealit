import { HttpException, HttpStatus } from '@nestjs/common';

export type SeoAiErrorCode =
  | 'LOCALITY_NOT_FOUND'
  | 'LOCALITY_AMBIGUOUS'
  | 'SEO_PAGE_ALREADY_EXISTS'
  | 'OPENAI_DISABLED'
  | 'OPENAI_NOT_CONFIGURED'
  | 'OPENAI_INVALID_KEY'
  | 'OPENAI_QUOTA_EXCEEDED'
  | 'OPENAI_MODEL_NOT_AVAILABLE'
  | 'OPENAI_TIMEOUT'
  | 'OPENAI_CONNECTION_ERROR'
  | 'OPENAI_INVALID_RESPONSE'
  | 'AI_GENERATION_FAILED'
  | 'DATABASE_ERROR'
  | 'INVALID_REQUEST'
  | 'ADMIN_SESSION_EXPIRED'
  | 'INSUFFICIENT_PERMISSIONS';

export class SeoAiHttpException extends HttpException {
  constructor(
    code: SeoAiErrorCode,
    message: string,
    status: HttpStatus,
    extra?: Record<string, unknown>,
  ) {
    super(
      {
        success: false,
        code,
        message,
        phase: 'AI_GENERATION_REQUEST',
        ...extra,
      },
      status,
    );
  }
}

export function mapOpenAiError(err: unknown): SeoAiHttpException {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes('disabled') || lower.includes('vypnut')) {
    return new SeoAiHttpException('OPENAI_DISABLED', msg, HttpStatus.SERVICE_UNAVAILABLE);
  }
  if (lower.includes('not configured') || lower.includes('missing') && lower.includes('key')) {
    return new SeoAiHttpException('OPENAI_NOT_CONFIGURED', msg, HttpStatus.SERVICE_UNAVAILABLE);
  }
  if (lower.includes('invalid api key') || lower.includes('incorrect api key')) {
    return new SeoAiHttpException('OPENAI_INVALID_KEY', msg, HttpStatus.SERVICE_UNAVAILABLE);
  }
  if (lower.includes('quota') || lower.includes('rate limit') || lower.includes('429')) {
    return new SeoAiHttpException('OPENAI_QUOTA_EXCEEDED', msg, HttpStatus.TOO_MANY_REQUESTS);
  }
  if (lower.includes('model') && (lower.includes('not found') || lower.includes('unavailable'))) {
    return new SeoAiHttpException('OPENAI_MODEL_NOT_AVAILABLE', msg, HttpStatus.SERVICE_UNAVAILABLE);
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return new SeoAiHttpException('OPENAI_TIMEOUT', msg, HttpStatus.GATEWAY_TIMEOUT);
  }
  if (lower.includes('econnrefused') || lower.includes('network') || lower.includes('fetch failed')) {
    return new SeoAiHttpException('OPENAI_CONNECTION_ERROR', msg, HttpStatus.BAD_GATEWAY);
  }
  if (lower.includes('json') || lower.includes('invalid response')) {
    return new SeoAiHttpException('OPENAI_INVALID_RESPONSE', msg, HttpStatus.UNPROCESSABLE_ENTITY);
  }
  return new SeoAiHttpException('AI_GENERATION_FAILED', msg, HttpStatus.BAD_REQUEST);
}
