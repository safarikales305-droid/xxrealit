import type { EditorialContentMode } from './news-youtube-seo-gate.constants';
import { scoreLanguageQuality } from './news-text-sanitizer.util';
import { scoreNewsRelevance } from './news-editorial.util';
import {
  DEFAULT_YOUTUBE_SEO_GATE_SETTINGS,
  type SeoGateCheckItem,
  type YoutubeSeoGateResult,
  type YoutubeSeoGateSettings,
  type YoutubeSeoScoreBreakdown,
} from './news-youtube-seo-gate.constants';

const CZ_SK_CITIES: Array<{ name: string; aliases?: string[]; confidence: number }> = [
  { name: 'Praha', aliases: ['Praze', 'Prahy'], confidence: 0.95 },
  { name: 'Brno', aliases: ['Brně', 'Brna'], confidence: 0.95 },
  { name: 'Ostrava', confidence: 0.95 },
  { name: 'Plzeň', confidence: 0.92 },
  { name: 'Plzen', confidence: 0.9 },
  { name: 'Liberec', confidence: 0.92 },
  { name: 'Olomouc', confidence: 0.92 },
  { name: 'Hradec Králové', confidence: 0.9 },
  { name: 'Hradec Kralove', confidence: 0.88 },
  { name: 'Pardubice', confidence: 0.9 },
  { name: 'Zlín', confidence: 0.9 },
  { name: 'České Budějovice', confidence: 0.9 },
  { name: 'Ceske Budejovice', confidence: 0.88 },
  { name: 'Bratislava', confidence: 0.93 },
  { name: 'Košice', confidence: 0.9 },
  { name: 'Kosice', confidence: 0.88 },
];

const TOPIC_PATTERNS: Array<{ cluster: string; re: RegExp }> = [
  { cluster: 'buying-apartment', re: /\b(koup[eě]|koupi|kupovat|koupě)\b.*\b(byt|bytu|bytů)\b/i },
  { cluster: 'buying-apartment', re: /\b(na co pozor|koupě bytu|koupit byt)\b/i },
  { cluster: 'selling-house', re: /\b(prodej|prodat|prodávám|prodám)\b.*\b(d[uů]m|domu|nemovitost)\b/i },
  { cluster: 'selling-house', re: /\b(jak prodat|prodej nemovitosti)\b/i },
  { cluster: 'mortgage-rates', re: /\b(hypot[eé]k|refinanc|hypoteční|sazb)\b/i },
  { cluster: 'renovation-bathroom', re: /\b(rekonstrukce|renovace)\b.*\b(koupeln|koupelny)\b/i },
  { cluster: 'renovation-bathroom', re: /\b(koupelna|koupelnu)\b.*\b(rekonstruk|renov)\b/i },
  { cluster: 'construction-house', re: /\b(stavba|stavět|stavíme)\b.*\b(d[uů]m|domu|rodinn)\b/i },
  { cluster: 'construction-house', re: /\b(dřevostavb|modulární d[uů]m|hrubá stavba)\b/i },
  { cluster: 'interior-design', re: /\b(interiér|interiérov|návrh interiéru|design interiéru)\b/i },
  { cluster: 'photovoltaic', re: /\b(fotovoltaik|solární|fve)\b/i },
  { cluster: 'heating', re: /\b(vytápění|topení|tepelné čerpadlo|kotel)\b/i },
  { cluster: 'real-estate-investment', re: /\b(investic|investovat)\b.*\b(nemovitost|byt|d[uů]m)\b/i },
  { cluster: 'property-law', re: /\b(právn|smlouv|katastr|vklad|list vlastnictví)\b/i },
  { cluster: 'broker-tips', re: /\b(makléř|realitní kancelář|realitní tip)\b/i },
  { cluster: 'rental-housing', re: /\b(nájem|pronájem|pronajmout|nájemní)\b/i },
];

const OFF_TOPIC =
  /\b(gaming|fortnite|minecraft|hudba|music video|makeup|fitness|workout|kids|dětsk|football|fotbal|nba|crypto|bitcoin)\b/i;

