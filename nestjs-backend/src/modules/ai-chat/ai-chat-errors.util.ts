import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

export type AiChatErrorCode =
  | 'OPENAI_NOT_CONFIGURED'
  | 'OPENAI_DISABLED'
  | 'OPENAI_INVALID_KEY'
  | 'OPENAI_QUOTA_EXCEEDED'
  | 'OPENAI_MODEL_NOT_AVAILABLE'
  | 'OPENAI_RATE_LIMIT'
  | 'OPENAI_TIMEOUT'
  | 'OPENAI_CONNECTION_ERROR'
  | 'AI_CHAT_DISABLED'
  | 'AI_TEST_MODE_DISABLED'
  | 'AI_DAILY_LIMIT_REACHED'
  | 'AI_MONTHLY_BUDGET_REACHED'
  | 'UNKNOWN_AI_ERROR';

export type AiChatAdminErrorBody = {
  success: false;
  fallback: false;
  code: AiChatErrorCode;
  message: string;
  httpStatus: number;
  technicalContext?: Record<string, string | number | boolean | null>;
};

export class AiChatAdminException extends HttpException {
  constructor(body: AiChatAdminErrorBody) {
    super(body, body.httpStatus);
  }
}

export function buildAdminError(
  code: AiChatErrorCode,
  message: string,
  httpStatus: number,
  technicalContext?: AiChatAdminErrorBody['technicalContext'],
): AiChatAdminErrorBody {
  return {
    success: false,
    fallback: false,
    code,
    message,
    httpStatus,
    ...(technicalContext ? { technicalContext } : {}),
  };
}

export function mapExceptionToAdminError(
  err: unknown,
  fallbackContext?: Record<string, string | number | boolean | null>,
): AiChatAdminErrorBody {
  if (err instanceof AiChatAdminException) {
    const res = err.getResponse();
    if (typeof res === 'object' && res !== null && 'code' in res) {
      return res as AiChatAdminErrorBody;
    }
  }

  if (err instanceof UnauthorizedException) {
    return buildAdminError('UNKNOWN_AI_ERROR', 'Přihlášení vypršelo.', 401, fallbackContext);
  }

  if (err instanceof ForbiddenException) {
    const msg = extractMessage(err);
    if (/limit|dosažen/i.test(msg)) {
      if (/měsíční|budget|náklad/i.test(msg)) {
        return buildAdminError('AI_MONTHLY_BUDGET_REACHED', msg, 403, fallbackContext);
      }
      return buildAdminError('AI_DAILY_LIMIT_REACHED', msg, 403, fallbackContext);
    }
    if (/funkce není povolena|chat je vypnutý/i.test(msg)) {
      return buildAdminError('AI_CHAT_DISABLED', 'AI chat je vypnutý v nastavení AI centra (AiSettings.chatEnabled = false).', 403, fallbackContext);
    }
    return buildAdminError('UNKNOWN_AI_ERROR', 'Testovací AI chat může používat pouze administrátor.', 403, fallbackContext);
  }

  if (err instanceof BadRequestException) {
    const msg = extractMessage(err);
    if (/klíč není nastaven/i.test(msg)) {
      return buildAdminError('OPENAI_NOT_CONFIGURED', 'OPENAI_API_KEY není nastaven.', 400, fallbackContext);
    }
    return buildAdminError('UNKNOWN_AI_ERROR', msg, 400, fallbackContext);
  }

  if (err instanceof ServiceUnavailableException) {
    return buildAdminError('OPENAI_CONNECTION_ERROR', extractMessage(err), 503, fallbackContext);
  }

  return buildAdminError(
    'UNKNOWN_AI_ERROR',
    err instanceof Error ? err.message : 'Neočekávaná chyba AI služby.',
    500,
    fallbackContext,
  );
}

function extractMessage(err: HttpException | Error): string {
  const res = err instanceof HttpException ? err.getResponse() : err.message;
  if (typeof res === 'string') return res;
  if (typeof res === 'object' && res !== null && 'message' in res) {
    const m = (res as { message?: string | string[] }).message;
    return Array.isArray(m) ? m.join(', ') : String(m ?? 'Chyba');
  }
  return 'Chyba';
}

export function mapOpenAiError(
  err: unknown,
  stage: string,
  model?: string,
): AiChatAdminErrorBody {
  const technicalContext = { stage, model: model ?? null };

  if (err instanceof Error && err.name === 'TimeoutError') {
    return buildAdminError(
      'OPENAI_TIMEOUT',
      'OpenAI neodpovědělo včas.',
      504,
      technicalContext,
    );
  }

  const status = (err as { status?: number })?.status;
  const msg = err instanceof Error ? err.message : String(err);

  if (status === 401) {
    return buildAdminError('OPENAI_INVALID_KEY', 'OpenAI API klíč není platný.', 400, technicalContext);
  }
  if (status === 402) {
    return buildAdminError(
      'OPENAI_QUOTA_EXCEEDED',
      'OpenAI účet nemá dostupný API kredit nebo byl dosažen limit. Zkontrolujte Billing a Usage v OpenAI Platform.',
      402,
      technicalContext,
    );
  }
  if (status === 429) {
    return buildAdminError('OPENAI_RATE_LIMIT', 'Příliš mnoho požadavků na OpenAI API.', 429, technicalContext);
  }
  if (/model/i.test(msg) && /not found|does not exist|unavailable/i.test(msg)) {
    return buildAdminError(
      'OPENAI_MODEL_NOT_AVAILABLE',
      'Nastavený model není pro projekt dostupný.',
      400,
      technicalContext,
    );
  }
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|fetch failed|network/i.test(msg)) {
    return buildAdminError('OPENAI_CONNECTION_ERROR', 'Síťová chyba při komunikaci s OpenAI.', 503, technicalContext);
  }
  if (status && status >= 500) {
    return buildAdminError('OPENAI_CONNECTION_ERROR', 'OpenAI služba dočasně neodpovídá.', 503, technicalContext);
  }

  return buildAdminError('UNKNOWN_AI_ERROR', 'Neočekávaná chyba OpenAI služby.', 500, technicalContext);
}
