/** Backend origin for Route Handlers (server-side). */
export function getInternalApiBaseUrl(): string {
  const raw =
    process.env.API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    '';
  if (!raw) {
    if (process.env.NODE_ENV === 'development') {
      return 'http://localhost:3000';
    }
    throw new Error(
      'Set API_URL or NEXT_PUBLIC_API_URL for auth API proxy routes.',
    );
  }
  return raw.replace(/\/+$/, '');
}

export const ACCESS_TOKEN_COOKIE = 'access_token';

export function getJwtSecretBytes(): Uint8Array {
  const secret =
    process.env.JWT_SECRET?.trim() || 'dev-jwt-secret-change-me';
  return new TextEncoder().encode(secret);
}
