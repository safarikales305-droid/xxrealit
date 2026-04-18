/**
 * Validace a normalizace URL obrázků ukládaných z importu —
 * jen absolutní platné http(s), bez data: a relativních cest.
 */

import { isValidImageUrl } from '../../lib/image-url';

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
