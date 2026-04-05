import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { verifyAuthJwt } from '@/lib/auth-token';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-cookie';
import { prisma } from '@/lib/db';
import { getOptionalInternalApiBaseUrl } from '@/lib/server-api';

export const runtime = 'nodejs';

type NestMeUser = {
  id?: string;
  email?: string;
  role?: string;
  avatar?: string | null;
  createdAt?: string;
};

export async function GET(request: Request) {
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
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const nestBase = getOptionalInternalApiBaseUrl();
    if (nestBase) {
      try {
        const r = await fetch(`${nestBase}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (r.ok) {
          const u = (await r.json()) as NestMeUser;
          if (
            typeof u.id === 'string' &&
            typeof u.email === 'string' &&
            typeof u.role === 'string'
          ) {
            return NextResponse.json({
              user: {
                id: u.id,
                email: u.email,
                role: u.role,
                avatar: u.avatar ?? null,
                createdAt:
                  typeof u.createdAt === 'string'
                    ? u.createdAt
                    : new Date().toISOString(),
              },
            });
          }
        }
      } catch {
        /* fall through to local JWT / Prisma */
      }
    }

    const payload = verifyAuthJwt(token);
    if (!payload) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        avatar: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({
      user: {
        ...user,
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
}
