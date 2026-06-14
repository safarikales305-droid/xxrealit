import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { setAuthCookies } from '@/lib/auth-cookie';
import { getOptionalInternalApiBaseUrl } from '@/lib/server-api';

export const runtime = 'nodejs';

const DEFAULT_ERROR_REDIRECT = 'https://www.xxrealit.cz/login?facebook=error';
const DASHBOARD_URL = 'https://www.xxrealit.cz/profil/dashboard?facebook=connected';

type NestCallbackResult = {
  ok?: boolean;
  redirectUrl?: string;
  accessToken?: string;
};

/** GET — Facebook OAuth redirect (když redirect URI míří na frontend doménu). */
export async function GET(request: NextRequest) {
  const nestBase = getOptionalInternalApiBaseUrl();
  const { searchParams } = request.nextUrl;

  console.log('[facebook/callback] FACEBOOK_CALLBACK_START');

  if (!nestBase) {
    console.error('[facebook/callback] FACEBOOK_LOGIN_FAIL Nest API URL missing');
    return NextResponse.redirect(`${DEFAULT_ERROR_REDIRECT}&reason=not_configured`);
  }

  const query = searchParams.toString();
  try {
    const res = await fetch(
      `${nestBase}/social/facebook/callback?${query}${query ? '&' : ''}format=json`,
      {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      },
    );

    const data = (await res.json().catch(() => ({}))) as NestCallbackResult;
    const ok = data.ok !== false;
    const accessToken =
      typeof data.accessToken === 'string' && data.accessToken.trim()
        ? data.accessToken.trim()
        : '';

    if (!res.ok || !ok) {
      console.error(`[facebook/callback] FACEBOOK_LOGIN_FAIL http=${res.status}`);
      return NextResponse.redirect(
        typeof data.redirectUrl === 'string' && data.redirectUrl.trim()
          ? data.redirectUrl.trim()
          : DEFAULT_ERROR_REDIRECT,
      );
    }

    const redirectUrl =
      typeof data.redirectUrl === 'string' && data.redirectUrl.trim()
        ? data.redirectUrl.trim()
        : DASHBOARD_URL;

    console.log(
      `[facebook/callback] FACEBOOK_LOGIN_SUCCESS redirect=${redirectUrl} tokenPresent=${Boolean(accessToken)}`,
    );

    const response = NextResponse.redirect(redirectUrl);
    if (accessToken) {
      setAuthCookies(response, accessToken);
    }
    return response;
  } catch (err) {
    console.error('[facebook/callback] FACEBOOK_LOGIN_FAIL', err);
    return NextResponse.redirect(`${DEFAULT_ERROR_REDIRECT}&reason=network`);
  }
}
