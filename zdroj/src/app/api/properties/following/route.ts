import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  ACCESS_TOKEN_COOKIE,
  getInternalApiBaseUrl,
} from '@/lib/server-api';

export async function GET(request: NextRequest) {
  const token = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const api = getInternalApiBaseUrl();
  const res = await fetch(`${api}/properties/following`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
