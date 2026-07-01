import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getOptionalInternalApiBaseUrl } from '@/lib/server-api';

export const runtime = 'nodejs';

/** Veřejné video pro TikTok PULL_FROM_URL — bez přihlášení, pouze aktivní inzeráty. */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ listingId: string }> },
) {
  const { listingId } = await ctx.params;
  const nestBase = getOptionalInternalApiBaseUrl();
  if (!nestBase) {
    return NextResponse.json({ message: 'Video není dostupné.' }, { status: 503 });
  }

  const target = `${nestBase}/public/tiktok-video/${encodeURIComponent(listingId)}`;
  const upstream = await fetch(target, { redirect: 'follow' });
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ message: 'Video není dostupné.' }, { status: 404 });
  }

  const contentType = upstream.headers.get('content-type') ?? 'video/mp4';
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': contentType.includes('video') ? contentType : 'video/mp4',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
