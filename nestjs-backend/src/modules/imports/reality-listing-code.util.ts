/**
 * Kód inzerátu Reality.cz (např. BNB-001081) — jednoznačná identita pro importExternalId.
 */

/** Typický tvar kódu v URL /data vrstvě Reality.cz. */
export const REALITY_LISTING_CODE_RE = /^[A-Za-z0-9]{1,15}-[A-Za-z0-9]{1,20}$/;

/**
 * Vytáhne kód z absolutní nebo relativní URL (pathname, poslední vhodný segment).
 */
export function extractListingCodeFromRealityUrl(rawUrl: string): string | null {
  const t = rawUrl.trim();
  if (!t) return null;
  try {
    const abs = /^https?:\/\//i.test(t)
      ? t
      : `https://www.reality.cz${t.startsWith('/') ? '' : '/'}${t}`;
    const u = new URL(abs);
    if (!u.hostname.toLowerCase().endsWith('reality.cz')) {
      return null;
    }
    const parts = u.pathname.split('/').filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      const seg = parts[i].split('?')[0];
      if (REALITY_LISTING_CODE_RE.test(seg)) {
        return seg.toUpperCase();
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Spolehlivý externalId: přednostně z URL, pak z textových polí (id, listingId, …).
 * Vrací normalizovaný kód (UPPERCASE) nebo null.
 */
export function resolveRealityListingExternalId(input: {
  sourceUrl?: unknown;
  externalId?: unknown;
  id?: unknown;
  listingId?: unknown;
}): string | null {
  const url =
    typeof input.sourceUrl === 'string' && input.sourceUrl.trim()
      ? input.sourceUrl.trim()
      : null;
  const fromUrl = url ? extractListingCodeFromRealityUrl(url) : null;
  if (fromUrl) {
    return fromUrl;
  }

  const candidates: string[] = [];
  for (const v of [input.externalId, input.id, input.listingId]) {
    if (v == null) continue;
    const s = typeof v === 'string' ? v.trim() : String(v).trim();
    if (s && s !== 'undefined' && s !== 'null') {
      candidates.push(s);
    }
  }
  for (const c of candidates) {
    if (REALITY_LISTING_CODE_RE.test(c)) {
      return c.toUpperCase();
    }
    const fromPath = extractListingCodeFromRealityUrl(c);
    if (fromPath) {
      return fromPath;
    }
  }
  return null;
}
