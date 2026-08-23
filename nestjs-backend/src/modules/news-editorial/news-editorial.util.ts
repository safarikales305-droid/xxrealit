import { createHash } from 'node:crypto';
import type { NewsArticle } from '@prisma/client';
import { NEWS_IGNORE_KEYWORDS } from './news-editorial.constants';
import { isValidNewsHeroImageUrl } from './news-hero-image.util';
import { scoreLanguageQuality } from './news-text-sanitizer.util';

const RELEVANCE_KEYWORDS: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /nemovitost|byt|dům|dom/i, weight: 12 },
  { pattern: /hypot[eé]k|úrok|sazb/i, weight: 14 },
  { pattern: /nájem|pronájem|rent/i, weight: 10 },
  { pattern: /cena|zlevn|zdraž/i, weight: 10 },
  { pattern: /staveb|developer|projekt/i, weight: 9 },
  { pattern: /katastr|list vlastnictví/i, weight: 11 },
  { pattern: /energetick|penb|rekonstruk/i, weight: 8 },
  { pattern: /investic|realit/i, weight: 9 },
  { pattern: /ubytov|hotel|airbnb/i, weight: 6 },
  { pattern: /legislativ|novel|zákon/i, weight: 7 },
];

export function normalizeNewsText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function newsContentHash(
  title: string,
  url: string,
  publishedAt: Date | null,
): string {
  const raw = `${normalizeNewsText(title)}|${url.trim().toLowerCase()}|${publishedAt?.toISOString() ?? ''}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

export function newsTitleFingerprint(title: string): string {
  const tokens = normalizeNewsText(title)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2)
    .sort();
  return createHash('sha256').update(tokens.join(' ')).digest('hex').slice(0, 24);
}

function tokenSet(text: string): Set<string> {
  return new Set(
    normalizeNewsText(text)
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2),
  );
}

export function titleSimilarity(a: string, b: string): number {
  const sa = tokenSet(a);
  const sb = tokenSet(b);
  if (!sa.size || !sb.size) return 0;
  let intersection = 0;
  for (const t of sa) {
    if (sb.has(t)) intersection += 1;
  }
  return intersection / Math.max(sa.size, sb.size);
}

export function scoreNewsRelevance(title: string, summary: string | null | undefined): number {
  const text = `${title} ${summary ?? ''}`;
  const normalized = normalizeNewsText(text);
  if (!normalized) return 0;

  for (const kw of NEWS_IGNORE_KEYWORDS) {
    if (normalized.includes(normalizeNewsText(kw))) return 0;
  }

  let score = 20;
  for (const { pattern, weight } of RELEVANCE_KEYWORDS) {
    if (pattern.test(text)) score += weight;
  }
  return Math.min(100, score);
}

export function slugifyNewsTitle(title: string): string {
  const base = title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
  const suffix = createHash('sha256').update(title).digest('hex').slice(0, 6);
  return base ? `${base}-${suffix}` : `aktualita-${suffix}`;
}

export function parsePublishTimeSlot(slot: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(slot.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

export function markdownToBasicHtml(markdown: string): string {
  const escaped = markdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (/^#{1,3}\s+/.test(trimmed)) {
        const level = trimmed.match(/^#+/)?.[0].length ?? 2;
        const text = trimmed.replace(/^#{1,3}\s+/, '');
        const tag = level <= 2 ? 'h2' : 'h3';
        return `<${tag}>${inlineMarkdown(text)}</${tag}>`;
      }
      if (/^[-*]\s+/m.test(trimmed)) {
        const items = trimmed
          .split(/\n/)
          .map((line) => line.replace(/^[-*]\s+/, '').trim())
          .filter(Boolean)
          .map((item) => `<li>${inlineMarkdown(item)}</li>`)
          .join('');
        return `<ul>${items}</ul>`;
      }
      return `<p>${inlineMarkdown(trimmed.replace(/\n/g, ' '))}</p>`;
    })
    .filter(Boolean)
    .join('\n');
}

function inlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" rel="noopener noreferrer" target="_blank">$1</a>');
}

export type NewsWaitReason =
  | 'AUTO_READY'
  | 'QUALITY_LOW'
  | 'LANGUAGE_QUALITY_LOW'
  | 'IMAGE_REQUIRED'
  | 'SOURCE_ERROR'
  | 'DUPLICATE'
  | 'WAITING_SCHEDULE'
  | 'MANUAL_REVIEW';

export function evaluateArticleReadiness(
  article: Pick<
    NewsArticle,
    | 'title'
    | 'seoTitle'
    | 'seoDescription'
    | 'perex'
    | 'bodyMarkdown'
    | 'sourcesFooterHtml'
    | 'ogImageUrl'
    | 'languageQualityScore'
  >,
  thresholds: { minQuality: number; minLanguage: number },
): { ready: boolean; waitReason: NewsWaitReason; quality: QualityGateResult; languageScore: number } {
  const quality = runQualityGate(article);
  const lang = scoreLanguageQuality(
    `${article.perex}\n${article.bodyMarkdown}`,
    article.title,
  );
  const languageScore = article.languageQualityScore ?? lang.score;

  if (!isValidNewsHeroImageUrl(article.ogImageUrl)) {
    return { ready: false, waitReason: 'IMAGE_REQUIRED', quality, languageScore };
  }
  if (languageScore < thresholds.minLanguage) {
    return { ready: false, waitReason: 'LANGUAGE_QUALITY_LOW', quality, languageScore };
  }
  if (quality.qualityScore < thresholds.minQuality || !quality.passed) {
    return { ready: false, waitReason: 'QUALITY_LOW', quality, languageScore };
  }
  return { ready: true, waitReason: 'AUTO_READY', quality, languageScore };
}

export type QualityGateResult = {
  passed: boolean;
  qualityScore: number;
  seoScore: number;
  issues: string[];
};

export function runQualityGate(
  article: Pick<
    NewsArticle,
    'title' | 'seoTitle' | 'seoDescription' | 'perex' | 'bodyMarkdown' | 'sourcesFooterHtml'
  >,
): QualityGateResult {
  const issues: string[] = [];
  let qualityScore = 100;
  let seoScore = 100;

  if (!article.title || article.title.trim().length < 10) {
    issues.push('Titulek je příliš krátký.');
    qualityScore -= 25;
  }
  if (!article.perex || article.perex.trim().length < 80) {
    issues.push('Perex je příliš krátký.');
    qualityScore -= 20;
  }
  if (!article.bodyMarkdown || article.bodyMarkdown.trim().length < 400) {
    issues.push('Tělo článku je příliš krátké.');
    qualityScore -= 25;
  }
  if (!article.seoTitle || article.seoTitle.length < 20) {
    issues.push('SEO titulek chybí nebo je krátký.');
    seoScore -= 20;
  }
  if (!article.seoDescription || article.seoDescription.length < 80) {
    issues.push('SEO popisek chybí nebo je krátký.');
    seoScore -= 20;
  }
  if (article.seoDescription && article.seoDescription.length > 170) {
    issues.push('SEO popisek je delší než 170 znaků.');
    seoScore -= 10;
  }
  if (!article.sourcesFooterHtml?.includes('<a ')) {
    issues.push('Chybí uvedení zdrojů s odkazy.');
    qualityScore -= 10;
  }

  const lang = scoreLanguageQuality(`${article.perex}\n${article.bodyMarkdown}`, article.title);
  if (lang.score < 70) {
    issues.push(`Nízká jazyková kvalita (${lang.score}).`);
    qualityScore -= Math.min(30, 100 - lang.score);
  }

  qualityScore = Math.max(0, Math.min(100, qualityScore));
  seoScore = Math.max(0, Math.min(100, seoScore));
  const combined = Math.round((qualityScore + seoScore) / 2);

  return {
    passed: issues.length === 0 && combined >= 70 && lang.score >= 70,
    qualityScore: combined,
    seoScore,
    issues,
  };
}

export function buildArticleSchema(
  article: Pick<
    NewsArticle,
    'title' | 'seoTitle' | 'seoDescription' | 'perex' | 'slug' | 'publishedAt' | 'authorLabel' | 'ogImageUrl'
  >,
  siteBaseUrl: string,
): Record<string, unknown> {
  const url = `${siteBaseUrl.replace(/\/$/, '')}/aktuality/${article.slug}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.seoTitle || article.title,
    description: article.seoDescription || article.perex,
    datePublished: article.publishedAt?.toISOString(),
    author: {
      '@type': 'Organization',
      name: article.authorLabel,
    },
    publisher: {
      '@type': 'Organization',
      name: 'XXREALIT',
    },
    mainEntityOfPage: url,
    image: article.ogImageUrl ? [article.ogImageUrl] : undefined,
  };
}
