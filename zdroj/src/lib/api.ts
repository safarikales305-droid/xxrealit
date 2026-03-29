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

/** Client + shared default: localhost only makes sense on a dev machine. */
export const API_BASE_URL = trimTrailingSlash(
  rawPublicApi || 'http://localhost:3000',
);

export const propertiesEndpoint = `${API_BASE_URL}/properties`;

/**
 * URL for server-side fetches (RSC). On Vercel, never fall back to localhost —
 * that points at the Lambda itself / nothing and causes fetch to reject,
 * which crashes the page if uncaught.
 */
export function getServerSideApiBaseUrl(): string | null {
  if (rawPublicApi) return trimTrailingSlash(rawPublicApi);
  if (process.env.VERCEL) return null;
  return 'http://localhost:3000';
}
