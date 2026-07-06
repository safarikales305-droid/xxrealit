export type MetaGraphErrorBody = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    error_user_title?: string;
    error_user_msg?: string;
    fbtrace_id?: string;
    trace_id?: string;
    is_transient?: boolean;
    error_data?: unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export function extractMetaGraphErrorFields(
  body: MetaGraphErrorBody | null | undefined,
): {
  code: string | null;
  message: string | null;
  type: string | null;
  error_subcode: string | null;
  error_user_title: string | null;
  error_user_msg: string | null;
  trace_id: string | null;
  fullJson: string | null;
} {
  const err = body?.error;
  if (!err) {
    return {
      code: null,
      message: null,
      type: null,
      error_subcode: null,
      error_user_title: null,
      error_user_msg: null,
      trace_id: null,
      fullJson: body ? safeJsonStringify(body) : null,
    };
  }
  const trace =
    typeof err.fbtrace_id === 'string'
      ? err.fbtrace_id
      : typeof err.trace_id === 'string'
        ? err.trace_id
        : null;
  return {
    code: err.code != null ? String(err.code) : null,
    message: typeof err.message === 'string' ? err.message : null,
    type: typeof err.type === 'string' ? err.type : null,
    error_subcode: err.error_subcode != null ? String(err.error_subcode) : null,
    error_user_title:
      typeof err.error_user_title === 'string' ? err.error_user_title : null,
    error_user_msg: typeof err.error_user_msg === 'string' ? err.error_user_msg : null,
    trace_id: trace,
    fullJson: safeJsonStringify(body),
  };
}

export function formatMetaGraphErrorMessage(
  body: MetaGraphErrorBody | null | undefined,
  httpStatus?: number | null,
): string {
  const fields = extractMetaGraphErrorFields(body);
  if (!fields.message && !fields.fullJson) {
    return httpStatus != null ? `HTTP ${httpStatus}` : 'Graph API chyba';
  }
  const parts: string[] = [];
  if (httpStatus != null) parts.push(`HTTP ${httpStatus}`);
  if (fields.code) parts.push(`code=${fields.code}`);
  if (fields.error_subcode) parts.push(`subcode=${fields.error_subcode}`);
  if (fields.type) parts.push(`type=${fields.type}`);
  if (fields.message) parts.push(fields.message);
  if (fields.error_user_title) parts.push(`error_user_title=${fields.error_user_title}`);
  if (fields.error_user_msg) parts.push(`error_user_msg=${fields.error_user_msg}`);
  if (fields.trace_id) parts.push(`trace_id=${fields.trace_id}`);
  if (fields.fullJson) parts.push(`FULL_JSON=${fields.fullJson}`);
  return parts.join(' | ');
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function maskAccessToken(token: string | null | undefined): string {
  if (!token?.trim()) return '(none)';
  const t = token.trim();
  if (t.length <= 12) return `${t.slice(0, 4)}…`;
  return `${t.slice(0, 8)}…${t.slice(-4)} (${t.length} chars)`;
}

/** OAuth token JSON pro logy — access_token nikdy celý. */
export function redactOAuthTokenPayload<T extends Record<string, unknown>>(data: T): T {
  const copy = { ...data } as Record<string, unknown>;
  if (typeof copy.access_token === 'string') {
    copy.access_token = maskAccessToken(copy.access_token);
  }
  if (typeof copy.refresh_token === 'string') {
    copy.refresh_token = maskAccessToken(copy.refresh_token);
  }
  return copy as T;
}
