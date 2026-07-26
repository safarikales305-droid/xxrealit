import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

export type AiSalesErrorCode =
  | 'AI_SALES_DISABLED'
  | 'OPENAI_DISABLED'
  | 'OPENAI_NOT_CONFIGURED'
  | 'OPENAI_INVALID_KEY'
  | 'OPENAI_QUOTA_EXCEEDED'
  | 'OPENAI_RATE_LIMIT'
  | 'OPENAI_TIMEOUT'
  | 'OPENAI_CONNECTION_ERROR'
  | 'OPENAI_MODEL_NOT_AVAILABLE'
  | 'DATABASE_ERROR'
  | 'ENDPOINT_NOT_FOUND'
  | 'SEARCH_PROVIDER_NOT_CONFIGURED'
  | 'SEARCH_LIMIT_REACHED'
  | 'ANALYSIS_LIMIT_REACHED'
  | 'INVALID_REQUEST'
  | 'TIMEOUT'
  | 'UNAUTHORIZED'
  | 'DO_NOT_CONTACT'
  | 'DUPLICATE_CONTACT'
  | 'UNKNOWN_ERROR';

export type AiSalesAdminErrorBody = {
  success: false;
  code: AiSalesErrorCode;
  message: string;
  httpStatus: number;
  phase?: string;
  technicalContext?: Record<string, string | number | boolean | null>;
};

export class AiSalesAdminException extends HttpException {
  constructor(body: AiSalesAdminErrorBody) {
    super(body, body.httpStatus);
  }
}

export function buildSalesAdminError(
  code: AiSalesErrorCode,
  message: string,
  httpStatus: number,
  phase?: string,
  technicalContext?: AiSalesAdminErrorBody['technicalContext'],
): AiSalesAdminErrorBody {
  return {
    success: false,
    code,
    message,
    httpStatus,
    ...(phase ? { phase } : {}),
    ...(technicalContext ? { technicalContext } : {}),
  };
}

export function mapExceptionToSalesAdminError(
  err: unknown,
  phase?: string,
): AiSalesAdminErrorBody {
  if (err instanceof AiSalesAdminException) {
    const res = err.getResponse();
    if (typeof res === 'object' && res !== null && 'code' in res) {
      return res as AiSalesAdminErrorBody;
    }
  }

  if (err instanceof UnauthorizedException) {
    return buildSalesAdminError('UNAUTHORIZED', 'Přihlášení vypršelo.', 401, phase);
  }

  if (err instanceof NotFoundException) {
    return buildSalesAdminError('ENDPOINT_NOT_FOUND', extractMessage(err), 404, phase);
  }

  if (err instanceof ForbiddenException) {
    const msg = extractMessage(err);
    if (/limit|dosažen/i.test(msg)) {
      if (/vyhledáv|search/i.test(msg)) {
        return buildSalesAdminError('SEARCH_LIMIT_REACHED', msg, 403, phase);
      }
      if (/analýz/i.test(msg)) {
        return buildSalesAdminError('ANALYSIS_LIMIT_REACHED', msg, 403, phase);
      }
    }
    if (/DO_NOT_CONTACT|zákaz/i.test(msg)) {
      return buildSalesAdminError('DO_NOT_CONTACT', msg, 403, phase);
    }
    if (/OpenAI|vypnut/i.test(msg)) {
      return buildSalesAdminError('OPENAI_DISABLED', msg, 403, phase);
    }
    return buildSalesAdminError('INVALID_REQUEST', msg, 403, phase);
  }

  if (err instanceof BadRequestException) {
    const msg = extractMessage(err);
    if (/API klíč|not configured/i.test(msg)) {
      return buildSalesAdminError('OPENAI_NOT_CONFIGURED', msg, 400, phase);
    }
    if (/provider|zdroj/i.test(msg)) {
      return buildSalesAdminError('SEARCH_PROVIDER_NOT_CONFIGURED', msg, 400, phase);
    }
    return buildSalesAdminError('INVALID_REQUEST', msg, 400, phase);
  }

  if (err instanceof ServiceUnavailableException) {
    return buildSalesAdminError('OPENAI_CONNECTION_ERROR', extractMessage(err), 503, phase);
  }

  if (err instanceof Error && err.name === 'AbortError') {
    return buildSalesAdminError('TIMEOUT', 'Požadavek vypršel (timeout 60 s).', 504, phase);
  }

  const msg = extractMessage(err);
  if (/P1001|P2024|database|prisma/i.test(msg)) {
    return buildSalesAdminError('DATABASE_ERROR', 'Databáze není dostupná.', 503, phase, { detail: msg });
  }

  return buildSalesAdminError('UNKNOWN_ERROR', msg || 'Neznámá chyba.', 500, phase);
}

function extractMessage(err: unknown): string {
  if (err instanceof HttpException) {
    const res = err.getResponse();
    if (typeof res === 'string') return res;
    if (typeof res === 'object' && res !== null && 'message' in res) {
      const m = (res as { message: unknown }).message;
      if (typeof m === 'string') return m;
      if (Array.isArray(m)) return m.join(', ');
    }
  }
  return err instanceof Error ? err.message : String(err);
}
