/** Nest `/api` base when `API_URL` or `NEXT_PUBLIC_API_URL` is set; otherwise `null`. */
export function getOptionalInternalApiBaseUrl(): string | null {
  const raw =
    process.env.API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    '';
  if (!raw) return null;
  const normalized = raw.replace(/\/+$/, '');
  return normalized.endsWith('/api') ? normalized : `${normalized}/api`;
}

/** Backend origin for Route Handlers (server-side). */
export function getInternalApiBaseUrl(): string {
  const raw =
    process.env.API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    '';
  if (!raw) {
    throw new Error(
      'Set API_URL or NEXT_PUBLIC_API_URL for auth API proxy routes.',
    );
  }
  const normalized = raw.replace(/\/+$/, '');
  return normalized.endsWith('/api') ? normalized : `${normalized}/api`;
}

export const ACCESS_TOKEN_COOKIE = 'access_token';

/** Shared with `jsonwebtoken` (API routes) — keep in sync with `getJwtSecretBytes`. */
export function getJwtSecretString(): string {
  return process.env.JWT_SECRET?.trim() || 'dev-jwt-secret-change-me';
}

export function getJwtSecretBytes(): Uint8Array {
  return new TextEncoder().encode(getJwtSecretString());
}

