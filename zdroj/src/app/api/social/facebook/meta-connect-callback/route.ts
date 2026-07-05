import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getOptionalInternalApiBaseUrl } from '@/lib/server-api';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const api = getOptionalInternalApiBaseUrl();
  if (!api) {
    return NextResponse.json(
      { error: 'Nastavte API_URL nebo NEXT_PUBLIC_API_URL' },
      { status: 503 },
    );
  }
  const qs = request.nextUrl.searchParams.toString();
  const suffix = qs ? `?${qs}` : '';
  const res = await fetch(`${api}/social/facebook/meta-connect-callback${suffix}`, {
    cache: 'no-store',
    redirect: 'manual',
  });

  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get('location');
    if (location) {
      return NextResponse.redirect(location, res.status);
    }
  }

  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') ?? 'text/html' },
  });
}
