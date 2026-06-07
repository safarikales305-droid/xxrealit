import { getAppOrigin } from '@/lib/app-url';

/** Kanonická veřejná origin pro sdílení (Facebook, TikTok, …). */
export function getShareOrigin(): string {
  return getAppOrigin();
}

/** Absolutní veřejná URL detailu inzerátu — vždy https://www.xxrealit.cz/nemovitost/ID */
export function listingPublicShareUrl(listingId: string): string {
  const id = listingId.trim();
  return `${getShareOrigin()}/nemovitost/${encodeURIComponent(id)}`;
}

/** Absolutní URL pro sdílení libovolné cesty na kanonické doméně. */
export function absoluteShareUrl(path: string): string {
  const origin = getShareOrigin();
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${origin}${p}`;
}
