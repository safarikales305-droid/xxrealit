import { ACCESS_TOKEN_COOKIE } from '@/lib/server-api';
import type { NextResponse } from 'next/server';

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

export function getClientAuthCookieSetOptions() {
  return {
    httpOnly: false as const,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  };
}

/** Stejné cookies jako po POST /api/auth/login. */
export function setAuthCookies(response: NextResponse, accessToken: string) {
  response.cookies.set(ACCESS_TOKEN_COOKIE, accessToken, getAuthCookieSetOptions());
  response.cookies.set('token', accessToken, getClientAuthCookieSetOptions());
}

export { ACCESS_TOKEN_COOKIE };
