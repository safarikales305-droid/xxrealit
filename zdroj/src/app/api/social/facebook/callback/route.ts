import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getAuthCookieSetOptions, ACCESS_TOKEN_COOKIE } from '@/lib/auth-cookie';
import { getOptionalInternalApiBaseUrl } from '@/lib/server-api';

export const runtime = 'nodejs';

const DEFAULT_ERROR_REDIRECT = 'https://www.xxrealit.cz/login?facebook=error';

type NestCallbackResult = {
  ok?: boolean;
  redirectUrl?: string;
  accessToken?: string;
};

/** GET — Facebook OAuth redirect (když redirect URI míří na frontend doménu). */
export async function GET(request: NextRequest) {
  const nestBase = getOptionalInternalApiBaseUrl();
  const { searchParams } = request.nextUrl;

  if (!nestBase) {
    console.error('[api/social/facebook/callback] Nest API URL není nakonfigurováno');
    return NextResponse.redirect(
      `${DEFAULT_ERROR_REDIRECT}&reason=not_configured`,
    );
  }

  const query = searchParams.toString();
  try {
    const res = await fetch(`${nestBase}/social/facebook/callback?${query}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    const data = (await res.json().catch(() => ({}))) as NestCallbackResult;
    const redirectUrl =
      typeof data.redirectUrl === 'string' && data.redirectUrl.trim()
        ? data.redirectUrl.trim()
        : DEFAULT_ERROR_REDIRECT;

    const response = NextResponse.redirect(redirectUrl);
    if (typeof data.accessToken === 'string' && data.accessToken.trim()) {
      response.cookies.set(
        ACCESS_TOKEN_COOKIE,
        data.accessToken.trim(),
        getAuthCookieSetOptions(),
      );
    }
    return response;
  } catch (err) {
    console.error('[api/social/facebook/callback]', err);
    return NextResponse.redirect(`${DEFAULT_ERROR_REDIRECT}&reason=network`);
  }
}
