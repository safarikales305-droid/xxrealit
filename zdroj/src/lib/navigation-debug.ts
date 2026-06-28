'use client';

function shouldLogNavigation(): boolean {
  if (process.env.NODE_ENV === 'development') return true;
  return process.env.NEXT_PUBLIC_DEBUG_SITE_ORIGIN === '1';
}

/** Loguje navigaci — použijte místo přímého `window.location` při absolutních URL. */
export function logRedirectTo(url: string, source?: string): void {
  if (!shouldLogNavigation()) return;
  // eslint-disable-next-line no-console
  console.log('Redirect to:', url, source ? `(${source})` : '');
}

export function assignWindowLocation(url: string, source: string): void {
  logRedirectTo(url, source);
  window.location.assign(url);
}

export function replaceWindowLocation(url: string, source: string): void {
  logRedirectTo(url, source);
  window.location.replace(url);
}

export function setWindowLocationHref(url: string, source: string): void {
  logRedirectTo(url, source);
  window.location.href = url;
}
