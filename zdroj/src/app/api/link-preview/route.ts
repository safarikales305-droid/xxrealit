import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getOptionalInternalApiBaseUrl } from '@/lib/server-api';

export const runtime = 'nodejs';

/** Proxy POST /api/link-preview → Nest backend (oprava 404 při same-origin API base). */
export async function POST(request: NextRequest) {
  const nestBase = getOptionalInternalApiBaseUrl();
  if (!nestBase) {
    return NextResponse.json(
      { message: 'Nastavte API_URL nebo NEXT_PUBLIC_API_URL' },
      { status: 503 },
    );
  }

  const auth = request.headers.get('authorization');
  const body = await request.text();

  try {
    const r = await fetch(`${nestBase}/link-preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(auth ? { Authorization: auth } : {}),
      },
      body,
      signal: AbortSignal.timeout(8_500),
      cache: 'no-store',
    });

    const text = await r.text();
    return new NextResponse(text, {
      status: r.status,
      headers: {
        'Content-Type': r.headers.get('Content-Type') ?? 'application/json',
      },
    });
  } catch {
    return NextResponse.json(
      {
        url: '',
        title: 'Externí odkaz',
        description: 'Kliknutím otevřete původní inzerát.',
        image: null,
        siteName: 'Externí odkaz',
        failed: true,
      },
      { status: 200 },
    );
  }
}
