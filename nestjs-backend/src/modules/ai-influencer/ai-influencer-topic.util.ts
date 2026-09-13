import { createHash } from 'node:crypto';

export function normalizeTopicUrl(raw: string): string {
  try {
    const url = new URL(raw.trim());
    url.hash = '';
    if (url.pathname.endsWith('/') && url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/+$/, '');
    }
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'].forEach(
      (key) => url.searchParams.delete(key),
    );
    return url.href;
  } catch {
    return raw.trim();
  }
}

export function buildTopicFingerprint(input: {
  canonicalUrl?: string | null;
  title?: string | null;
  sourceUrl?: string | null;
}): string {
  const canonical = input.canonicalUrl ? normalizeTopicUrl(input.canonicalUrl) : null;
  const url = input.sourceUrl ? normalizeTopicUrl(input.sourceUrl) : null;
  const title = (input.title ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const basis = canonical ?? url ?? title;
  return createHash('sha256').update(basis).digest('hex').slice(0, 32);
}

export function buildTitleHash(title: string): string {
  return createHash('sha256')
    .update(title.trim().toLowerCase().replace(/\s+/g, ' '))
    .digest('hex')
    .slice(0, 24);
}

export function titleSimilarity(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  const tb = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const w of ta) {
    if (tb.has(w)) overlap += 1;
  }
  return overlap / Math.max(ta.size, tb.size);
}

export function computeTotalTopicScore(scores: {
  viralScore: number;
  relevanceScore: number;
  freshnessScore: number;
  confidenceScore: number;
  videoPotentialScore: number;
  trendBoost?: number;
}): number {
  const trendBoost = scores.trendBoost ?? 0;
  const weighted =
    scores.viralScore * 0.25 +
    scores.relevanceScore * 0.2 +
    scores.freshnessScore * 0.15 +
    scores.confidenceScore * 0.2 +
    scores.videoPotentialScore * 0.2 +
    trendBoost;
  return Math.min(100, Math.max(0, Math.round(weighted)));
}

export function sanitizeAbsoluteClaim(text: string, confidenceScore: number): string {
  if (confidenceScore >= 80) return text;
  return text
    .replace(/nejdražš(i|í)/gi, 'jedna z nejdražších')
    .replace(/nejlevnějš(i|í)/gi, 'jedna z nejlevnějších')
    .replace(/největš(i|í)/gi, 'jedna z největších')
    .replace(/nejmenš(i|í)/gi, 'jedna z nejmenších')
    .replace(/\b(je|jsou)\s+(nejdražší|nejlevnější)\b/gi, 'je $1 dohledatelných');
}

export const TOPIC_HUNTER_SEARCH_TEMPLATES = [
  'nejdražší nemovitost Česká republika site:.cz',
  'nejlevnější byt Praha prodej',
  'realitní bizár Česko',
  'ceny nemovitostí Praha 2026',
  'hypotéky Česká republika novinky',
  'developerský projekt Praha',
  'dražba nemovitostí ČR',
  'luxusní vila prodej Česko',
  'nájemní bydlení Praha ceny',
  'rekonstrukce nemovitosti Česko',
  'investice do nemovitostí ČR',
  'legislativa reality Česká republika',
] as const;
