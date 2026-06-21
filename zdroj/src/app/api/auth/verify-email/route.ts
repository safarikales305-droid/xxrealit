import { NextResponse } from 'next/server';
import { getInternalApiBaseUrl } from '@/lib/server-api';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get('token')?.trim() ?? '';
    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error: 'Ověřovací odkaz je neplatný nebo expiroval.',
        },
        { status: 400 },
      );
    }

    const nestBase = getInternalApiBaseUrl();
    const res = await fetch(
      `${nestBase}/auth/verify-email?token=${encodeURIComponent(token)}`,
      { cache: 'no-store' },
    );
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Požadavek se nepodařilo dokončit.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
