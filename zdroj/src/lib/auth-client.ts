/** Browser auth helpers — jednotné čtení/ukládání JWT a URL pro /me. */

const AUTH_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 7;

export function getBrowserAuthMeUrl(): string {
  return '/api/auth/me';
}

export function getClientAuthCookieSuffix(): string {
  return `path=/; max-age=${AUTH_COOKIE_MAX_AGE_SEC}; SameSite=Lax${
    process.env.NODE_ENV === 'production' ? '; Secure' : ''
  }`;
}

/** Uloží token do čitelných cookies (pro Authorization header na klientu). */
export function persistClientAuthToken(token: string): void {
  if (typeof document === 'undefined' || !token.trim()) return;
  const encoded = encodeURIComponent(token.trim());
  const suffix = getClientAuthCookieSuffix();
  document.cookie = `token=${encoded}; ${suffix}`;
  document.cookie = `access_token=${encoded}; ${suffix}`;
  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.debug('[auth] token saved to client cookies');
  }
}

/** Smaže klientské auth cookies (httpOnly access_token maže /api/auth/logout). */
export function clearClientAuthCookies(): void {
  if (typeof document === 'undefined') return;
  const expired = 'path=/; max-age=0; SameSite=Lax';
  document.cookie = `token=; ${expired}`;
  document.cookie = `access_token=; ${expired}`;
  try {
    localStorage.removeItem('user');
  } catch {
    /* ignore */
  }
}

export function extractTokenFromLoginResponse(data: {
  token?: string;
  accessToken?: string;
  access_token?: string;
}): string {
  return (
    (typeof data.token === 'string' && data.token.trim()) ||
    (typeof data.accessToken === 'string' && data.accessToken.trim()) ||
    (typeof data.access_token === 'string' && data.access_token.trim()) ||
    ''
  );
}
