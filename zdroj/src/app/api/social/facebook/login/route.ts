import { NextResponse } from 'next/server';
import { getOptionalInternalApiBaseUrl } from '@/lib/server-api';

export const runtime = 'nodejs';

/** GET — redirect na Facebook OAuth login URL. */
export async function GET() {
  const nestBase = getOptionalInternalApiBaseUrl();
  if (!nestBase) {
    return NextResponse.json({ error: 'API není nakonfigurováno' }, { status: 503 });
  }
  try {
    const res = await fetch(`${nestBase}/social/facebook/login`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string };
    const url = typeof data.url === 'string' ? data.url.trim() : '';
    if (!url) {
      return NextResponse.json({ error: 'Chybí OAuth URL' }, { status: 502 });
    }
    return NextResponse.json({ url });
  } catch {
    return NextResponse.json({ error: 'Síťová chyba' }, { status: 502 });
  }
}
