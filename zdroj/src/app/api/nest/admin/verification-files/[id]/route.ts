import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-cookie';
import { getOptionalInternalApiBaseUrl } from '@/lib/server-api';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

async function proxy(req: NextRequest, id: string) {
  const nestBase = getOptionalInternalApiBaseUrl();
  if (!nestBase) {
    return NextResponse.json({ message: 'Nest API není nakonfigurováno' }, { status: 503 });
  }
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value ?? null;
  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const target = `${nestBase}/admin/verification-files/${encodeURIComponent(id)}`;
  const init: RequestInit = {
    method: req.method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  };

  if (req.method === 'PATCH') {
    init.body = await req.text();
  }

  const r = await fetch(target, init);
  const text = await r.text();
  return new NextResponse(text, {
    status: r.status,
    headers: { 'Content-Type': r.headers.get('Content-Type') ?? 'application/json' },
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  return proxy(req, id);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  return proxy(req, id);
}
