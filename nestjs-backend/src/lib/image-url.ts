/** Stejná logika jako frontend `images.ts` — čisté URL pro API odpovědi. */

export function isValidImageUrl(value?: string | null): boolean {
  if (!value || typeof value !== 'string') return false;
  const url = value.trim();
  if (!url) return false;
  if (url.includes('undefined')) return false;
  if (url.includes('null')) return false;
  if (url.includes('[object Object]')) return false;
  if (url.includes(',')) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeImageCandidate(
  value?: string | null,
  baseUrl?: string | null,
): string | null {
  if (!value || typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;
  if (
    raw.includes('undefined') ||
    raw.includes('null') ||
    raw.includes('[object Object]')
  ) {
    return null;
  }
  try {
    if (/^https?:\/\//i.test(raw)) {
      return new URL(raw).href;
    }
    const base = baseUrl?.trim();
    if (!base) return null;
    return new URL(raw, base).href;
  } catch {
    return null;
  }
}

export function getFirstValidImage(
  candidates: Array<string | null | undefined>,
  baseUrl?: string | null,
): string | null {
  for (const item of candidates) {
    const normalized = normalizeImageCandidate(item, baseUrl);
    if (isValidImageUrl(normalized)) return normalized;
  }
  return null;
}

/** Pro relativní `/uploads/...` v DB — stejná heuristika jako upload controller. */
export function resolveAssetBaseUrl(): string | null {
  const raw =
    process.env.PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    '';
  if (!raw) return null;
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withProto).origin;
  } catch {
    return null;
  }
}
