import { SeoContentStatus } from '@prisma/client';

export const INDEXABILITY_REASONS = [
  'INDEXABLE',
  'NO_ACTIVE_LISTINGS',
  'THIN_CONTENT',
  'DUPLICATE_CONTENT',
  'DUPLICATE_TITLE',
  'DUPLICATE_DESCRIPTION',
  'INVALID_CANONICAL',
  'MISSING_METADATA',
  'MISSING_H1',
  'MISSING_CONTENT',
  'INVALID_LOCALITY',
  'HTTP_NOT_200',
  'BLOCKED_BY_ROBOTS',
  'DRAFT_PAGE',
  'MANUAL_NOINDEX',
  'LOW_QUALITY_SCORE',
  'UNKNOWN',
] as const;

export type IndexabilityReason = (typeof INDEXABILITY_REASONS)[number];

export type IndexabilityInput = {
  title?: string | null;
  description?: string | null;
  h1?: string | null;
  bodyText?: string | null;
  faq?: unknown;
  internalLinks?: unknown;
  relatedLocations?: unknown;
  canonical?: string | null;
  publicPath: string;
  status?: SeoContentStatus | string;
  manualNoindex?: boolean;
  locationActive?: boolean;
  hasLocalityData?: boolean;
  listingCount?: number;
  httpStatus?: number | null;
  duplicateTitle?: boolean;
  duplicateDescription?: boolean;
  duplicateContent?: boolean;
  minScore?: number;
  reviewScore?: number;
};

export type IndexabilityResult = {
  indexable: boolean;
  noindex: boolean;
  robots: string;
  indexabilityScore: number;
  indexabilityReason: IndexabilityReason;
  indexabilityChecksJson: Record<string, boolean | number | string | null>;
  inSitemap: boolean;
};

const SITE_ORIGIN = 'https://www.xxrealit.cz';

export function normalizeCanonicalUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_ORIGIN}${p}`;
}

export function isSelfCanonical(canonical: string | null | undefined, publicPath: string): boolean {
  if (!canonical?.trim()) return false;
  const expected = normalizeCanonicalUrl(publicPath);
  const normalized = canonical.trim().replace(/\/+$/, '');
  return normalized === expected.replace(/\/+$/, '');
}

export function getRobotsMetadata(page: {
  noindex?: boolean;
  robots?: string | null;
  indexable?: boolean;
}): { robots: string; googlebot: string; index: boolean; follow: boolean } {
  const noindex = page.indexable === false || page.noindex === true;
  if (noindex) {
    return { robots: 'noindex,follow', googlebot: 'noindex,follow', index: false, follow: true };
  }
  const robots = page.robots?.trim() || 'index,follow';
  const index = !/noindex/i.test(robots);
  const follow = !/nofollow/i.test(robots);
  return {
    robots: index ? 'index,follow' : 'noindex,follow',
    googlebot: index ? 'index,follow' : 'noindex,follow',
    index,
    follow: follow || !index,
  };
}

function countItems(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function computeIndexability(input: IndexabilityInput): IndexabilityResult {
  const minScore = input.minScore ?? 70;
  const reviewScore = input.reviewScore ?? 50;
  const title = (input.title ?? '').trim();
  const description = (input.description ?? '').trim();
  const h1 = (input.h1 ?? '').trim();
  const bodyText = (input.bodyText ?? '').trim();
  const words = wordCount(bodyText);
  const faqCount = countItems(input.faq);
  const linkCount = countItems(input.internalLinks);
  const relatedCount = countItems(input.relatedLocations);
  const selfCanonical = isSelfCanonical(input.canonical, input.publicPath);

  const checks: Record<string, boolean | number | string | null> = {
    validLocality: Boolean(input.locationActive !== false),
    uniqueH1: h1.length >= 10,
    uniqueTitle: title.length >= 20 && title.length <= 70,
    uniqueDescription: description.length >= 80 && description.length <= 170,
    sufficientContent: words >= 200,
    hasFaq: faqCount >= 3,
    hasInternalLinks: linkCount >= 2,
    hasRelatedLocations: relatedCount >= 1,
    hasLocalityData: Boolean(input.hasLocalityData),
    activeListings: (input.listingCount ?? 0) > 0,
    selfCanonical,
    http200: input.httpStatus == null ? true : input.httpStatus === 200,
    published: input.status === SeoContentStatus.PUBLISHED,
    wordCount: words,
    faqCount,
    linkCount,
    listingCount: input.listingCount ?? 0,
  };

  let score = 0;
  if (checks.validLocality) score += 20;
  if (checks.uniqueH1) score += 15;
  if (checks.uniqueTitle && checks.uniqueDescription) score += 15;
  if (checks.sufficientContent) score += 15;
  if (checks.hasFaq) score += 10;
  if (checks.hasInternalLinks) score += 10;
  if (checks.hasLocalityData) score += 10;
  if (checks.activeListings) score += 5;
  if (checks.hasRelatedLocations) score += 5;

  let reason: IndexabilityReason = 'UNKNOWN';

  if (input.manualNoindex) {
    reason = 'MANUAL_NOINDEX';
  } else if (input.status === SeoContentStatus.DRAFT) {
    reason = 'DRAFT_PAGE';
  } else if (!checks.validLocality) {
    reason = 'INVALID_LOCALITY';
  } else if (!title || !description) {
    reason = 'MISSING_METADATA';
  } else if (!h1) {
    reason = 'MISSING_H1';
  } else if (!bodyText) {
    reason = 'MISSING_CONTENT';
  } else if (input.duplicateContent) {
    reason = 'DUPLICATE_CONTENT';
  } else if (input.duplicateTitle) {
    reason = 'DUPLICATE_TITLE';
  } else if (input.duplicateDescription) {
    reason = 'DUPLICATE_DESCRIPTION';
  } else if (!selfCanonical) {
    reason = 'INVALID_CANONICAL';
  } else if (input.httpStatus != null && input.httpStatus !== 200) {
    reason = 'HTTP_NOT_200';
  } else if (!checks.sufficientContent) {
    reason = 'THIN_CONTENT';
  } else if (score < reviewScore) {
    reason = 'LOW_QUALITY_SCORE';
  } else if (score < minScore) {
    reason = (input.listingCount ?? 0) === 0 ? 'NO_ACTIVE_LISTINGS' : 'LOW_QUALITY_SCORE';
  } else {
    reason = 'INDEXABLE';
  }

  const indexable =
    reason === 'INDEXABLE' &&
    input.status === SeoContentStatus.PUBLISHED &&
    !input.manualNoindex &&
    selfCanonical &&
    (input.httpStatus == null || input.httpStatus === 200);

  const noindex = !indexable;
  const robots = indexable ? 'index,follow' : 'noindex,follow';
  const inSitemap = indexable && selfCanonical && (input.httpStatus == null || input.httpStatus === 200);

  return {
    indexable,
    noindex,
    robots,
    indexabilityScore: score,
    indexabilityReason: reason,
    indexabilityChecksJson: { ...checks, score, reason },
    inSitemap,
  };
}
