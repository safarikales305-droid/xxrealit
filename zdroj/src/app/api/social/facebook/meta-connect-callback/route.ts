import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getOptionalInternalApiBaseUrl } from '@/lib/server-api';

export const runtime = 'nodejs';

type NestMetaConnectCallbackResult = {
  ok?: boolean;
  redirectUrl?: string;
  error?: string;
  message?: string;
};

function collectQueryParams(searchParams: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

/** GET — Meta Centrum OAuth callback (proxy na Nest backend). */
export async function GET(request: NextRequest) {
  const nestBase = getOptionalInternalApiBaseUrl();
  const { searchParams } = request.nextUrl;
  const fullUrl = request.url;
  const queryParams = collectQueryParams(searchParams);
  const queryString = searchParams.toString();
  const fbParams = {
    code: searchParams.get('code'),
    state: searchParams.get('state'),
    error: searchParams.get('error'),
    error_reason: searchParams.get('error_reason'),
    error_description: searchParams.get('error_description'),
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

  if (!nestBase) {
    console.error('[facebook/meta-connect-callback] FAIL Nest API URL missing');
    const adminUrl = new URL('/admin/marketing/meta-centrum', request.url);
    adminUrl.searchParams.set('meta', 'error');
    adminUrl.searchParams.set(
      'reason',
      'not_configured — API_URL chybí pro OAuth proxy',
    );
    return NextResponse.redirect(adminUrl);
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

    const data = (await res.json().catch(() => ({}))) as NestMetaConnectCallbackResult;
    const redirectUrl =
      typeof data.redirectUrl === 'string' && data.redirectUrl.trim()
        ? data.redirectUrl.trim()
        : null;
    const serverMessage = data.message ?? data.error ?? null;

    if (!res.ok || data.ok === false || !redirectUrl) {
      const reason = serverMessage ?? 'oauth_failed';
      console.error(
        `[facebook/meta-connect-callback] FAIL http=${res.status} reason=${reason} redirectUrl=${redirectUrl ?? 'none'} query=${queryString || '(empty)'}`,
      );
      if (redirectUrl) {
        return NextResponse.redirect(redirectUrl);
      }
      const adminUrl = new URL('/admin/marketing/meta-centrum', request.url);
      adminUrl.searchParams.set('meta', 'error');
      adminUrl.searchParams.set('reason', reason.slice(0, 400));
      return NextResponse.redirect(adminUrl);
    }

    console.log(`[facebook/meta-connect-callback] SUCCESS redirect=${redirectUrl}`);
    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[facebook/meta-connect-callback] FAIL network err=${msg} query=${queryString || '(empty)'}`,
    );
    const adminUrl = new URL('/admin/marketing/meta-centrum', request.url);
    adminUrl.searchParams.set('meta', 'error');
    adminUrl.searchParams.set('reason', `network: ${msg}`.slice(0, 400));
    return NextResponse.redirect(adminUrl);
  }
}
