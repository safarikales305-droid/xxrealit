import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-cookie';
import { getOptionalInternalApiBaseUrl } from '@/lib/server-api';

export const runtime = 'nodejs';

/** GET — spustí TikTok OAuth pro admina (pouze ADMIN). */
export async function GET() {
  const nestBase = getOptionalInternalApiBaseUrl();
  if (!nestBase) {
    return NextResponse.redirect('/admin/marketing/tiktok?tiktok=error&reason=not_configured');
  }

  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value ?? null;
  if (!token) {
    return NextResponse.redirect(
      `/prihlaseni?redirect=${encodeURIComponent('/admin/marketing/tiktok')}`,
    );
  }

  try {
    const res = await fetch(`${nestBase}/social/tiktok/auth-url`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string };
    if (!res.ok || !data.url) {
      return NextResponse.redirect('/admin/marketing/tiktok?tiktok=error&reason=auth_url_failed');
    }
    return NextResponse.redirect(data.url);
  } catch {
    return NextResponse.redirect('/admin/marketing/tiktok?tiktok=error&reason=network');
  }
}
