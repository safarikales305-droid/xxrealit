import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { buildLegacyOAuthCallbackRedirect } from '@/lib/facebook-oauth-urls';

export const runtime = 'nodejs';

/** @deprecated 301 → meta-connect-callback */
export async function GET(request: NextRequest) {
  const target = buildLegacyOAuthCallbackRedirect(
    request.url,
    request.nextUrl.searchParams,
  );
  console.log(`[auth/facebook/callback] LEGACY_REDIRECT_301 to=${target.toString()}`);
  return NextResponse.redirect(target, 301);
}
