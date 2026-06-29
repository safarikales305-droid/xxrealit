import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-cookie';
import { getOptionalInternalApiBaseUrl } from '@/lib/server-api';

export const runtime = 'nodejs';

async function proxy(req: NextRequest, path: string) {
  const nestBase = getOptionalInternalApiBaseUrl();
  if (!nestBase) {
    return NextResponse.json({ message: 'Nest API není nakonfigurováno' }, { status: 503 });
  }
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value ?? null;
  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const target = `${nestBase}/admin/verification-files${path}`;
  const isMultipart = req.headers.get('content-type')?.includes('multipart/form-data');

  const init: RequestInit = {
    method: req.method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(isMultipart ? {} : { 'Content-Type': 'application/json' }),
    },
    cache: 'no-store',
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = isMultipart ? await req.arrayBuffer() : await req.text();
    if (isMultipart) {
      init.headers = {
        ...init.headers,
        'Content-Type': req.headers.get('content-type') ?? 'multipart/form-data',
      };
    }
  }

  const r = await fetch(target, init);
  const text = await r.text();
  return new NextResponse(text, {
    status: r.status,
    headers: { 'Content-Type': r.headers.get('Content-Type') ?? 'application/json' },
  });
}

export async function GET(req: NextRequest) {
  return proxy(req, '');
}

export async function POST(req: NextRequest) {
  return proxy(req, '');
}
