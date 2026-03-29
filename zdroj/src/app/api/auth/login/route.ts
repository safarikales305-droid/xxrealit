import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { signAuthJwt } from '@/lib/auth-token';
import { getAuthCookieSetOptions, ACCESS_TOKEN_COOKIE } from '@/lib/auth-cookie';
import { prisma } from '@/lib/db';

const bodySchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      );
    }

    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed' },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 },
      );
    }

    const ok = await bcrypt.compare(parsed.data.password, user.password);
    if (!ok) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 },
      );
    }

    const token = signAuthJwt({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    const res = NextResponse.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
      },
    });

    res.cookies.set(ACCESS_TOKEN_COOKIE, token, getAuthCookieSetOptions());

    return res;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Login could not be completed' },
      { status: 400 },
    );
  }
}
