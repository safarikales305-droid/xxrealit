/**
 * Validace a normalizace URL obrázků ukládaných z importu —
 * jen absolutní platné http(s), bez data: a relativních cest.
 */

import { isValidImageUrl, normalizeImageCandidate } from '../../lib/image-url';

/** Absolutní URL vůči výchozí doméně (Reality.cz detail). */
export function normalizeAbsoluteUrl(value?: string | null, baseUrl?: string | null): string | null {
  return normalizeImageCandidate(value, baseUrl?.trim() || 'https://www.reality.cz');
}

export function uniqueUrls(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (v == null || typeof v !== 'string') continue;
    const t = v.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function normalizeStoredImageUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t || t.toLowerCase().startsWith('data:')) return null;
  if (!/^https?:\/\//i.test(t)) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname || u.hostname.length < 2) return null;
    u.hash = '';
    const href = u.href;
    return isValidImageUrl(href) ? href : null;
  } catch {
    return null;
  }
}

export function normalizeStoredImageUrlList(urls: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    const n = normalizeStoredImageUrl(raw);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}
