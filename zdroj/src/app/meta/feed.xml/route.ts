import { getOptionalInternalApiBaseUrl } from '@/lib/server-api';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

async function proxyFeed(path: string, contentType: string) {
  const api = getOptionalInternalApiBaseUrl();
  if (!api) {
    return NextResponse.json(
      { error: 'Nastavte API_URL nebo NEXT_PUBLIC_API_URL' },
      { status: 503 },
    );
  }
  const res = await fetch(`${api}/public/meta/${path}`, { cache: 'no-store' });
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=300',
    },
  });
}

export async function GET() {
  return proxyFeed('feed.xml', 'application/xml; charset=utf-8');
}
