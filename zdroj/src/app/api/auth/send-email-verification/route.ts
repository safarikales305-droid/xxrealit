import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-cookie';
import { getInternalApiBaseUrl } from '@/lib/server-api';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    let token: string | null = null;
    if (authHeader?.toLowerCase().startsWith('bearer ')) {
      token = authHeader.slice(7).trim();
    }
    if (!token) {
      token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value ?? null;
    }
    if (!token) {
      return NextResponse.json({ success: false, error: 'Nejste přihlášeni.' }, { status: 401 });
    }

    const nestBase = getInternalApiBaseUrl();
    const res = await fetch(`${nestBase}/auth/send-email-verification`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Požadavek se nepodařilo dokončit.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
