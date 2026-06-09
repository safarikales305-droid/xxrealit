import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getInternalApiBaseUrl } from '@/lib/server-api';
import { getServerAccessToken } from '@/lib/server-bearer';

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/profil/:id — proxy na Nest profil; chybějící profil = 200 + null. */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const api = getInternalApiBaseUrl();
  if (!api) {
    return NextResponse.json({ user: null, videos: [], posts: [], properties: [] });
  }

  const token = await getServerAccessToken();
  try {
    const res = await fetch(`${api}/users/${encodeURIComponent(id)}`, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const data = (await res.json().catch(() => null)) as {
      user?: unknown;
    } | null;
    if (!res.ok || !data?.user) {
      return NextResponse.json({ user: null, videos: [], posts: [], properties: [] });
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ user: null, videos: [], posts: [], properties: [] });
  }
}
