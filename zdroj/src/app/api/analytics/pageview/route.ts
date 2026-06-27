import { NextRequest, NextResponse } from 'next/server';
import { getOptionalInternalApiBaseUrl } from '@/lib/server-api';

export const runtime = 'nodejs';

/** POST /api/analytics/pageview — proxy na Nest bez JWT (veřejný tracking). */
export async function POST(req: NextRequest) {
  const nestBase = getOptionalInternalApiBaseUrl();
  if (!nestBase) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'no_api' });
  }

  const body = await req.text();
  const forwardedFor = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const cfCountry = req.headers.get('cf-ipcountry');
  const vercelCountry = req.headers.get('x-vercel-ip-country');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent': req.headers.get('user-agent') ?? '',
  };
  if (forwardedFor) headers['x-forwarded-for'] = forwardedFor;
  if (realIp) headers['x-real-ip'] = realIp;
  if (cfCountry) headers['cf-ipcountry'] = cfCountry;
  if (vercelCountry) headers['x-vercel-ip-country'] = vercelCountry;

  try {
    const r = await fetch(`${nestBase}/analytics/pageview`, {
      method: 'POST',
      headers,
      body,
      cache: 'no-store',
    });
    const text = await r.text();
    return new NextResponse(text, {
      status: r.status,
      headers: { 'Content-Type': r.headers.get('Content-Type') ?? 'application/json' },
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}
