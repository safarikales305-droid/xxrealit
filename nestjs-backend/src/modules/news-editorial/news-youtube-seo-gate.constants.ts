export type EditorialContentMode = 'SHORTS_ONLY' | 'POST_AND_SHORTS' | 'ARTICLE_FEATURE';

export type YoutubeSeoGateSettings = {
  shortsOnlyMax: number;
  postAndShortsMax: number;
  articleFeatureMin: number;
  indexableMin: number;
  minArticleWords: number;
  maxArticleWords: number;
  topicClusterDays: number;
};

export const DEFAULT_YOUTUBE_SEO_GATE_SETTINGS: YoutubeSeoGateSettings = {
  shortsOnlyMax: 49,
  postAndShortsMax: 74,
  articleFeatureMin: 75,
  indexableMin: 75,
  minArticleWords: 300,
  maxArticleWords: 800,
  topicClusterDays: 90,
};

export type SeoGateCheckItem = {
  id: string;
  label: string;
  pass: boolean;
  detail?: string;
};

export type YoutubeSeoScoreBreakdown = {
  contentRelevanceScore: number;
  originalityScore: number;
  textQualityScore: number;
  seoMetadataScore: number;
  internalLinkScore: number;
  locationScore: number;
  sourceTrustScore: number;
  duplicateTopicPenalty: number;
  thinContentPenalty: number;
};

export type YoutubeSeoGateResult = {
  seoQualityScore: number;
  contentMode: EditorialContentMode;
  isIndexable: boolean;
  robots: string;
  topicCluster: string | null;
  location: string | null;
  locationConfidence: number;
  duplicateTopicBlocked: boolean;
  breakdown: YoutubeSeoScoreBreakdown;
  checks: SeoGateCheckItem[];
  h1: string | null;
  perex: string | null;
  bodyMarkdown: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  slug: string | null;
  canonicalPath: string | null;
  internalLinks: Array<{ label: string; path: string; valid: boolean }>;
  relatedPostIds: string[];
  schemaJson: Record<string, unknown> | null;
  wordCount: number;
};

export type InternalLinkSuggestion = { label: string; path: string };
