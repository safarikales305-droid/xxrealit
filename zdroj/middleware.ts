import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { isUserRole, type UserRole } from '@/lib/roles';

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;
  const role = session?.user?.role;

  if (!session?.user?.id || !role || !isUserRole(role)) {
    const login = new URL('/login', req.url);
    login.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(login);
  }

  if (pathname === '/dashboard' || pathname === '/dashboard/') {
    const url = req.nextUrl.clone();
    url.pathname = `/dashboard/${role}`;
    return NextResponse.redirect(url);
  }

  const match = pathname.match(/^\/dashboard\/([^/]+)/);
  const segment = match?.[1];
  if (segment && isUserRole(segment) && segment !== role) {
    const url = req.nextUrl.clone();
    url.pathname = `/dashboard/${role as UserRole}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/dashboard',
    '/dashboard/:path*',
    '/following',
    '/create',
    '/profile/edit',
  ],
};
