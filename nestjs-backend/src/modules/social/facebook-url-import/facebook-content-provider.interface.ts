/** Abstrakce pro budoucí Meta Graph API provider — nyní scraper, později oficiální API. */
export type FacebookScrapedPost = {
  externalId: string;
  permalink: string;
  message: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  publishedAt?: Date | null;
};

export interface FacebookContentProvider {
  fetchPublicPosts(pageUrl: string, limit: number): Promise<FacebookScrapedPost[]>;
}

export const FACEBOOK_CONTENT_PROVIDER = 'FACEBOOK_CONTENT_PROVIDER';
