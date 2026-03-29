import { ACCESS_TOKEN_COOKIE } from '@/lib/server-api';

export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export function getAuthCookieSetOptions() {
  return {
    httpOnly: true as const,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  };
}

export { ACCESS_TOKEN_COOKIE };
