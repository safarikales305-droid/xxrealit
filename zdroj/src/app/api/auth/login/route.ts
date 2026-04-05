import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyPassword } from '@/lib/auth-password';
import { signAuthJwt } from '@/lib/auth-token';
import { getAuthCookieSetOptions, ACCESS_TOKEN_COOKIE } from '@/lib/auth-cookie';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';

const bodySchema = z.object({
  email: z
    .string()
    .min(1, 'E-mail je povinný')
    .transform((s) => s.trim().toLowerCase())
    .pipe(z.string().email('Neplatný e-mail')),
  password: z.string().min(1, 'Heslo je povinné'),
});

export async function POST(request: Request) {
  try {
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: 'Neplatné JSON tělo' }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validace selhala', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const email = parsed.data.email;
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return NextResponse.json(
        { error: 'Neplatný e-mail nebo heslo' },
        { status: 401 },
      );
    }

    const ok = await verifyPassword(parsed.data.password, user.password);
    if (!ok) {
      return NextResponse.json(
        { error: 'Neplatný e-mail nebo heslo' },
        { status: 401 },
      );
    }

    const sessionUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      avatar: user.avatar ?? null,
      createdAt: user.createdAt.toISOString(),
    };

    const token = signAuthJwt({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    const res = NextResponse.json({
      success: true,
      access_token: token,
      session: { user: sessionUser },
    });

    res.cookies.set(ACCESS_TOKEN_COOKIE, token, getAuthCookieSetOptions());
    return res;
  } catch (err) {
    console.error('[login]', err);
    return NextResponse.json({ error: 'Přihlášení se nezdařilo' }, { status: 500 });
  }
}
