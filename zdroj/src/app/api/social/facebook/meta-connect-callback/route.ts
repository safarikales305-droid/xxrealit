import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/** @deprecated Meta Centrum používá sdílený /api/social/facebook/callback */
export async function GET(request: NextRequest) {
  const target = new URL('/api/social/facebook/callback', request.url);
  request.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.set(key, value);
  });
  return NextResponse.redirect(target, 307);
}
