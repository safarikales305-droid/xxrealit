/**
 * Centrální úpravy URL — zabránění mixed content (HTTPS stránka načítá HTTP zdroje).
 */

export function isNodeProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function isBrowserHttpsPage(): boolean {
  return typeof window !== 'undefined' && window.location.protocol === 'https:';
}

function isLoopbackHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
  } catch {
    return false;
  }
}

/**
 * Přepíše `http://` na `https://` na produkčním buildu nebo v prohlížeči na HTTPS stránce.
 * Localhost / 127.0.0.1 ponechá (lokální vývoj).
 */
export function upgradeHttpToHttps(url: string): string {
  const t = url.trim();
  if (!/^http:\/\//i.test(t)) return t;
  if (isLoopbackHttpUrl(t)) return t;
  if (isNodeProduction() || isBrowserHttpsPage()) {
    return `https://${t.slice(7)}`;
  }
  return t;
}
