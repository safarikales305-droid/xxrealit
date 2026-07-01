import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getOptionalInternalApiBaseUrl } from '@/lib/server-api';

export const runtime = 'nodejs';

/** GET — TikTok OAuth callback → Nest token exchange → redirect do administrace. */
export async function GET(request: NextRequest) {
  const nestBase = getOptionalInternalApiBaseUrl();
  const adminUrl = '/admin/marketing/tiktok';
  if (!nestBase) {
    return NextResponse.redirect(`${adminUrl}?tiktok=error&reason=not_configured`);
  }

  const query = request.nextUrl.searchParams.toString();
  try {
    const res = await fetch(`${nestBase}/social/tiktok/callback?${query}`, {
      redirect: 'manual',
      cache: 'no-store',
    });
    const location = res.headers.get('location');
    if (location) {
      return NextResponse.redirect(location);
    }
    return NextResponse.redirect(`${adminUrl}?tiktok=error&reason=callback_failed`);
  } catch {
    return NextResponse.redirect(`${adminUrl}?tiktok=error&reason=network`);
  }
}
