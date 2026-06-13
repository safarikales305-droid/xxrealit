import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-cookie';
import { getOptionalInternalApiBaseUrl } from '@/lib/server-api';

export const runtime = 'nodejs';

const SETTINGS_PATH = '/profil/dashboard?tab=settings';

function settingsErrorRedirect(reason: string): NextResponse {
  return NextResponse.redirect(
    `${SETTINGS_PATH}&facebook=error&reason=${encodeURIComponent(reason)}`,
  );
}

/** GET — proxy na Nest OAuth connect s JWT z httpOnly cookie, pak redirect na Facebook. */
export async function GET() {
  const nestBase = getOptionalInternalApiBaseUrl();
  if (!nestBase) {
    console.error('[api/social/facebook/connect] Nest API URL není nakonfigurováno');
    return settingsErrorRedirect('not_configured');
  }

  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value ?? null;
  if (!token) {
    return NextResponse.redirect(
      `/prihlaseni?redirect=${encodeURIComponent(SETTINGS_PATH)}`,
    );
  }

  try {
    const res = await fetch(`${nestBase}/social/facebook/connect-page`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    const data = (await res.json().catch(() => ({}))) as {
      url?: string;
      message?: string | string[];
    };

    if (!res.ok) {
      const msg = Array.isArray(data.message)
        ? data.message.join(' ')
        : typeof data.message === 'string'
          ? data.message
          : '';
      console.error('[api/social/facebook/connect] Nest error', res.status, data);
      if (
        res.status === 503 ||
        msg.toLowerCase().includes('není nastaven') ||
        msg.toLowerCase().includes('nakonfigurováno')
      ) {
        return settingsErrorRedirect('not_configured');
      }
      return settingsErrorRedirect('connect_failed');
    }

    const url = typeof data.url === 'string' ? data.url.trim() : '';
    if (!url) {
      console.error('[api/social/facebook/connect] missing url in response', data);
      return settingsErrorRedirect('missing_url');
    }

    return NextResponse.redirect(url);
  } catch (err) {
    console.error('[api/social/facebook/connect]', err);
    return settingsErrorRedirect('network');
  }
}
