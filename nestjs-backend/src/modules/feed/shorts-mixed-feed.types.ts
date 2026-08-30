export type ShortsItemType =
  | 'property'
  | 'property-video'
  | 'youtube'
  | 'article'
  | 'news'
  | 'editorial'
  | 'post'
  | 'finance';

export type ShortsFeedItem = {
  feedKey: string;
  contentType: ShortsItemType;
  score: number;
  publishedAt: string | null;
  payload: Record<string, unknown>;
};

export type ShortsFeedResponse = {
  items: ShortsFeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
  /** Index of target item within returned page (when target= query was used). */
  targetIndexInPage?: number | null;
  targetFeedKey?: string | null;
  targetFound?: boolean;
  topicFilterEmpty?: boolean;
};

export type ShortsFeedCursor = {
  offset: number;
};
