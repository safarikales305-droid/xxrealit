import { maskAccessToken } from './social-autopost.types';

export type FacebookGraphErrorPayload = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
};

export type ParsedFacebookGraphError = {
  httpStatus: number;
  message: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
  userMessage: string;
  hint?: string;
  raw: unknown;
};

export type GraphAccountsPage = {
  id?: string;
  name?: string;
  access_token?: string;
};

export function stripAccessTokenFromUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.searchParams.has('access_token')) {
      u.searchParams.set('access_token', maskAccessToken(u.searchParams.get('access_token')) ?? '••••');
    }
    return u.toString();
  } catch {
    return url.replace(/access_token=[^&]+/i, 'access_token=••••');
  }
}

export function redactGraphBody(body: Record<string, unknown>): Record<string, unknown> {
  const out = { ...body };
  if ('access_token' in out) {
    out.access_token = maskAccessToken(String(out.access_token ?? ''));
  }
  return out;
}

export function parseFacebookGraphError(httpStatus: number, raw: unknown): ParsedFacebookGraphError {
  const err =
    raw && typeof raw === 'object' && 'error' in raw && (raw as { error?: unknown }).error
      ? ((raw as { error: FacebookGraphErrorPayload }).error ?? {})
      : ({} as FacebookGraphErrorPayload);

  const message = err.message?.trim() || `Facebook Graph API HTTP ${httpStatus}`;
  const code = typeof err.code === 'number' ? err.code : undefined;
  const subcode = typeof err.error_subcode === 'number' ? err.error_subcode : undefined;
  const type = err.type?.trim();
  const fbtrace_id = err.fbtrace_id?.trim();

  let userMessage = message;
  let hint: string | undefined;

  const lower = message.toLowerCase();

  if (
    lower.includes('pages_manage_posts') ||
    (lower.includes('permission') && lower.includes('publish')) ||
    code === 200 || // sometimes permission errors
    (code === 10 && subcode === 200) ||
    lower.includes('(#200)')
  ) {
    userMessage =
      'Token nemá oprávnění pages_manage_posts. Vygenerujte nový Page Access Token s oprávněním pages_manage_posts.';
    hint =
      'V Meta Business Suite / Graph API Explorer získejte Page Access Token stránky s oprávněními pages_show_list, pages_read_engagement, pages_manage_posts a pages_manage_metadata.';
  } else if (
    lower.includes('page access') ||
    lower.includes('must be a page') ||
    lower.includes('requires a page access token')
  ) {
    userMessage =
      'Uložený token není Page Access Token. Použijte token stránky z /me/accounts, ne User Access Token.';
    hint = 'Zavolejte GET /me/accounts a použijte access_token příslušné stránky.';
  } else if (lower.includes('invalid oauth') || lower.includes('expired') || code === 190) {
    userMessage = 'Facebook access token vypršel nebo je neplatný. Vygenerujte nový Page Access Token.';
  } else if (lower.includes('does not exist') || lower.includes('unsupported get request')) {
    userMessage = 'Page ID neodpovídá tokenu nebo stránka není dostupná daným tokenem.';
    hint = 'Ověřte, že Page ID odpovídá stránce v GET /me/accounts.';
  } else if (isFacebookPageScopeError(message, type, String(code ?? ''))) {
    userMessage =
      'Aplikace nemá schválená oprávnění pro správu stránky (pages_show_list, pages_read_engagement, pages_manage_posts, pages_manage_metadata).';
  }

  return {
    httpStatus,
    message,
    type,
    code,
    error_subcode: subcode,
    fbtrace_id,
    userMessage,
    hint,
    raw,
  };
}

function isFacebookPageScopeError(...parts: (string | undefined | null)[]): boolean {
  const text = parts
    .filter((p): p is string => Boolean(p?.trim()))
    .join(' ')
    .toLowerCase();
  if (!text) return false;
  return (
    text.includes('invalid scope') ||
    text.includes('pages_show_list') ||
    text.includes('pages_read_engagement') ||
    text.includes('pages_manage_metadata') ||
    text.includes('pages_manage_posts') ||
    text.includes('feature unavailable') ||
    (text.includes('permission') && text.includes('pages_'))
  );
}

export type GraphJsonResult<T> =
  | { ok: true; status: number; data: T; raw: unknown }
  | { ok: false; status: number; error: ParsedFacebookGraphError };

export async function fetchFacebookGraphJson<T = unknown>(
  url: string,
  init?: RequestInit,
): Promise<GraphJsonResult<T>> {
  const res = await fetch(url, init);
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, status: res.status, error: parseFacebookGraphError(res.status, raw) };
  }
  if (raw && typeof raw === 'object' && 'error' in raw && (raw as { error?: unknown }).error) {
    return {
      ok: false,
      status: res.status,
      error: parseFacebookGraphError(res.status, raw),
    };
  }
  return { ok: true, status: res.status, data: raw as T, raw };
}

export function buildGraphUrl(
  graphApiBase: string,
  path: string,
  params: Record<string, string>,
  accessToken: string,
): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${graphApiBase}${normalized}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  url.searchParams.set('access_token', accessToken);
  return url.toString();
}

export class FacebookGraphPublishError extends Error {
  readonly graphError?: Omit<ParsedFacebookGraphError, 'raw'>;
  readonly hint?: string;

  constructor(parsed: ParsedFacebookGraphError) {
    super(parsed.userMessage);
    this.name = 'FacebookGraphPublishError';
    this.graphError = {
      httpStatus: parsed.httpStatus,
      message: parsed.message,
      type: parsed.type,
      code: parsed.code,
      error_subcode: parsed.error_subcode,
      fbtrace_id: parsed.fbtrace_id,
      userMessage: parsed.userMessage,
      hint: parsed.hint,
    };
    this.hint = parsed.hint;
  }
}
