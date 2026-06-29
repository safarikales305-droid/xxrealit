import { NextRequest, NextResponse } from 'next/server';
import { getOptionalInternalApiBaseUrl } from '@/lib/server-api';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ filename: string }> };

/** Veřejné servírování ověřovacího souboru z kořene domény (bez autentizace). */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { filename } = await ctx.params;
  const nestBase = getOptionalInternalApiBaseUrl();
  if (!nestBase) {
    return new NextResponse('Service unavailable', { status: 503 });
  }

  const r = await fetch(
    `${nestBase}/public/verification-files/${encodeURIComponent(filename)}`,
    { cache: 'no-store' },
  );

  if (!r.ok) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const content = await r.text();
  const contentType = r.headers.get('Content-Type') ?? 'text/plain; charset=utf-8';

  return new NextResponse(content, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      ...(contentType.startsWith('text/html')
        ? {
            'Content-Security-Policy':
              "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
          }
        : {}),
    },
  });
}
