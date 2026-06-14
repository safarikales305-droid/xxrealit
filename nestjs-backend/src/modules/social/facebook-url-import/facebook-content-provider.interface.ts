import type { FacebookImportDetectedReason } from './facebook-import-reason';

/** Abstrakce pro budoucí Meta Graph API provider — nyní scraper, později oficiální API. */
export type FacebookScrapedPost = {
  externalId: string;
  permalink: string;
  message: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  publishedAt?: Date | null;
};

export type FacebookScrapeAttempt = {
  fetchUrl: string;
  httpStatus: number;
  contentLength: number;
  rawSnippet: string;
  blocked: boolean;
  postsFound: number;
};

export type FacebookScrapeResult = {
  posts: FacebookScrapedPost[];
  detectedReason: FacebookImportDetectedReason;
  fetchUrl: string | null;
  httpStatus: number | null;
  contentLength: number | null;
  rawSnippet: string | null;
  attempts: FacebookScrapeAttempt[];
};

export interface FacebookContentProvider {
  fetchPublicPosts(pageUrl: string, limit: number): Promise<FacebookScrapeResult>;
}

export const FACEBOOK_CONTENT_PROVIDER = 'FACEBOOK_CONTENT_PROVIDER';