export function countWords(text: string): number {
  return text
    .replace(/[#*_`>\[\]()]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .length;
}

export function detectTopicCluster(title: string, description?: string | null): string | null {
  const hay = `${title}\n${description ?? ''}`;
  for (const { cluster, re } of TOPIC_PATTERNS) {
    if (re.test(hay)) return cluster;
  }
  const normalized = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  if (!normalized) return null;
  return normalized.split(' ').slice(0, 4).join('-');
}

function normalizeForLocationMatch(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function detectLocation(
  title: string,
  description?: string | null,
): { location: string | null; confidence: number } {
  const hay = normalizeForLocationMatch(`${title}\n${description ?? ''}`);
  let best: { location: string | null; confidence: number } = { location: null, confidence: 0 };
  for (const city of CZ_SK_CITIES) {
    const names = [city.name, ...(city.aliases ?? [])];
    const matched = names.some((name) => {
      const normalized = normalizeForLocationMatch(name);
      return hay.includes(normalized);
    });
    if (matched && city.confidence > best.confidence) {
      best = {
        location: city.name
          .replace('Plzen', 'Plzeň')
          .replace('Kosice', 'Košice')
          .replace('Ceske Budejovice', 'České Budějovice')
          .replace('Hradec Kralove', 'Hradec Králové'),
        confidence: city.confidence,
      };
    }
  }
  if (best.confidence < 0.85) return { location: null, confidence: 0 };
  return best;
}

function textSimilarity(a: string, b: string): number {
  const wa = new Set(
    a
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3),
  );
  const wb = new Set(
    b
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3),
  );
  if (!wa.size || !wb.size) return 0;
  let overlap = 0;
  for (const w of wa) if (wb.has(w)) overlap += 1;
  return overlap / Math.max(wa.size, wb.size);
}

export function scoreOriginality(aiText: string, youtubeDescription: string): number {
  const sim = textSimilarity(aiText, youtubeDescription);
  if (sim > 0.75) return 20;
  if (sim > 0.55) return 45;
  if (sim > 0.4) return 65;
  return 90;
}

export function resolveContentMode(
  seoQualityScore: number,
  settings: YoutubeSeoGateSettings = DEFAULT_YOUTUBE_SEO_GATE_SETTINGS,
): EditorialContentMode {
  if (seoQualityScore >= settings.articleFeatureMin) return 'ARTICLE_FEATURE';
  if (seoQualityScore > settings.shortsOnlyMax) return 'POST_AND_SHORTS';
  return 'SHORTS_ONLY';
}

export function computeSeoQualityScore(breakdown: YoutubeSeoScoreBreakdown): number {
  const raw =
    breakdown.contentRelevanceScore * 0.22 +
    breakdown.originalityScore * 0.18 +
    breakdown.textQualityScore * 0.2 +
    breakdown.seoMetadataScore * 0.12 +
    breakdown.internalLinkScore * 0.08 +
    breakdown.locationScore * 0.05 +
    breakdown.sourceTrustScore * 0.1 -
    breakdown.duplicateTopicPenalty -
    breakdown.thinContentPenalty;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function buildSeoChecks(input: {
  h1: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalPath: string | null;
  bodyMarkdown: string | null;
  youtubeDescription: string;
  internalLinksValid: number;
  internalLinksTotal: number;
  relatedCount: number;
  embeddable: boolean;
  thumbnailUrl: string | null;
  duplicateTopicBlocked: boolean;
  wordCount: number;
  minWords: number;
}): SeoGateCheckItem[] {
  const descCopy =
    input.seoDescription &&
    textSimilarity(input.seoDescription, input.youtubeDescription) > 0.65;
  return [
    {
      id: 'h1',
      label: 'unikátní H1',
      pass: Boolean(input.h1 && input.h1.trim().length >= 12),
    },
    {
      id: 'title',
      label: 'title',
      pass: Boolean(input.seoTitle && input.seoTitle.trim().length >= 20),
    },
    {
      id: 'meta',
      label: 'meta description',
      pass: Boolean(input.seoDescription && input.seoDescription.length >= 80 && !descCopy),
      detail: descCopy ? 'Příliš podobná YouTube popisu' : undefined,
    },
    {
      id: 'canonical',
      label: 'canonical',
      pass: Boolean(input.canonicalPath?.startsWith('/')),
    },
    {
      id: 'words',
      label: `${input.minWords}+ slov originálního textu`,
      pass: input.wordCount >= input.minWords,
      detail: `${input.wordCount} slov`,
    },
    {
      id: 'attribution',
      label: 'YouTube attribution',
      pass: true,
    },
    {
      id: 'links',
      label: 'internal links',
      pass: input.internalLinksValid >= 2,
      detail: `${input.internalLinksValid}/${input.internalLinksTotal}`,
    },
    {
      id: 'related',
      label: 'related content',
      pass: input.relatedCount >= 1,
      detail: String(input.relatedCount),
    },
    {
      id: 'embed',
      label: 'valid embed',
      pass: input.embeddable,
    },
    {
      id: 'thumbnail',
      label: 'thumbnail',
      pass: Boolean(input.thumbnailUrl),
    },
    {
      id: 'duplicate',
      label: 'no duplicate topic',
      pass: !input.duplicateTopicBlocked,
    },
  ];
}

export function evaluateYoutubeSeoGate(input: {
  videoTitle: string;
  videoDescription: string;
  channelTitle: string;
  embeddable: boolean;
  thumbnailUrl: string | null;
  relevanceScore: number;
  sourceTrustScore: number;
  teaser: string;
  bodyMarkdown: string;
  h1?: string | null;
  perex?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  slug?: string | null;
  canonicalPath?: string | null;
  internalLinks?: Array<{ label: string; path: string; valid: boolean }>;
  relatedPostIds?: string[];
  duplicateTopicBlocked?: boolean;
  settings?: YoutubeSeoGateSettings;
}): YoutubeSeoGateResult {
  const settings = input.settings ?? DEFAULT_YOUTUBE_SEO_GATE_SETTINGS;
  const topicCluster = detectTopicCluster(input.videoTitle, input.videoDescription);
  const loc = detectLocation(input.videoTitle, input.videoDescription);
  const body = input.bodyMarkdown?.trim() ?? '';
  const perex = input.perex?.trim() || input.teaser?.trim() || '';
  const h1 = input.h1?.trim() || input.videoTitle.trim();
  const wordCount = countWords(`${perex}\n${body}`);
  const lang = scoreLanguageQuality(`${perex}\n${body}`, h1);
  const originality = scoreOriginality(`${perex}\n${body}`, input.videoDescription);
  const duplicateTopicBlocked = Boolean(input.duplicateTopicBlocked);
  const internalLinks = input.internalLinks ?? [];
  const validLinks = internalLinks.filter((l) => l.valid).length;

  let textQualityScore = Math.min(100, Math.round((wordCount / settings.minArticleWords) * 70));
  if (lang.score >= 75) textQualityScore = Math.min(100, textQualityScore + 15);
  if (lang.score < 60) textQualityScore = Math.max(0, textQualityScore - 25);

  let thinContentPenalty = 0;
  if (wordCount < 120) thinContentPenalty += 25;
  else if (wordCount < settings.minArticleWords) thinContentPenalty += 12;

  let duplicateTopicPenalty = duplicateTopicBlocked ? 35 : 0;

  const seoMetadataScore =
    (input.seoTitle && input.seoTitle.length >= 25 ? 50 : 10) +
    (input.seoDescription && input.seoDescription.length >= 90 ? 50 : 10);

  const breakdown: YoutubeSeoScoreBreakdown = {
    contentRelevanceScore: Math.min(100, input.relevanceScore),
    originalityScore: originality,
    textQualityScore,
    seoMetadataScore: Math.min(100, seoMetadataScore),
    internalLinkScore: Math.min(100, validLinks * 25),
    locationScore: loc.location ? Math.round(loc.confidence * 100) : 50,
    sourceTrustScore: Math.min(100, input.sourceTrustScore),
    duplicateTopicPenalty,
    thinContentPenalty,
  };

  if (OFF_TOPIC.test(`${input.videoTitle} ${input.videoDescription}`)) {
    breakdown.contentRelevanceScore = Math.max(0, breakdown.contentRelevanceScore - 40);
    breakdown.thinContentPenalty += 15;
  }

  const seoQualityScore = computeSeoQualityScore(breakdown);
  let contentMode = resolveContentMode(seoQualityScore, settings);
  if (duplicateTopicBlocked && contentMode === 'ARTICLE_FEATURE') {
    contentMode = 'POST_AND_SHORTS';
  }
  if (wordCount < 150 && contentMode === 'ARTICLE_FEATURE') {
    contentMode = 'POST_AND_SHORTS';
  }
  if (OFF_TOPIC.test(input.videoTitle)) {
    contentMode = 'SHORTS_ONLY';
  }

  const checks = buildSeoChecks({
    h1,
    seoTitle: input.seoTitle ?? null,
    seoDescription: input.seoDescription ?? null,
    canonicalPath: input.canonicalPath ?? null,
    bodyMarkdown: body,
    youtubeDescription: input.videoDescription,
    internalLinksValid: validLinks,
    internalLinksTotal: internalLinks.length,
    relatedCount: input.relatedPostIds?.length ?? 0,
    embeddable: input.embeddable,
    thumbnailUrl: input.thumbnailUrl,
    duplicateTopicBlocked,
    wordCount,
    minWords: settings.minArticleWords,
  });

  const criticalFail = checks.some(
    (c) =>
      !c.pass &&
      ['h1', 'title', 'meta', 'words', 'embed', 'duplicate'].includes(c.id) &&
      contentMode === 'ARTICLE_FEATURE',
  );

  let isIndexable =
    contentMode === 'ARTICLE_FEATURE' &&
    seoQualityScore >= settings.indexableMin &&
    !duplicateTopicBlocked &&
    !criticalFail &&
    input.embeddable;

  const robots = isIndexable ? 'index,follow' : 'noindex,nofollow';
  if (contentMode === 'SHORTS_ONLY') {
    isIndexable = false;
  }

  return {
    seoQualityScore,
    contentMode,
    isIndexable,
    robots,
    topicCluster,
    location: loc.location,
    locationConfidence: loc.confidence,
    duplicateTopicBlocked,
    breakdown,
    checks,
    h1,
    perex,
    bodyMarkdown: body,
    seoTitle: input.seoTitle ?? null,
    seoDescription: input.seoDescription ?? null,
    slug: input.slug ?? null,
    canonicalPath: input.canonicalPath ?? null,
    internalLinks,
    relatedPostIds: input.relatedPostIds ?? [],
    schemaJson: null,
    wordCount,
  };
}

export function seoBadgeLabel(score: number): string {
  if (score >= 90) return 'VÝBORNÉ SEO';
  if (score >= 75) return 'KVALITNÍ';
  if (score >= 50) return 'DOPLNIT';
  return 'SHORTS ONLY';
}
