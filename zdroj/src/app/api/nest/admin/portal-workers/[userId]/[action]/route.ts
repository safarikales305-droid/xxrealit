import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-cookie';
import { getOptionalInternalApiBaseUrl } from '@/lib/server-api';

export const runtime = 'nodejs';

const WORKER_STATUS_ACTIONS = new Set(['approve', 'reject', 'suspend', 'activate']);

async function proxyToNest(req: NextRequest, userId: string, action: string) {
  const nestBase = getOptionalInternalApiBaseUrl();
  if (!nestBase) {
    return NextResponse.json({ message: 'Nest API není nakonfigurováno' }, { status: 503 });
  }
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value ?? null;
  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const target = `${nestBase}/admin/portal-workers/${encodeURIComponent(userId)}/${encodeURIComponent(action)}${url.search}`;

  const init: RequestInit = {
    method: req.method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(req.method !== 'GET' && req.method !== 'HEAD'
        ? { 'Content-Type': 'application/json' }
        : {}),
    },
    cache: 'no-store',
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.text();
  }

  const r = await fetch(target, init);
  const text = await r.text();
  return new NextResponse(text, {
    status: r.status,
    headers: { 'Content-Type': r.headers.get('Content-Type') ?? 'application/json' },
  });
}

type Ctx = { params: Promise<{ userId: string; action: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { userId, action } = await ctx.params;
  if (WORKER_STATUS_ACTIONS.has(action)) {
    return NextResponse.json({ message: 'Metoda není podporována' }, { status: 405 });
  }
  return proxyToNest(req, userId, action);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { userId, action } = await ctx.params;
  return proxyToNest(req, userId, action);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { userId, action } = await ctx.params;
  if (WORKER_STATUS_ACTIONS.has(action)) {
    return NextResponse.json({ message: 'Metoda není podporována' }, { status: 405 });
  }
  return proxyToNest(req, userId, action);
}
