export type ExtractedEmail = {
  value: string;
  normalizedValue: string;
  sourceTextSnippet: string;
  confidence: number;
  label?: string;
};

export type ExtractedPhone = {
  value: string;
  normalizedValue: string;
  originalValue: string;
  phoneKind: 'MOBILE' | 'LANDLINE' | 'UNKNOWN';
  sourceTextSnippet: string;
  confidence: number;
};

const EMAIL_RE =
  /\b[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+\b/gi;

const IGNORE_EMAIL_PATTERNS = [
  /example\.com$/i,
  /test\.com$/i,
  /sentry\.io$/i,
  /wixpress\.com$/i,
  /noreply/i,
  /no-reply/i,
  /do-not-reply/i,
  /donotreply/i,
  /\.png$/i,
  /\.jpg$/i,
  /\.gif$/i,
  /\.svg$/i,
];

const PREFERRED_EMAIL_PREFIXES = [
  'info',
  'obchod',
  'reality',
  'kancelar',
  'office',
  'kontakt',
  'contact',
  'sales',
];

const NAV_KEYWORDS = ['kontakt', 'kontakty', 'tým', 'tym', 'makléř', 'makler', 'pobočka', 'pobocka', 'o nás', 'o-nas'];

const SEED_PATHS = [
  '/',
  '/kontakt',
  '/kontakty',
  '/contact',
  '/o-nas',
  '/o-spolecnosti',
  '/tym',
  '/makleri',
  '/pobocky',
];

export function normalizeEmail(raw: string): string | null {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/^mailto:/i, '')
    .replace(/[>,);]+$/g, '');
  if (!cleaned || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) return null;
  if (IGNORE_EMAIL_PATTERNS.some((p) => p.test(cleaned))) return null;
  const tld = cleaned.split('.').pop() ?? '';
  if (tld.length < 2 || tld.length > 24) return null;
  return cleaned;
}

export function scoreEmail(email: string, websiteHost: string): number {
  const [local, domain] = email.split('@');
  let score = 0.5;
  if (domain && websiteHost.includes(domain.replace(/^www\./, ''))) score += 0.3;
  const prefix = local.split('+')[0];
  const idx = PREFERRED_EMAIL_PREFIXES.indexOf(prefix);
  if (idx >= 0) score += 0.2 - idx * 0.02;
  if (/^[a-z]+\.[a-z]+$/i.test(prefix)) score += 0.05;
  return Math.min(0.99, score);
}

export function extractEmailsFromHtml(html: string, pageUrl: string, websiteHost: string): ExtractedEmail[] {
  const found = new Map<string, ExtractedEmail>();

  const mailtoRe = /href\s*=\s*["']mailto:([^"'?]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = mailtoRe.exec(html)) !== null) {
    addEmail(found, m[1], html, pageUrl, websiteHost, 0.95);
  }

  const jsonLdBlocks = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const block of jsonLdBlocks) {
    const inner = block.replace(/<script[^>]*>|<\/script>/gi, '');
    for (const em of inner.match(EMAIL_RE) ?? []) {
      addEmail(found, em, inner, pageUrl, websiteHost, 0.9);
    }
  }

  const text = stripHtml(html);
  for (const em of text.match(EMAIL_RE) ?? []) {
    addEmail(found, em, text, pageUrl, websiteHost, 0.75);
  }

  return [...found.values()].sort((a, b) => b.confidence - a.confidence);
}

function addEmail(
  map: Map<string, ExtractedEmail>,
  raw: string,
  context: string,
  pageUrl: string,
  websiteHost: string,
  baseConfidence: number,
) {
  const normalized = normalizeEmail(raw);
  if (!normalized) return;
  const domain = normalized.split('@')[1] ?? '';
  const host = websiteHost.replace(/^www\./, '');
  if (domain && host && !domain.endsWith(host) && !host.endsWith(domain)) {
    return;
  }
  const snippet = snippetAround(context, raw, 80);
  const confidence = Math.min(0.99, baseConfidence * scoreEmail(normalized, websiteHost));
  const existing = map.get(normalized);
  if (!existing || existing.confidence < confidence) {
    map.set(normalized, {
      value: normalized,
      normalizedValue: normalized,
      sourceTextSnippet: snippet,
      confidence,
      label: pageUrl,
    });
  }
}

