function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function withApiPrefix(url: string): string {
  const normalized = trimTrailingSlash(url);
  return normalized.endsWith('/api') ? normalized : `${normalized}/api`;
}

const rawPublicApi =
  typeof process.env.NEXT_PUBLIC_API_URL === 'string'
    ? process.env.NEXT_PUBLIC_API_URL.trim()
    : '';

/**
 * Public Nest API base. In production, only `NEXT_PUBLIC_API_URL` (no localhost).
 */
export const API_BASE_URL = rawPublicApi
  ? withApiPrefix(rawPublicApi)
  : '';

/** POST /properties on Nest; empty string if API is not configured (guard in forms). */
export const propertiesEndpoint = API_BASE_URL
  ? `${API_BASE_URL}/properties`
  : '';

/** Server-side API base for RSC. */
export function getServerSideApiBaseUrl(): string | null {
  return rawPublicApi ? withApiPrefix(rawPublicApi) : null;
}

/** Origin bez `/api` — pro statické soubory Nest (`/uploads/...`). */
export function getNestPublicOrigin(): string {
  if (!rawPublicApi) return '';
  const noTrail = trimTrailingSlash(rawPublicApi);
  return noTrail.replace(/\/api$/i, '');
}

export function nestAbsoluteAssetUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const origin = getNestPublicOrigin();
  if (!origin) return path;
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}


