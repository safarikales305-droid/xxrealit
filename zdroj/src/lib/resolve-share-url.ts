/**
 * Vrátí absolutní URL pro sdílení (klient). Na serveru vrátí relativní cestu s úvodním /.
 */
export function resolveShareUrl(pathOrUrl: string): string {
  if (typeof window === 'undefined') {
    return pathOrUrl.startsWith('http') ? pathOrUrl : pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  }
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${window.location.origin}${path}`;
}
