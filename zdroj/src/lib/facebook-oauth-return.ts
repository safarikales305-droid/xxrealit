const STORAGE_KEY = 'facebook_oauth_return';

export function storeFacebookOAuthReturnPath(path?: string): void {
  if (typeof window === 'undefined') return;
  const value = (path ?? `${window.location.pathname}${window.location.search}`).trim();
  if (!value.startsWith('/')) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, value);
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}

export function readFacebookOAuthReturnPath(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const fromSession = sessionStorage.getItem(STORAGE_KEY)?.trim();
    if (fromSession?.startsWith('/')) return fromSession;
    const fromLocal = localStorage.getItem(STORAGE_KEY)?.trim();
    if (fromLocal?.startsWith('/')) return fromLocal;
  } catch {
    /* ignore */
  }
  return null;
}

export function clearFacebookOAuthReturnPath(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
