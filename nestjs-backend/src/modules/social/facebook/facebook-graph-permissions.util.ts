import { GRAPH_API } from './facebook-page.constants';

export const FACEBOOK_PAGE_SYNC_REQUIRED_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
] as const;

export type FacebookTokenInspection = {
  scopes: string[];
  missingScopes: string[];
  isValid: boolean;
  error: string | null;
};

export type FacebookGraphError = {
  message: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
};

export function parseFacebookGraphError(payload: unknown): FacebookGraphError | null {
  if (!payload || typeof payload !== 'object') return null;
  const err = (payload as { error?: FacebookGraphError }).error;
  if (!err?.message) return null;
  return err;
}

export function isFacebookPermissionError(error: FacebookGraphError | null): boolean {
  if (!error) return false;
  const code = error.code ?? 0;
  const msg = error.message.toLowerCase();
  return (
    code === 10 ||
    code === 200 ||
    code === 190 ||
    code === 102 ||
    msg.includes('permission') ||
    msg.includes('oauth') ||
    msg.includes('access token')
  );
}

export async function inspectFacebookAccessToken(
  accessToken: string,
  appId: string,
  appSecret: string,
): Promise<FacebookTokenInspection> {
  const empty: FacebookTokenInspection = {
    scopes: [],
    missingScopes: [...FACEBOOK_PAGE_SYNC_REQUIRED_SCOPES],
    isValid: false,
    error: null,
  };
  const token = accessToken.trim();
  if (!token) return { ...empty, error: 'missing_token' };

  const appToken = `${appId}|${appSecret}`;
  const url =
    `${GRAPH_API}/debug_token?` +
    `input_token=${encodeURIComponent(token)}&` +
    `access_token=${encodeURIComponent(appToken)}`;

  try {
    const res = await fetch(url);
    const payload = (await res.json().catch(() => ({}))) as {
      data?: { is_valid?: boolean; scopes?: string[]; error?: { message?: string } };
      error?: { message?: string };
    };

    if (!res.ok || payload.error) {
      return {
        ...empty,
        error: payload.error?.message ?? `debug_token HTTP ${res.status}`,
      };
    }

    const scopes = (payload.data?.scopes ?? [])
      .map((s) => String(s).trim().toLowerCase())
      .filter(Boolean);
    const missingScopes = FACEBOOK_PAGE_SYNC_REQUIRED_SCOPES.filter(
      (required) => !scopes.includes(required),
    );

    return {
      scopes,
      missingScopes: [...missingScopes],
      isValid: payload.data?.is_valid === true,
      error: payload.data?.error?.message ?? null,
    };
  } catch (err) {
    return {
      ...empty,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
