import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-cookie';
import { getOptionalInternalApiBaseUrl } from '@/lib/server-api';

export const runtime = 'nodejs';

type RouteCtx = { params: Promise<{ id: string }> };

async function forwardToNest(
  id: string,
  init: RequestInit & { method: string },
  bodyText?: string,
) {
  const nestBase = getOptionalInternalApiBaseUrl();
  if (!nestBase) {
    return NextResponse.json({ message: 'Nest API není nakonfigurováno' }, { status: 503 });
  }
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value ?? null;
  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
  if (bodyText !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const r = await fetch(`${nestBase}/shorts-listings/${encodeURIComponent(id)}`, {
    ...init,
    headers,
    body: bodyText,
    cache: 'no-store',
  });
  const text = await r.text();
  return new NextResponse(text, {
    status: r.status,
    headers: {
      'Content-Type': r.headers.get('Content-Type') ?? 'application/json',
    },
  });
}

export async function GET(_req: Request, ctx: RouteCtx) {
  const { id } = await ctx.params;
  return forwardToNest(id, { method: 'GET' });
}

export async function PATCH(req: Request, ctx: RouteCtx) {
  const { id } = await ctx.params;
  let bodyText: string;
  try {
    bodyText = await req.text();
  } catch {
    return NextResponse.json({ message: 'Neplatné tělo požadavku' }, { status: 400 });
  }
  return forwardToNest(id, { method: 'PATCH' }, bodyText);
}
