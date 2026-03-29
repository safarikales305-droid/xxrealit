import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getInternalApiBaseUrl } from '@/lib/server-api';
import { isUserRole } from '@/lib/roles';

const bodySchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
  name: z.string().trim().max(120).optional(),
  role: z.string().refine(isUserRole, { message: 'Invalid role' }),
});

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

  const { name, email, password, role } = parsed.data;
  const api = getInternalApiBaseUrl();
  const res = await fetch(`${api}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      role,
      name: name && name.length > 0 ? name : undefined,
    }),
  });

  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(data, { status: res.status });
  }

  if (typeof data === 'object' && data !== null && 'accessToken' in data) {
    const { accessToken: _omit, ...safe } = data as Record<string, unknown>;
    return NextResponse.json(safe, { status: res.status });
  }

  return NextResponse.json(data, { status: res.status });
}
