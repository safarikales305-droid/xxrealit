import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { setAuthCookies } from '@/lib/auth-cookie';
import {
  getFacebookConnectedDashboardUrl,
  getFacebookLoginErrorUrl,
} from '@/lib/facebook-oauth-urls';
import { getOptionalInternalApiBaseUrl } from '@/lib/server-api';

export const runtime = 'nodejs';

type NestFinishResult = {
  ok?: boolean;
  redirectUrl?: string;
  accessToken?: string;
};

/** GET — dokončení Facebook loginu: výměna OAuth state za JWT + nastavení cookies na frontend doméně. */
export async function GET(request: NextRequest) {
  const nestBase = getOptionalInternalApiBaseUrl();
  const state = request.nextUrl.searchParams.get('state')?.trim() ?? '';

  console.log(`[facebook/finish-login] FACEBOOK_CALLBACK statePresent=${Boolean(state)}`);

  if (!nestBase || !state) {
    console.error('[facebook/finish-login] FACEBOOK_LOGIN_FAIL missing nest base or state');
    return NextResponse.redirect(getFacebookLoginErrorUrl('missing_state'));
  }

  try {
    const res = await fetch(
      `${nestBase}/social/facebook/finish-login?state=${encodeURIComponent(state)}&format=json`,
      {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      },
    );
    const data = (await res.json().catch(() => ({}))) as NestFinishResult;
    const ok = data.ok !== false;
    const accessToken =
      typeof data.accessToken === 'string' && data.accessToken.trim()
        ? data.accessToken.trim()
        : '';

    if (!res.ok || !ok || !accessToken) {
      console.error(
        `[facebook/finish-login] FACEBOOK_LOGIN_FAIL http=${res.status} ok=${String(data.ok)} tokenPresent=${Boolean(accessToken)}`,
      );
      return NextResponse.redirect(getFacebookLoginErrorUrl('finish_failed'));
    }

    const redirectUrl =
      typeof data.redirectUrl === 'string' && data.redirectUrl.trim()
        ? data.redirectUrl.trim()
        : getFacebookConnectedDashboardUrl();

    console.log(`[facebook/finish-login] FACEBOOK_LOGIN_SUCCESS redirect=${redirectUrl}`);
    const response = NextResponse.redirect(redirectUrl);
    setAuthCookies(response, accessToken);
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[facebook/finish-login] FACEBOOK_LOGIN_FAIL err=${msg}`);
    return NextResponse.redirect(getFacebookLoginErrorUrl('network'));
  }
}
