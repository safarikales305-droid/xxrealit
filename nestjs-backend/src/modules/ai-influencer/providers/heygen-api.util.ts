export type HeyGenParsedResponse = {
  httpStatus: number;
  ok: boolean;
  errorCode: string | null;
  message: string | null;
};

export type HeyGenConnectionStatus =
  | 'NOT_CONFIGURED'
  | 'CONNECTED'
  | 'INVALID_API_KEY'
  | 'PERMISSION_REQUIRED'
  | 'RATE_LIMITED'
  | 'API_ERROR'
  | 'CONNECTION_ERROR';

export function parseHeyGenResponseBody(
  httpStatus: number,
  bodyText: string,
): Omit<HeyGenParsedResponse, 'httpStatus' | 'ok'> {
  let body: unknown = null;
  try {
    body = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    return {
      errorCode: null,
      message: bodyText.slice(0, 300) || null,
    };
  }

  const error = (body as { error?: { code?: string; message?: string } | string | null } | null)?.error;
  if (typeof error === 'string') {
    return { errorCode: error, message: error };
  }
  if (error && typeof error === 'object') {
    return {
      errorCode: error.code ?? null,
      message: error.message ?? null,
    };
  }

  const topMessage = (body as { message?: string } | null)?.message ?? null;
  return { errorCode: null, message: topMessage };
}

export function classifyHeyGenResponse(parsed: HeyGenParsedResponse): HeyGenConnectionStatus {
  const { httpStatus, ok, errorCode, message } = parsed;
  if (ok) return 'CONNECTED';

  const code = (errorCode ?? '').toLowerCase();
  const msg = (message ?? '').toLowerCase();

  if (httpStatus === 401 || code.includes('unauthorized') || msg.includes('invalid api key')) {
    return 'INVALID_API_KEY';
  }
  if (httpStatus === 403 || code.includes('permission') || msg.includes('permission')) {
    return 'PERMISSION_REQUIRED';
  }
  if (httpStatus === 429 || code.includes('rate_limit') || msg.includes('rate limit')) {
    return 'RATE_LIMITED';
  }
  if (httpStatus === 0) return 'CONNECTION_ERROR';
  return 'API_ERROR';
}

export function isHeyGenPermissionError(parsed: HeyGenParsedResponse): boolean {
  return classifyHeyGenResponse(parsed) === 'PERMISSION_REQUIRED';
}
