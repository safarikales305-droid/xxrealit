export type ElevenLabsParsedResponse = {
  httpStatus: number;
  ok: boolean;
  detailCode: string | null;
  detailStatus: string | null;
  detailType: string | null;
  message: string | null;
};

export type ElevenLabsConnectionStatus =
  | 'NOT_CONFIGURED'
  | 'CONNECTED'
  | 'INVALID_API_KEY'
  | 'INSUFFICIENT_PERMISSIONS'
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'CONNECTION_ERROR';

export function parseElevenLabsResponseBody(
  httpStatus: number,
  bodyText: string,
): Omit<ElevenLabsParsedResponse, 'httpStatus' | 'ok'> {
  let body: unknown = null;
  try {
    body = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    return {
      detailCode: null,
      detailStatus: null,
      detailType: null,
      message: bodyText.slice(0, 300) || null,
    };
  }

  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === 'string') {
    return {
      detailCode: detail,
      detailStatus: detail,
      detailType: null,
      message: detail,
    };
  }

  if (detail && typeof detail === 'object') {
    const d = detail as {
      code?: string;
      status?: string;
      type?: string;
      message?: string;
    };
    return {
      detailCode: d.code ?? null,
      detailStatus: d.status ?? null,
      detailType: d.type ?? null,
      message: d.message ?? null,
    };
  }

  const topMessage = (body as { message?: string } | null)?.message ?? null;
  return {
    detailCode: null,
    detailStatus: null,
    detailType: null,
    message: topMessage,
  };
}

export function classifyElevenLabsResponse(parsed: ElevenLabsParsedResponse): ElevenLabsConnectionStatus {
  const { httpStatus, ok, detailCode, detailStatus, detailType, message } = parsed;
  if (ok) return 'CONNECTED';

  const code = `${detailCode ?? ''} ${detailStatus ?? ''}`.toLowerCase();
  const msg = (message ?? '').toLowerCase();
  const type = (detailType ?? '').toLowerCase();

  if (
    httpStatus === 429 ||
    type === 'rate_limit_error' ||
    code.includes('rate_limit') ||
    msg.includes('rate limit')
  ) {
    return 'RATE_LIMITED';
  }

  if (
    httpStatus === 402 ||
    type === 'payment_required' ||
    code.includes('quota') ||
    msg.includes('quota') ||
    msg.includes('insufficient credit') ||
    msg.includes('not enough credits')
  ) {
    return 'QUOTA_EXCEEDED';
  }

  const isPermissionError =
    httpStatus === 403 ||
    type === 'authorization_error' ||
    code.includes('missing_permissions') ||
    code.includes('insufficient_permissions') ||
    code.includes('permission') ||
    msg.includes('permission') ||
    msg.includes('not authorized') ||
    msg.includes('scope');

  if (isPermissionError) {
    return 'INSUFFICIENT_PERMISSIONS';
  }

  const isInvalidKey =
    code.includes('invalid_api_key') ||
    msg.includes('invalid api key') ||
    msg.includes('invalid_api_key') ||
    (httpStatus === 401 && type === 'authentication_error' && !code.includes('permission'));

  if (isInvalidKey) {
    return 'INVALID_API_KEY';
  }

  if (httpStatus === 401) {
    return 'INVALID_API_KEY';
  }

  return 'CONNECTION_ERROR';
}

export function isElevenLabsPermissionError(parsed: ElevenLabsParsedResponse): boolean {
  return classifyElevenLabsResponse(parsed) === 'INSUFFICIENT_PERMISSIONS';
}
