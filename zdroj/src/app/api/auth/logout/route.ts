import { NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-cookie';

export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(ACCESS_TOKEN_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}
