import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { setAuthCookies } from '@/lib/auth-cookie';
import {
  getFacebookLoginErrorUrl,
  getSocialIntegrationsUrl,
} from '@/lib/facebook-oauth-urls';
import { isFacebookPageScopeError } from '@/lib/facebook-page-scope';
import { getOptionalInternalApiBaseUrl } from '@/lib/server-api';

export const runtime = 'nodejs';

type NestUnifiedOAuthResult = {
  ok?: boolean;
  redirectUrl?: string;
  error?: string;
  message?: string;
  accessToken?: string;
  pageReviewRequired?: boolean;
  pageScopesNotAvailable?: boolean;
};

function collectQueryParams(searchParams: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function statePrefix(state: string | null): string {
  return state?.trim().charAt(0) ?? '';
}

function defaultErrorRedirect(request: NextRequest, state: string | null, reason: string): URL {
  const prefix = statePrefix(state);
  if (prefix === 'x') {
    const adminUrl = new URL('/admin/marketing/meta-centrum', request.url);
    adminUrl.searchParams.set('meta', 'error');
    adminUrl.searchParams.set('reason', reason.slice(0, 400));
    return adminUrl;
  }
  if (prefix === 'm') {
    const adminUrl = new URL('/admin/marketing/socialni-site', request.url);
    adminUrl.searchParams.set('facebook', 'error');
    adminUrl.searchParams.set('reason', reason.slice(0, 200));
    return adminUrl;
  }
  if (prefix === 'a' || prefix === 'c' || prefix === 'p') {
    const settingsUrl = new URL(getSocialIntegrationsUrl());
    settingsUrl.searchParams.set('facebook', 'error');
    settingsUrl.searchParams.set('reason', reason.slice(0, 200));
    return settingsUrl;
  }
  const loginUrl = new URL(getFacebookLoginErrorUrl(reason.slice(0, 120)));
  return loginUrl;
}

/** GET — jednotný Meta / Facebook OAuth callback (proxy na Nest backend). */
export async function GET(request: NextRequest) {
  const nestBase = getOptionalInternalApiBaseUrl();
  const { searchParams } = request.nextUrl;
  const fullUrl = request.url;
  const queryParams = collectQueryParams(searchParams);
  const queryString = searchParams.toString();
  const state = searchParams.get('state');
  const fbError = searchParams.get('error')?.trim();
  const fbErrorReason = searchParams.get('error_reason')?.trim();
  const fbErrorDesc = searchParams.get('error_description')?.trim();
  const fbParams = {
    code: searchParams.get('code'),
    state,
    error: fbError,
    error_reason: fbErrorReason,
    error_description: fbErrorDesc,
    error_code: searchParams.get('error_code'),
    granted_scopes: searchParams.get('granted_scopes'),
    denied_scopes: searchParams.get('denied_scopes'),
  };

  console.log('[facebook/meta-connect-callback] FULL_URL', fullUrl);
  console.log('[facebook/meta-connect-callback] query', JSON.stringify(queryParams));
  console.log('[facebook/meta-connect-callback] facebookParams', JSON.stringify(fbParams));
  console.log(
    '[facebook/meta-connect-callback] headers',
    JSON.stringify({
      host: request.headers.get('host'),
      'user-agent': request.headers.get('user-agent'),
      referer: request.headers.get('referer'),
      'x-forwarded-for': request.headers.get('x-forwarded-for'),
      cookie: request.headers.get('cookie') ? '[present]' : '(none)',
    }),
  );

  const settingsUrl = getSocialIntegrationsUrl();
  const reviewFallback = `${settingsUrl}&facebookPage=scopes_unavailable`;

  if (isFacebookPageScopeError(fbError, fbErrorReason, fbErrorDesc)) {
    return NextResponse.redirect(reviewFallback);
  }

  if (!nestBase) {
    console.error('[facebook/meta-connect-callback] FAIL Nest API URL missing');
    return NextResponse.redirect(
      defaultErrorRedirect(request, state, 'not_configured — API_URL chybí pro OAuth proxy'),
    );
  }

  const clientIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '';
  const userAgent = request.headers.get('user-agent') ?? '';

  try {
    const res = await fetch(
      `${nestBase}/social/facebook/meta-connect-callback?${queryString}${queryString ? '&' : ''}format=json`,
      {
        headers: {
          Accept: 'application/json',
          'x-oauth-original-url': fullUrl,
          'x-oauth-user-agent': userAgent,
          ...(clientIp ? { 'x-oauth-client-ip': clientIp } : {}),
        },
        cache: 'no-store',
      },
    );

    const data = (await res.json().catch(() => ({}))) as NestUnifiedOAuthResult;
    const redirectUrl =
      typeof data.redirectUrl === 'string' && data.redirectUrl.trim()
        ? data.redirectUrl.trim()
        : null;
    const serverMessage = data.message ?? data.error ?? null;
    const accessToken =
      typeof data.accessToken === 'string' && data.accessToken.trim()
        ? data.accessToken.trim()
        : '';

    if (!res.ok || data.ok === false || !redirectUrl) {
      const reason = serverMessage ?? 'oauth_failed';
      console.error(
        `[facebook/meta-connect-callback] FAIL http=${res.status} reason=${reason} redirectUrl=${redirectUrl ?? 'none'} query=${queryString || '(empty)'}`,
      );
      if (redirectUrl) {
        const response = NextResponse.redirect(redirectUrl);
        if (accessToken) setAuthCookies(response, accessToken);
        return response;
      }
      if (data.pageReviewRequired || data.pageScopesNotAvailable) {
        return NextResponse.redirect(reviewFallback);
      }
      return NextResponse.redirect(defaultErrorRedirect(request, state, reason));
    }

    console.log(
      `[facebook/meta-connect-callback] SUCCESS redirect=${redirectUrl} tokenPresent=${Boolean(accessToken)}`,
    );
    const response = NextResponse.redirect(redirectUrl);
    if (accessToken) setAuthCookies(response, accessToken);
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[facebook/meta-connect-callback] FAIL network err=${msg} query=${queryString || '(empty)'}`,
    );
    return NextResponse.redirect(
      defaultErrorRedirect(request, state, `network: ${msg}`.slice(0, 400)),
    );
  }
}
