import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { setAuthCookies } from '@/lib/auth-cookie';
import { isFacebookPageScopeError } from '@/lib/facebook-page-scope';
import { getOptionalInternalApiBaseUrl } from '@/lib/server-api';

export const runtime = 'nodejs';

/** GET — Facebook page OAuth callback proxy. */
export async function GET(request: NextRequest) {
  const nestBase = getOptionalInternalApiBaseUrl();
  const settingsUrl = 'https://www.xxrealit.cz/profil/dashboard?tab=social-integrations';
  const reviewFallback = `${settingsUrl}&facebookPage=review_required`;

  const oauthError = request.nextUrl.searchParams.get('error');
  const errorReason = request.nextUrl.searchParams.get('error_reason');
  const errorDescription = request.nextUrl.searchParams.get('error_description');
  if (isFacebookPageScopeError(oauthError, errorReason, errorDescription)) {
    return NextResponse.redirect(reviewFallback);
  }

  if (!nestBase) {
    return NextResponse.redirect(`${settingsUrl}&facebook=error&reason=not_configured`);
  }

  const query = request.nextUrl.searchParams.toString();
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
      setAuthCookies(response, data.accessToken.trim());
    }
    return response;
  } catch {
    return NextResponse.redirect(reviewFallback);
  }
}
