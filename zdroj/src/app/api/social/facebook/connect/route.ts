import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-cookie';
import { getSocialIntegrationsUrl } from '@/lib/facebook-oauth-urls';
import { isFacebookPageScopeError } from '@/lib/facebook-page-scope';
import { getOptionalInternalApiBaseUrl } from '@/lib/server-api';

export const runtime = 'nodejs';

const SOCIAL_INTEGRATIONS_PATH = '/profil/dashboard?tab=social-integrations';

function socialIntegrationsRedirect(query: string): NextResponse {
  const base = getSocialIntegrationsUrl();
  return NextResponse.redirect(`${base}&${query}`);
}

/** GET — proxy na Nest OAuth connect-page s JWT z httpOnly cookie, pak redirect na Facebook. */
export async function GET(request: NextRequest) {
  const reselect = request.nextUrl.searchParams.get('reselect');
  const isReselect = reselect === '1' || reselect === 'true';
  console.log('[api/social/facebook/connect] OAuth start', { reselect: isReselect });

  const nestBase = getOptionalInternalApiBaseUrl();
  if (!nestBase) {
    console.error('[api/social/facebook/connect] Nest API URL není nakonfigurováno');
    return socialIntegrationsRedirect('facebook=error&reason=not_configured');
  }

  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value ?? null;
  if (!token) {
    return NextResponse.redirect(
      `/prihlaseni?redirect=${encodeURIComponent(SOCIAL_INTEGRATIONS_PATH)}`,
    );
  }

  const connectUrl = isReselect
    ? `${nestBase}/social/facebook/connect-page?reselect=1`
    : `${nestBase}/social/facebook/connect-page`;

  try {
    const res = await fetch(connectUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    const data = (await res.json().catch(() => ({}))) as {
      url?: string;
      message?: string | string[];
      reviewRequired?: boolean;
      pageScopesNotAvailable?: boolean;
    };

    if (!res.ok) {
      const msg = Array.isArray(data.message)
        ? data.message.join(' ')
        : typeof data.message === 'string'
          ? data.message
          : '';
      console.error('[api/social/facebook/connect] Nest error', res.status, data);
      if (
        res.status === 403 &&
        (data.pageScopesNotAvailable ||
          data.reviewRequired ||
          msg.includes('Pages oprávnění') ||
          isFacebookPageScopeError(msg))
      ) {
        return socialIntegrationsRedirect('facebookPage=scopes_unavailable');
      }
      if (
        res.status === 503 ||
        msg.toLowerCase().includes('není nastaven') ||
        msg.toLowerCase().includes('nakonfigurováno')
      ) {
        return socialIntegrationsRedirect('facebook=error&reason=not_configured');
      }
      return socialIntegrationsRedirect('facebook=error&reason=connect_failed');
    }

    const url = typeof data.url === 'string' ? data.url.trim() : '';
    if (!url) {
      console.error('[api/social/facebook/connect] missing url in response', data);
      return socialIntegrationsRedirect('facebook=error&reason=missing_url');
    }

    console.log('[api/social/facebook/connect] redirecting to Facebook OAuth');
    return NextResponse.redirect(url);
  } catch (err) {
    console.error('[api/social/facebook/connect]', err);
    return socialIntegrationsRedirect('facebook=error&reason=network');
  }
}
