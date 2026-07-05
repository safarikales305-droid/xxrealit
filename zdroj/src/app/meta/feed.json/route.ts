import { getOptionalInternalApiBaseUrl } from '@/lib/server-api';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const api = getOptionalInternalApiBaseUrl();
  if (!api) {
    return NextResponse.json(
      { error: 'Nastavte API_URL nebo NEXT_PUBLIC_API_URL' },
      { status: 503 },
    );
  }
  const res = await fetch(`${api}/public/meta/feed.json`, { cache: 'no-store' });
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
