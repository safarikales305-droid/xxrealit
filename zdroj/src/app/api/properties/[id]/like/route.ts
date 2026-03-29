import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  ACCESS_TOKEN_COOKIE,
  getInternalApiBaseUrl,
} from '@/lib/server-api';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const token = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const api = getInternalApiBaseUrl();
  const res = await fetch(
    `${api}/properties/${encodeURIComponent(id)}/like`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
