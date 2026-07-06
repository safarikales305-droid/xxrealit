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

/** GET — Meta Centrum OAuth callback (proxy na Nest backend). */
export async function GET(request: NextRequest) {
  const nestBase = getOptionalInternalApiBaseUrl();
  const { searchParams } = request.nextUrl;
  const fbError = searchParams.get('error')?.trim();
  const fbErrorReason = searchParams.get('error_reason')?.trim();
  const fbErrorDesc = searchParams.get('error_description')?.trim();

  console.log(
    `[facebook/meta-connect-callback] START error=${fbError ?? 'none'} reason=${fbErrorReason ?? 'none'} codePresent=${Boolean(searchParams.get('code'))} statePresent=${Boolean(searchParams.get('state'))}`,
  );

  if (!nestBase) {
    console.error('[facebook/meta-connect-callback] FAIL Nest API URL missing');
    const adminUrl = new URL('/admin/marketing/meta-centrum', request.url);
    adminUrl.searchParams.set('meta', 'error');
    adminUrl.searchParams.set('reason', 'not_configured');
    return NextResponse.redirect(adminUrl);
  }

  const query = searchParams.toString();
  try {
    const res = await fetch(
      `${nestBase}/social/facebook/meta-connect-callback?${query}${query ? '&' : ''}format=json`,
      {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      },
    );

    const data = (await res.json().catch(() => ({}))) as NestMetaConnectCallbackResult;
    const redirectUrl =
      typeof data.redirectUrl === 'string' && data.redirectUrl.trim()
        ? data.redirectUrl.trim()
        : null;

    if (!res.ok || data.ok === false || !redirectUrl) {
      const reason = data.message ?? data.error ?? 'oauth_failed';
      console.error(
        `[facebook/meta-connect-callback] FAIL http=${res.status} reason=${reason} redirectUrl=${redirectUrl ?? 'none'}`,
      );
      if (redirectUrl) {
        return NextResponse.redirect(redirectUrl);
      }
      const adminUrl = new URL('/admin/marketing/meta-centrum', request.url);
      adminUrl.searchParams.set('meta', 'error');
      adminUrl.searchParams.set('reason', reason.slice(0, 200));
      if (fbErrorDesc) {
        adminUrl.searchParams.set('redirect_uri', '');
      }
      return NextResponse.redirect(adminUrl);
    }

    console.log(`[facebook/meta-connect-callback] SUCCESS redirect=${redirectUrl}`);
    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[facebook/meta-connect-callback] FAIL network err=${msg}`);
    const adminUrl = new URL('/admin/marketing/meta-centrum', request.url);
    adminUrl.searchParams.set('meta', 'error');
    adminUrl.searchParams.set('reason', 'network');
    return NextResponse.redirect(adminUrl);
  }
}
