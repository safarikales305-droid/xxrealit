import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { setAuthCookies } from '@/lib/auth-cookie';
import {
  getFacebookConnectedDashboardUrl,
  getFacebookLoginErrorUrl,
} from '@/lib/facebook-oauth-urls';
import { getOptionalInternalApiBaseUrl } from '@/lib/server-api';

export const runtime = 'nodejs';

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
    return NextResponse.redirect(getFacebookLoginErrorUrl('not_configured'));
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
          : getFacebookLoginErrorUrl(),
      );
    }

    const redirectUrl =
      typeof data.redirectUrl === 'string' && data.redirectUrl.trim()
        ? data.redirectUrl.trim()
        : getFacebookConnectedDashboardUrl();

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
    return NextResponse.redirect(getFacebookLoginErrorUrl('network'));
  }
}
