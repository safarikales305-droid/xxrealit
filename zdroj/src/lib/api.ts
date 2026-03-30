/**
 * NestJS API base (default port 3000).
 * Next.js dev server is usually 3001 — do not point this at the Next port.
 */
function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

const rawPublicApi =
  typeof process.env.NEXT_PUBLIC_API_URL === 'string'
    ? process.env.NEXT_PUBLIC_API_URL.trim()
    : '';

const DEV_API_FALLBACK = 'http://localhost:3000';

/**
 * Public Nest API base. In production, only `NEXT_PUBLIC_API_URL` (no localhost).
 */
export const API_BASE_URL = trimTrailingSlash(
  rawPublicApi ||
    (process.env.NODE_ENV === 'development' ? DEV_API_FALLBACK : ''),
);

/** POST /properties on Nest; empty string if API is not configured (guard in forms). */
export const propertiesEndpoint = API_BASE_URL
  ? `${API_BASE_URL}/properties`
  : '';

/**
 * URL for server-side fetches (RSC). Production requires NEXT_PUBLIC_API_URL
 * (or set at build time); dev may fall back to local Nest.
 */
export function getServerSideApiBaseUrl(): string | null {
  if (rawPublicApi) return trimTrailingSlash(rawPublicApi);
  if (process.env.NODE_ENV === 'development') {
    return trimTrailingSlash(DEV_API_FALLBACK);
  }
  return null;
}
