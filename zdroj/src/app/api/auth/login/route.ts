import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getInternalApiBaseUrl } from '@/lib/server-api';

const bodySchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

/** Optional JSON proxy to Nest — prefer NextAuth `signIn("credentials")` from the app. */
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Validation failed', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const api = getInternalApiBaseUrl();
  const res = await fetch(`${api}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.data),
  });

  const data: unknown = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
