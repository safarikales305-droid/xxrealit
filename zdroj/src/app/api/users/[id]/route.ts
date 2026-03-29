import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getInternalApiBaseUrl } from '@/lib/server-api';
import { getServerAccessToken } from '@/lib/server-bearer';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const token = await getServerAccessToken();

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
