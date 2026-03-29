import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { getInternalApiBaseUrl } from '@/lib/server-api';

export async function GET() {
  const session = await auth();
  const token = session?.apiAccessToken;
  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const api = getInternalApiBaseUrl();
  const res = await fetch(`${api}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
