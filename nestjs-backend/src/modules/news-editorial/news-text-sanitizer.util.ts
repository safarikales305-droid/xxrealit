const HTML_ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

const TRACKING_QUERY_KEYS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
]);

export type SanitizedNewsSource = {
  title: string;
  summary: string;
  bodyHint: string;
};

export function decodeHtmlEntities(input: string): string {
  let text = input;
  text = text.replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
    String.fromCodePoint(Number.parseInt(hex, 16)),
  );
  text = text.replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)));
  text = text.replace(/&([a-z]+);/gi, (match, name) => HTML_ENTITY_MAP[name.toLowerCase()] ?? match);
  return text;
}

function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripUrlsAndTracking(input: string): string {
  return input
    .replace(/https?:\/\/[^\s<>"')]+/gi, ' ')
    .replace(/\bwww\.[^\s<>"')]+/gi, ' ')
    .replace(/[a-z0-9_-]+\.(jpg|jpeg|png|webp|gif)(\?[^\s]*)?/gi, ' ')
    .replace(/%20|%3A|%2F|%3F|%3D|%26/gi, ' ')
    .replace(/\?[^\s]+/g, ' ')
    .replace(/\b(st|v|w|h|width|height)=\d+/gi, ' ');
}

function removeBoilerplate(input: string): string {
  return input
    .replace(/\b(souhlas|cookies?|cookie|sledování|tracking|newsletter|přihlásit|odhlásit)\b/gi, ' ')
    .replace(/\b(RSS|Atom|XML|CDATA)\b/gi, ' ')
    .replace(/\uFFFD/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeNewsSourceText(
  title: string,
  summary: string | null | undefined,
  extra?: string | null,
): SanitizedNewsSource {
  const cleanTitle = removeBoilerplate(
    stripUrlsAndTracking(decodeHtmlEntities(stripHtml(title ?? ''))),
  );
  const rawSummary = [summary, extra].filter(Boolean).join('\n');
  const cleanSummary = removeBoilerplate(
    stripUrlsAndTracking(decodeHtmlEntities(stripHtml(rawSummary))),
  );

  const dedupedSummary =
    cleanSummary && normalizeComparable(cleanSummary) === normalizeComparable(cleanTitle)
      ? ''
      : cleanSummary;

  return {
    title: cleanTitle || 'Aktualita z realitního trhu',
    summary: dedupedSummary.slice(0, 2000),
    bodyHint: dedupedSummary.slice(0, 4000),
  };
}

function normalizeComparable(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const ARTIFACT_PATTERNS: Array<{ pattern: RegExp; penalty: number; issue: string }> = [
  { pattern: /https?:\/\//i, penalty: 35, issue: 'URL v textu' },
  { pattern: /\.(jpg|jpeg|png|webp)(\?|$)/i, penalty: 30, issue: 'Obrázková URL' },
  { pattern: /%20|%3A|%2F/i, penalty: 25, issue: 'Encoded URL fragment' },
  { pattern: /&(?:amp|nbsp|#\d+);/i, penalty: 20, issue: 'HTML entity' },
  { pattern: /<[^>]+>/, penalty: 40, issue: 'HTML tag' },
  { pattern: /CDATA|xmlns|feed|entry/i, penalty: 25, issue: 'RSS/XML artefakt' },
  { pattern: /\uFFFD/, penalty: 40, issue: 'Rozbité encoding' },
  { pattern: /(?:\?|&)(?:st|v|utm_)=/i, penalty: 20, issue: 'Tracking parametry' },
];

export type LanguageQualityResult = {
  score: number;
  issues: string[];
};

export function scoreLanguageQuality(text: string, title?: string): LanguageQualityResult {
  const issues: string[] = [];
  let score = 100;
  const combined = `${title ?? ''}\n${text}`.trim();
  if (!combined) return { score: 0, issues: ['Prázdný text'] };

  for (const rule of ARTIFACT_PATTERNS) {
    if (rule.pattern.test(combined)) {
      score -= rule.penalty;
      issues.push(rule.issue);
    }
  }

  const sentences = combined.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 8);
  if (sentences.length < 2) {
    score -= 20;
    issues.push('Příliš krátký text');
  }

  if (title && combined.toLowerCase().includes(title.toLowerCase().repeat(2).slice(0, title.length * 2))) {
    score -= 15;
    issues.push('Duplicitní titulek');
  }

  const words = combined.split(/\s+/).filter(Boolean);
  const unique = new Set(words.map((w) => w.toLowerCase()));
  if (words.length > 20 && unique.size / words.length < 0.45) {
    score -= 15;
    issues.push('Opakující se slova');
  }

  return { score: Math.max(0, Math.min(100, score)), issues: [...new Set(issues)] };
}

export type AiArticleValidation = {
  valid: boolean;
  issues: string[];
};

export function validateAiArticleOutput(input: {
  title: string;
  perex: string;
  bodyMarkdown: string;
  seoTitle?: string;
  seoDescription?: string;
}): AiArticleValidation {
  const issues: string[] = [];
  const fields = [input.title, input.perex, input.bodyMarkdown, input.seoTitle, input.seoDescription]
    .filter(Boolean)
    .join('\n');

  const lang = scoreLanguageQuality(fields, input.title);
  issues.push(...lang.issues);

  if (input.bodyMarkdown.trim().length < 350) issues.push('Tělo článku je příliš krátké');
  if (input.perex.trim().length < 60) issues.push('Perex je příliš krátký');

  const titleNorm = normalizeComparable(input.title);
  const perexNorm = normalizeComparable(input.perex.slice(0, 120));
  if (titleNorm && perexNorm.startsWith(titleNorm.slice(0, Math.min(titleNorm.length, 40)))) {
    issues.push('Perex opakuje titulek');
  }

  return { valid: issues.length === 0 && lang.score >= 70, issues: [...new Set(issues)] };
}

export function sanitizeAiArticleFields<T extends {
  title: string;
  seoTitle: string;
  seoDescription: string;
  perex: string;
  bodyMarkdown: string;
}>(payload: T): T {
  const clean = (v: string) =>
    removeBoilerplate(stripUrlsAndTracking(decodeHtmlEntities(stripHtml(v)))).replace(/\s+/g, ' ').trim();

  return {
    ...payload,
    title: clean(payload.title),
    seoTitle: clean(payload.seoTitle),
    seoDescription: clean(payload.seoDescription).slice(0, 170),
    perex: clean(payload.perex),
    bodyMarkdown: clean(payload.bodyMarkdown).replace(/##\s+/g, '\n\n## '),
  };
}

export function stripTrackingFromUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_QUERY_KEYS.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
        u.searchParams.delete(key);
      }
    }
    return u.toString();
  } catch {
    return url;
  }
}
