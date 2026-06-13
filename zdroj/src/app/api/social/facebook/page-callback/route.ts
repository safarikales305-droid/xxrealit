import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getAuthCookieSetOptions, ACCESS_TOKEN_COOKIE } from '@/lib/auth-cookie';
import { getOptionalInternalApiBaseUrl } from '@/lib/server-api';

export const runtime = 'nodejs';

/** GET — Facebook page OAuth callback proxy. */
export async function GET(request: NextRequest) {
  const nestBase = getOptionalInternalApiBaseUrl();
  const settingsUrl = 'https://www.xxrealit.cz/profil/dashboard?tab=social-integrations';
  if (!nestBase) {
    return NextResponse.redirect(`${settingsUrl}&facebook=error&reason=not_configured`);
  }

  const query = request.nextUrl.searchParams.toString();
  const reviewFallback = `${settingsUrl}&facebookPage=review_required`;
  try {
    const res = await fetch(
      `${nestBase}/social/facebook/page-callback?${query}${query ? '&' : ''}format=json`,
      {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      },
    );
    const data = (await res.json().catch(() => ({}))) as {
      redirectUrl?: string;
      accessToken?: string;
      pageReviewRequired?: boolean;
    };
    const redirectUrl =
      typeof data.redirectUrl === 'string' && data.redirectUrl.trim()
        ? data.redirectUrl.trim()
        : data.pageReviewRequired
          ? reviewFallback
          : `${settingsUrl}&facebook=error`;
    const response = NextResponse.redirect(redirectUrl);
    if (typeof data.accessToken === 'string' && data.accessToken.trim()) {
      response.cookies.set(
        ACCESS_TOKEN_COOKIE,
        data.accessToken.trim(),
        getAuthCookieSetOptions(),
      );
    }
    return response;
  } catch {
    return NextResponse.redirect(reviewFallback);
  }
}
