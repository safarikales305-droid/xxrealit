import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getOptionalInternalApiBaseUrl } from '@/lib/server-api';
import { getServerAccessToken } from '@/lib/server-bearer';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const api = getOptionalInternalApiBaseUrl();
  if (!api) {
    return NextResponse.json(
      { error: 'Nastavte API_URL nebo NEXT_PUBLIC_API_URL' },
      { status: 503 },
    );
  }

  const token = await getServerAccessToken();
  const res = await fetch(`${api}/properties/${encodeURIComponent(id)}`, {
    cache: 'no-store',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
