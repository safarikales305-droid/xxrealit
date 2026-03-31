function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

const rawPublicApi =
  typeof process.env.NEXT_PUBLIC_API_URL === 'string'
    ? process.env.NEXT_PUBLIC_API_URL.trim()
    : '';

/**
 * Public Nest API base. In production, only `NEXT_PUBLIC_API_URL` (no localhost).
 */
export const API_BASE_URL = rawPublicApi
  ? trimTrailingSlash(rawPublicApi)
  : '';

/** POST /properties on Nest; empty string if API is not configured (guard in forms). */
export const propertiesEndpoint = API_BASE_URL
  ? `${API_BASE_URL}/properties`
  : '';

/** Server-side API base for RSC. */
export function getServerSideApiBaseUrl(): string | null {
  return rawPublicApi ? trimTrailingSlash(rawPublicApi) : null;
}


