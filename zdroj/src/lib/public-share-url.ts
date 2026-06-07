import { getAppOrigin } from '@/lib/app-url';

export function getShareOrigin(): string {
  return getAppOrigin();
}

export function isShortsListing(input: {
  listingType?: string | null;
  videoUrl?: string | null;
}): boolean {
  return (
    String(input.listingType ?? '').toUpperCase() === 'SHORTS' ||
    Boolean(input.videoUrl?.trim())
  );
}

/** URL pro sdílení inzerátu podle typu. */
export function listingShareUrl(
  listingId: string,
  opts?: { listingType?: string | null; videoUrl?: string | null; force?: 'classic' | 'shorts' },
): string {
  const id = listingId.trim();
  const origin = getShareOrigin();
  const asShorts =
    opts?.force === 'shorts' ||
    (opts?.force !== 'classic' && isShortsListing(opts ?? {}));
  return asShorts
    ? `${origin}/shorts/${encodeURIComponent(id)}`
    : `${origin}/nemovitost/${encodeURIComponent(id)}`;
}

/** @deprecated použijte listingShareUrl */
export function listingPublicShareUrl(listingId: string): string {
  return listingShareUrl(listingId);
}

export function tipShareUrl(tipId: string, isShorts: boolean): string {
  const id = tipId.trim();
  const origin = getShareOrigin();
  return isShorts
    ? `${origin}/shorts/tip/${encodeURIComponent(id)}`
    : `${origin}/tipy/${encodeURIComponent(id)}`;
}

export function absoluteShareUrl(path: string): string {
  const origin = getShareOrigin();
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${origin}${p}`;
}
