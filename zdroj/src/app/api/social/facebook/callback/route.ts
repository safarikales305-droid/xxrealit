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
  error?: string;
  reason?: string;
};

function extractReasonFromRedirectUrl(url: string | undefined): string | undefined {
  if (!url?.trim()) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('reason')?.trim() || undefined;
  } catch {
    return undefined;
  }
}

/** GET — Facebook OAuth redirect (když redirect URI míří na frontend doménu). */
export async function GET(request: NextRequest) {
  const nestBase = getOptionalInternalApiBaseUrl();
  const { searchParams } = request.nextUrl;
  const fbError = searchParams.get('error')?.trim();
  const fbErrorReason = searchParams.get('error_reason')?.trim();
  const fbErrorDesc = searchParams.get('error_description')?.trim();

  console.log(
    `[facebook/callback] FACEBOOK_CALLBACK_START error=${fbError ?? 'none'} reason=${fbErrorReason ?? 'none'} codePresent=${Boolean(searchParams.get('code'))} statePresent=${Boolean(searchParams.get('state'))}`,
  );

  if (fbError) {
    const reason = fbErrorReason || fbError || 'access_denied';
    console.error(
      `[facebook/callback] FACEBOOK_LOGIN_FAIL facebook_error=${reason} desc=${fbErrorDesc ?? 'none'}`,
    );
    return NextResponse.redirect(getFacebookLoginErrorUrl(reason));
  }

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
    const nestReason =
      data.reason?.trim() ||
      extractReasonFromRedirectUrl(data.redirectUrl) ||
      data.error?.trim();

    if (!res.ok || !ok) {
      console.error(
        `[facebook/callback] FACEBOOK_LOGIN_FAIL http=${res.status} reason=${nestReason ?? 'unknown'} redirectUrl=${data.redirectUrl ?? 'none'}`,
      );
      return NextResponse.redirect(
        typeof data.redirectUrl === 'string' && data.redirectUrl.trim()
          ? data.redirectUrl.trim()
          : getFacebookLoginErrorUrl(nestReason ?? 'oauth_failed'),
      );
    }

    if (!accessToken) {
      console.error('[facebook/callback] FACEBOOK_LOGIN_FAIL missing_access_token');
      return NextResponse.redirect(getFacebookLoginErrorUrl('missing_token'));
    }

    const redirectUrl =
      typeof data.redirectUrl === 'string' && data.redirectUrl.trim()
        ? data.redirectUrl.trim()
        : getFacebookConnectedDashboardUrl();

    console.log(
      `[facebook/callback] FACEBOOK_LOGIN_SUCCESS redirect=${redirectUrl} tokenPresent=true`,
    );

    const response = NextResponse.redirect(redirectUrl);
    setAuthCookies(response, accessToken);
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[facebook/callback] FACEBOOK_LOGIN_FAIL network err=${msg}`);
    return NextResponse.redirect(getFacebookLoginErrorUrl('network'));
  }
}
