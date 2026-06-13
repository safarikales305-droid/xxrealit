import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { setAuthCookies } from '@/lib/auth-cookie';
import { getOptionalInternalApiBaseUrl } from '@/lib/server-api';

export const runtime = 'nodejs';

const DEFAULT_ERROR_REDIRECT = 'https://www.xxrealit.cz/login?facebook=error';

type NestFinishResult = {
  ok?: boolean;
  redirectUrl?: string;
  accessToken?: string;
};

/** GET — dokončení Facebook loginu: výměna OAuth state za JWT + nastavení cookies na frontend doméně. */
export async function GET(request: NextRequest) {
  const nestBase = getOptionalInternalApiBaseUrl();
  const state = request.nextUrl.searchParams.get('state')?.trim() ?? '';

  if (!nestBase || !state) {
    console.error('[api/social/facebook/finish-login] missing nest base or state');
    return NextResponse.redirect(`${DEFAULT_ERROR_REDIRECT}&reason=missing_state`);
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
    const redirectUrl =
      typeof data.redirectUrl === 'string' && data.redirectUrl.trim()
        ? data.redirectUrl.trim()
        : `${DEFAULT_ERROR_REDIRECT}&reason=finish_failed`;

    const response = NextResponse.redirect(redirectUrl);
    if (typeof data.accessToken === 'string' && data.accessToken.trim()) {
      setAuthCookies(response, data.accessToken.trim());
    }
    return response;
  } catch (err) {
    console.error('[api/social/facebook/finish-login]', err);
    return NextResponse.redirect(`${DEFAULT_ERROR_REDIRECT}&reason=network`);
  }
}
