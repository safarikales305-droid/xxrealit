import { jwtVerify } from 'jose';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  ACCESS_TOKEN_COOKIE,
  getJwtSecretBytes,
} from '@/lib/server-api';
import { isUserRole, type UserRole } from '@/lib/roles';

type JwtRolePayload = {
  role?: string;
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    const login = new URL('/login', request.url);
    login.searchParams.set('from', pathname);
    return NextResponse.redirect(login);
  }

  let role: string;
  try {
    const { payload } = await jwtVerify(token, getJwtSecretBytes());
    const r = (payload as JwtRolePayload).role;
    if (!r || typeof r !== 'string') {
      throw new Error('missing role');
    }
    role = r;
  } catch {
    const login = new URL('/login', request.url);
    login.searchParams.set('from', pathname);
    const res = NextResponse.redirect(login);
    res.cookies.delete(ACCESS_TOKEN_COOKIE);
    return res;
  }

  if (!isUserRole(role)) {
    const login = new URL('/login', request.url);
    return NextResponse.redirect(login);
  }

  if (pathname === '/dashboard' || pathname === '/dashboard/') {
    const url = request.nextUrl.clone();
    url.pathname = `/dashboard/${role}`;
    return NextResponse.redirect(url);
  }

  const match = pathname.match(/^\/dashboard\/([^/]+)/);
  const segment = match?.[1];
  if (segment && isUserRole(segment) && segment !== role) {
    const url = request.nextUrl.clone();
    url.pathname = `/dashboard/${role as UserRole}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard', '/dashboard/:path*'],
};
