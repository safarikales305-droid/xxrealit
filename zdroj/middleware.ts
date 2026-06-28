import { jwtVerify } from 'jose';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE, getJwtSecretBytes } from '@/lib/server-api';
import { isUserRole } from '@/lib/roles';
import {
  CANONICAL_WWW_HOST,
  isKnownXxrealitHostname,
  resolveRequestHostname,
} from '@/lib/site-origin';

type JwtAuthClaims = {
  role?: string;
};

const PROTECTED_PREFIXES = [
  '/following',
  '/create',
  '/inzerat/pridat',
  '/profile/edit',
  '/admin',
];

function handleCanonicalRedirect(request: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV !== 'production') return null;

  const host = resolveRequestHostname(
    request.headers.get('host'),
    request.headers.get('x-forwarded-host'),
  );
  const proto = (request.headers.get('x-forwarded-proto') ?? 'https').split(',')[0]?.trim();

  if (!isKnownXxrealitHostname(host)) return null;

  // www + https → žádný redirect (hlavní doména)
  if (host === CANONICAL_WWW_HOST && proto === 'https') {
    return null;
  }

  const url = request.nextUrl.clone();
  url.protocol = 'https:';
  url.hostname = CANONICAL_WWW_HOST;
  url.port = '';

  // eslint-disable-next-line no-console
  console.log('[middleware] Redirect to:', url.toString(), `(host=${host}, proto=${proto})`);
  return NextResponse.redirect(url, 301);
}

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * JWT ochrana vybraných rout + apex/http → https://www.xxrealit.cz (301).
 */
export async function middleware(request: NextRequest) {
  const canonical = handleCanonicalRedirect(request);
  if (canonical) return canonical;

  const { pathname } = request.nextUrl;
  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  const token =
    request.cookies.get('token')?.value ??
    request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    const login = new URL('/login', request.url);
    login.searchParams.set('callbackUrl', pathname);
    // eslint-disable-next-line no-console
    console.log('[middleware] Redirect to:', login.toString(), '(auth required)');
    return NextResponse.redirect(login);
  }

  try {
    const { payload: jwtPayload } = await jwtVerify(token, getJwtSecretBytes(), {
      algorithms: ['HS256'],
    });
    const p = jwtPayload as JwtAuthClaims;
    const role = p.role;
    if (!role || typeof role !== 'string' || !isUserRole(role)) {
      throw new Error('invalid role');
    }
  } catch {
    const login = new URL('/login', request.url);
    login.searchParams.set('callbackUrl', pathname);
    const res = NextResponse.redirect(login);
    // eslint-disable-next-line no-console
    console.log('[middleware] Redirect to:', login.toString(), '(invalid token)');
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
    '/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|videos|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
