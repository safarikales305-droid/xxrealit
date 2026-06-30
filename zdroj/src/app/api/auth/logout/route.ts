import { NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-cookie';

const clearOpts = {
  httpOnly: true as const,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 0,
  secure: process.env.NODE_ENV === 'production',
};

export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(ACCESS_TOKEN_COOKIE, '', clearOpts);
  res.cookies.set('token', '', { ...clearOpts, httpOnly: false });
  return res;
}
