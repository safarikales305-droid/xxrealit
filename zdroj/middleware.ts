import { jwtVerify } from 'jose';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE, getJwtSecretBytes } from '@/lib/server-api';
import { isUserRole } from '@/lib/roles';

type JwtAuthClaims = {
  role?: string;
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token =
    request.cookies.get('token')?.value ??
    request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    const login = new URL('/login', request.url);
    login.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(login);
  }

  try {
    const { payload: jwtPayload } = await jwtVerify(
      token,
      getJwtSecretBytes(),
      { algorithms: ['HS256'] },
    );
    const p = jwtPayload as JwtAuthClaims;
    const role = p.role;
    if (!role || typeof role !== 'string' || !isUserRole(role)) {
      throw new Error('invalid role');
    }

    if (pathname.startsWith('/admin') && role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/', request.url));
    }
  } catch {
    const login = new URL('/login', request.url);
    login.searchParams.set('callbackUrl', pathname);
    const res = NextResponse.redirect(login);
    res.cookies.set('token', '', {
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
      secure: process.env.NODE_ENV === 'production',
    });
    res.cookies.set(ACCESS_TOKEN_COOKIE, '', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
      secure: process.env.NODE_ENV === 'production',
    });
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/following',
    '/create',
    '/inzerat/pridat',
    '/profile/edit',
    '/admin',
    '/admin/:path*',
  ],
};