export function normalizeCzechPhone(raw: string): { normalized: string; kind: 'MOBILE' | 'LANDLINE' | 'UNKNOWN'; original: string } | null {
  const original = raw.trim();
  let digits = original.replace(/[^\d+]/g, '');
  if (digits.startsWith('+420')) digits = digits.slice(4);
  else if (digits.startsWith('00420')) digits = digits.slice(5);
  else if (digits.startsWith('420') && digits.length >= 12) digits = digits.slice(3);
  digits = digits.replace(/\D/g, '');
  if (digits.length === 9) {
    const formatted = `+420 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
    const kind = digits.startsWith('6') || digits.startsWith('7') ? 'MOBILE' : 'LANDLINE';
    return { normalized: formatted, kind, original };
  }
  if (digits.length >= 9 && digits.length <= 12) {
    const last9 = digits.slice(-9);
    const formatted = `+420 ${last9.slice(0, 3)} ${last9.slice(3, 6)} ${last9.slice(6)}`;
    return { normalized: formatted, kind: 'UNKNOWN', original };
  }
  return null;
}

export function extractPhonesFromHtml(html: string, pageUrl: string): ExtractedPhone[] {
  const found = new Map<string, ExtractedPhone>();
  const telRe = /href\s*=\s*["']tel:([^"']+)/gi;
  let m: RegExpExecArray | null;
  while ((m = telRe.exec(html)) !== null) {
    addPhone(found, m[1], html, pageUrl, 0.95);
  }
  const text = stripHtml(html);
  const phonePatterns = [
    /(?:\+420|00420)?\s*\d{3}[\s.-]?\d{3}[\s.-]?\d{3}/g,
    /\d{3}\s\d{3}\s\d{3}/g,
  ];
  for (const re of phonePatterns) {
    for (const match of text.match(re) ?? []) {
      if (/^(19|20)\d{2}$/.test(match.replace(/\D/g, ''))) continue;
      addPhone(found, match, text, pageUrl, 0.7);
    }
  }
  return [...found.values()].sort((a, b) => b.confidence - a.confidence);
}

function addPhone(map: Map<string, ExtractedPhone>, raw: string, context: string, pageUrl: string, base: number) {
  const norm = normalizeCzechPhone(raw);
  if (!norm) return;
  const snippet = snippetAround(context, raw, 80);
  const existing = map.get(norm.normalized);
  if (!existing || existing.confidence < base) {
    map.set(norm.normalized, {
      value: norm.normalized,
      normalizedValue: norm.normalized,
      originalValue: norm.original,
      phoneKind: norm.kind,
      sourceTextSnippet: snippet,
      confidence: base,
    });
  }
}

export function discoverContactPaths(baseUrl: string, html: string): string[] {
  const origin = new URL(baseUrl).origin;
  const paths = new Set<string>(SEED_PATHS);
  const linkRe = /<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const href = m[1];
    const label = stripHtml(m[2]).toLowerCase();
    if (!NAV_KEYWORDS.some((k) => label.includes(k) || href.toLowerCase().includes(k))) continue;
    try {
      const url = new URL(href, origin);
      if (url.origin === origin) paths.add(url.pathname.replace(/\/+$/, '') || '/');
    } catch {
      // skip invalid
    }
  }
  return [...paths].slice(0, 8);
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function snippetAround(text: string, needle: string, radius: number): string {
  const idx = text.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return needle.slice(0, radius);
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + needle.length + radius);
  return text.slice(start, end).trim();
}

export { SEED_PATHS };
