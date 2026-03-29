import { NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/server-api';

/** Clears legacy cookie if present. Use `signOut` from `next-auth/react` to end the session. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ACCESS_TOKEN_COOKIE);
  return res;
}
