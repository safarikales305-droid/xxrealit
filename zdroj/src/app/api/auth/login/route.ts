import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyPassword } from '@/lib/auth-password';
import { signAuthJwt } from '@/lib/auth-token';
import { getAuthCookieSetOptions, ACCESS_TOKEN_COOKIE } from '@/lib/auth-cookie';
import { prisma } from '@/lib/db';
import { getOptionalInternalApiBaseUrl } from '@/lib/server-api';

export const runtime = 'nodejs';

const bodySchema = z.object({
  email: z
    .string()
    .min(1, 'E-mail je povinný')
    .transform((s) => s.trim().toLowerCase())
    .pipe(z.string().email('Neplatný e-mail')),
  password: z.string().min(1, 'Heslo je povinné'),
});

type NestLoginOk = {
  accessToken?: string;
  user?: {
    id?: string;
    email?: string;
    role?: string;
    avatar?: string | null;
    coverImage?: string | null;
    bio?: string | null;
    createdAt?: string;
  };
};

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
    const password = parsed.data.password;

    const nestBase = getOptionalInternalApiBaseUrl();
    if (nestBase) {
      try {
        const nestRes = await fetch(`${nestBase}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        const nestData = (await nestRes.json().catch(() => ({}))) as NestLoginOk & {
          error?: string | { message?: string };
        };

        if (nestRes.ok && typeof nestData.accessToken === 'string' && nestData.user) {
          const u = nestData.user;
          if (typeof u.id === 'string' && typeof u.email === 'string' && typeof u.role === 'string') {
            const sessionUser = {
              id: u.id,
              email: u.email,
              role: u.role,
              avatar: u.avatar ?? null,
              coverImage: u.coverImage ?? null,
              bio: u.bio ?? null,
              createdAt:
                typeof u.createdAt === 'string'
                  ? u.createdAt
                  : new Date().toISOString(),
            };

            const res = NextResponse.json({
              success: true,
              access_token: nestData.accessToken,
              session: { user: sessionUser },
            });
            res.cookies.set(ACCESS_TOKEN_COOKIE, nestData.accessToken, getAuthCookieSetOptions());
            // Client actions (listing/post/reactions) read token from JS-accessible cookie.
            res.cookies.set('token', nestData.accessToken, {
              httpOnly: false,
              sameSite: 'lax',
              path: '/',
              maxAge: 60 * 60 * 24 * 7,
              secure: process.env.NODE_ENV === 'production',
            });
            return res;
          }
        }

        if (nestRes.status === 401) {
          return NextResponse.json(
            { error: 'Neplatný e-mail nebo heslo' },
            { status: 401 },
          );
        }

        console.warn('[login] Nest auth unexpected status', nestRes.status, nestData);
      } catch (e) {
        console.error('[login] Nest nedostupný, zkouším lokální Prisma', e);
      }
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return NextResponse.json(
        { error: 'Neplatný e-mail nebo heslo' },
        { status: 401 },
      );
    }

    const ok = await verifyPassword(password, user.password);
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
      coverImage: (user as { coverImage?: string | null }).coverImage ?? null,
      bio: user.bio ?? null,
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
    res.cookies.set('token', token, {
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
      secure: process.env.NODE_ENV === 'production',
    });
    return res;
  } catch (err) {
    console.error('[login]', err);
    return NextResponse.json({ error: 'Přihlášení se nezdařilo' }, { status: 500 });
  }
}
