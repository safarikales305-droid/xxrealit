import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  ACCESS_TOKEN_COOKIE,
  getInternalApiBaseUrl,
} from '@/lib/server-api';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const token = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

  const api = getInternalApiBaseUrl();
  const res = await fetch(`${api}/users/${encodeURIComponent(id)}`, {
    cache: 'no-store',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
