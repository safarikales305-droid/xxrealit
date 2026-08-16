import type { CompanyDirectoryEntry } from '@prisma/client';

const BLOCKED_HOST_FRAGMENTS = [
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'twitter.com',
  'x.com',
  'ares.gov.cz',
  'justice.cz',
  'firmy.cz',
  'najisto.cz',
  'mapy.cz',
  'google.com',
  'youtube.com',
  'wikipedia.org',
  'heureka.cz',
  'zivefirmy.cz',
  'edb.cz',
  'kurzy.cz',
];

export type WebsiteCandidate = {
  url: string;
  title?: string;
  snippet?: string;
  score: number;
  sourceQuery?: string;
};

export function removeDiacritics(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '');
}

export function normalizeCompanyNameForSearch(name: string): string {
  let result = name.trim();
  const endSuffix =
    /\s*[,.]?\s*(s\.?\s*r\.?\s*o\.?|a\.?\s*s\.?|spol\.?\s*s\s*r\.?\s*o\.?|v\.?\s*o\.?\s*s\.?|k\.?\s*s\.?|v likvidaci)\s*\.?\s*$/i;
  while (endSuffix.test(result)) {
    result = result.replace(endSuffix, '');
  }
  return result
    .replace(/[,&]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[.,;]+$/g, '')
    .trim();
}

export function normalizeForMatch(value: string): string {
  return removeDiacritics(value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim());
}

export function buildContactDiscoverySearchQueries(company: Pick<CompanyDirectoryEntry, 'name' | 'ico' | 'city' | 'region'>): string[] {
  const base = normalizeCompanyNameForSearch(company.name);
  const ascii = removeDiacritics(base);
  const city = company.city?.trim() ?? '';
  const ico = company.ico.replace(/\D/g, '').padStart(8, '0');
  const firstTokens = base.split(/\s+/).slice(0, 3).join(' ');

  const queries = [
    city ? `${firstTokens} ${city}` : firstTokens,
    city ? `${base} ${city}` : base,
    `${firstTokens} kontakt`,
    `${firstTokens} ${ico}`,
    ico,
    `${ico} kontakt`,
    ascii !== base ? `${ascii} ${city}`.trim() : '',
    city ? `${firstTokens} ${city} web` : `${firstTokens} web`,
    `${firstTokens} email`,
  ];

  return [...new Set(queries.map((q) => q.trim()).filter((q) => q.length >= 3))];
}

export function isBlockedCandidateHost(url: string): boolean {
  try {
    const host = new URL(url.startsWith('http') ? url : `https://${url}`).hostname.toLowerCase();
    return BLOCKED_HOST_FRAGMENTS.some((frag) => host === frag || host.endsWith(`.${frag}`));
  } catch {
    return true;
  }
}

export function getHostFromUrl(url: string): string {
  return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase();
}

function tokenOverlap(a: string, b: string): number {
  const aTokens = new Set(a.split(' ').filter((t) => t.length > 2));
  const bTokens = new Set(b.split(' ').filter((t) => t.length > 2));
  if (!aTokens.size || !bTokens.size) return 0;
  let overlap = 0;
  for (const t of aTokens) {
    if (bTokens.has(t)) overlap += 1;
  }
  return overlap / Math.max(aTokens.size, bTokens.size);
}

export function scoreWebsiteCandidate(
  company: Pick<CompanyDirectoryEntry, 'name' | 'ico' | 'city' | 'region' | 'phone'>,
  candidate: { url: string; title?: string; snippet?: string },
): number {
  if (isBlockedCandidateHost(candidate.url)) return 0;

  let score = 0.1;
  const nameNorm = normalizeForMatch(normalizeCompanyNameForSearch(company.name));
  const titleNorm = normalizeForMatch(candidate.title ?? '');
  const snippetNorm = normalizeForMatch(candidate.snippet ?? '');
  const combined = `${titleNorm} ${snippetNorm}`;
  const ico = company.ico.replace(/\D/g, '');

  const overlap = tokenOverlap(nameNorm, combined);
  score += overlap * 0.45;

  if (ico && combined.includes(ico)) score += 0.35;
  if (company.city && combined.includes(normalizeForMatch(company.city))) score += 0.1;
  if (company.region && combined.includes(normalizeForMatch(company.region))) score += 0.05;

  try {
    const host = getHostFromUrl(candidate.url);
    const firstWord = nameNorm.split(' ')[0];
    if (firstWord.length > 3 && host.includes(firstWord)) score += 0.15;
  } catch {
    /* ignore */
  }

  return Math.min(0.99, score);
}

export function mergeWebsiteCandidates(candidates: WebsiteCandidate[]): WebsiteCandidate[] {
  const map = new Map<string, WebsiteCandidate>();
  for (const row of candidates) {
    const key = getHostFromUrl(row.url);
    const existing = map.get(key);
    if (!existing || existing.score < row.score) {
      map.set(key, row);
    }
  }
  return [...map.values()].sort((a, b) => b.score - a.score);
}

export function deobfuscateEmailsInHtml(html: string): string {
  return html
    .replace(/(\w[\w.%+-]*)\s*\[at\]\s*(\w[\w.-]+\.[a-z]{2,})/gi, '$1@$2')
    .replace(/(\w[\w.%+-]*)\s*\(at\)\s*(\w[\w.-]+\.[a-z]{2,})/gi, '$1@$2')
    .replace(/(\w[\w.%+-]*)\s*\[zavináč\]\s*(\w[\w.-]+\.[a-z]{2,})/gi, '$1@$2')
    .replace(/(\w[\w.%+-]*)\s*\(zavináč\)\s*(\w[\w.-]+\.[a-z]{2,})/gi, '$1@$2')
    .replace(/(\w[\w.%+-]*)\s+@\s+(\w[\w.-]+\.[a-z]{2,})/gi, '$1@$2');
}

export const NOT_FOUND_REASON_LABELS: Record<string, string> = {
  NO_SEARCH_PROVIDER: 'Není nakonfigurován webový search provider (SERPAPI_API_KEY nebo BING_SEARCH_API_KEY).',
  NO_SEARCH_RESULTS: 'Webové vyhledávání nevrátilo žádné výsledky.',
  NO_VALID_WEBSITE: 'Nebyl nalezen vhodný oficiální web firmy.',
  WEBSITE_UNREACHABLE: 'Web firmy nebyl dostupný.',
  WEBSITE_TIMEOUT: 'Vypršel timeout při načítání webu.',
  WEBSITE_BLOCKED: 'Web firmy blokoval automatický přístup (HTTP 403).',
  NO_CONTACT_PAGE: 'Na webu nebyla nalezena kontaktní stránka.',
  NO_EMAIL_ON_WEBSITE: 'Na ověřeném webu nebyl nalezen veřejný email.',
  COMPANY_MATCH_TOO_LOW: 'Nalezené weby nesplňují minimální shodu s firmou.',
  PROVIDER_QUOTA: 'Vyčerpána kvóta search provideru.',
  PARSING_FAILED: 'Chyba při zpracování výsledků.',
};
