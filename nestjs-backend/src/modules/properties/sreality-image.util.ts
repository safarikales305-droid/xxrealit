import { createHash } from 'node:crypto';

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function decodeSrealityImageRaw(raw: string): string {
  return raw.trim().replace(/\\\//g, '/').replace(/&amp;/g, '&');
}

/** Normalizace bez upgrade kvality — pro fallback stažení. */
export function normalizeSrealityImageUrlRaw(raw: string): string | null {
  const s = decodeSrealityImageRaw(raw);
  if (!s) return null;
  if (s.startsWith('//')) return `https:${s}`;
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  if (s.startsWith('/')) return `https://img.sreality.cz${s}`;
  return null;
}

export function normalizeSrealityImageUrl(raw: string): string | null {
  const base = normalizeSrealityImageUrlRaw(raw);
  if (!base) return null;
  return upgradeSrealityImageQuality(base);
}

/** Preferuje nejkvalitnější veřejnou variantu (full místo thumbnail/cropped). */
export function upgradeSrealityImageQuality(url: string): string {
  try {
    const u = new URL(url);
    let path = u.pathname;
    path = path.replace(/\/\d+x\d+\//g, '/');
    path = path.replace(/\/full\/normal\//g, '/full/');
    path = path.replace(/\/full\/full\//g, '/full/');
    if (!/\/full\//.test(path)) {
      path = path.replace(/\/cropped\//g, '/full/');
      path = path.replace(/\/normal\//g, '/full/');
      path = path.replace(/\/_nr\//g, '/full/');
    }
    u.pathname = path;
    u.search = '';
    return u.href;
  } catch {
    return url;
  }
}

/** Kandidátní URL pro stažení — nejdřív full, pak původní/normal. */
export function buildSrealityImageFetchCandidates(preferredUrl: string): string[] {
  const out: string[] = [];
  const push = (u: string | null | undefined) => {
    if (!u) return;
    if (!out.includes(u)) out.push(u);
  };
  push(preferredUrl);
  const raw = normalizeSrealityImageUrlRaw(preferredUrl);
  if (raw && raw !== preferredUrl) push(raw);
  try {
    const u = new URL(preferredUrl);
    if (u.pathname.includes('/full/')) {
      const alt = new URL(preferredUrl);
      alt.pathname = alt.pathname.replace(/\/full\//g, '/normal/');
      push(alt.href);
    }
  } catch {
    /* ignore */
  }
  return out;
}

export function sanitizeUrlForDiagnostics(url: string): string {
  try {
    const u = new URL(url);
    if (u.search) u.search = '?…';
    return `${u.protocol}//${u.hostname}${u.pathname}${u.search}`;
  } catch {
    return url.length > 96 ? `${url.slice(0, 96)}…` : url;
  }
}

export function dedupeSrealityImageUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const normalized = normalizeSrealityImageUrl(raw);
    if (!normalized) continue;
    const key = imageDedupeKey(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

export function imageDedupeKey(url: string): string {
  try {
    const u = new URL(upgradeSrealityImageQuality(url));
    const segments = u.pathname.split('/').filter(Boolean);
    const file = segments[segments.length - 1] ?? '';
    const parent = segments[segments.length - 2] ?? '';
    return `${u.hostname}/${parent}/${file}`.toLowerCase();
  } catch {
    return createHash('sha256').update(url).digest('hex').slice(0, 24);
  }
}

export function srealityImageFetchHeaders(referer: string): Record<string, string> {
  return {
    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
    Referer: referer,
    'User-Agent': BROWSER_USER_AGENT,
  };
}

export function collectImageUrlsFromSrcset(srcset: string, out: string[]): void {
  for (const part of srcset.split(',')) {
    const url = part.trim().split(/\s+/)[0];
    if (url) {
      const normalized = normalizeSrealityImageUrl(url);
      if (normalized) out.push(normalized);
    }
  }
}
