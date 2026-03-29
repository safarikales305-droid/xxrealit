import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { signAuthJwt } from '@/lib/auth-token';
import { getAuthCookieSetOptions, ACCESS_TOKEN_COOKIE } from '@/lib/auth-cookie';
import { prisma } from '@/lib/db';

const bodySchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .transform((s) => s.trim())
    .pipe(z.string().email('Invalid email')),
  password: z.string().min(1, 'Password is required'),
});

export async function POST(request: Request) {
  try {
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Validation failed', details: 'Invalid JSON body' },
        { status: 400 },
      );
    }

    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.message },
        { status: 400 },
      );
    }

    const email = parsed.data.email.trim();
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Invalid email or password' },
        { status: 401 },
      );
    }

    const ok = await bcrypt.compare(parsed.data.password, user.password);
    if (!ok) {
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Invalid email or password' },
        { status: 401 },
      );
    }

    const sessionUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    };

    const token = signAuthJwt({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    const res = NextResponse.json({
      success: true,
      session: {
        user: sessionUser,
      },
      token,
    });

    res.cookies.set(ACCESS_TOKEN_COOKIE, token, getAuthCookieSetOptions());

    return res;
  } catch (err) {
    console.error('[login]', err);
    return NextResponse.json(
      { error: 'Server error', details: 'Login could not be completed' },
      { status: 500 },
    );
  }
}
