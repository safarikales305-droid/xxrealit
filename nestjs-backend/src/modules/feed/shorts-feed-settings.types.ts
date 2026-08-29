export const SHORTS_FEED_SETTINGS_KEY = 'shorts_feed_settings';

export type ShortsFeedPropertyPriority = 'high' | 'medium' | 'low';

export type ShortsFeedSettings = {
  showProperties: boolean;
  showYoutube: boolean;
  showArticles: boolean;
  showNews: boolean;
  showEditorial: boolean;
  showUserPosts: boolean;
  showFinanceNews: boolean;
  propertyPriority: ShortsFeedPropertyPriority;
  /** Obsahová položka každých N položek (např. 3 = 2 reality + 1 obsah). */
  contentEveryNItems: number;
  /** Minimální podíl realit v % (0–100). */
  minPropertyRatioPercent: number;
  /** 0–10 realit → cílový podíl realit v %. */
  propertyRatioTierLow: number;
  /** 10–50 realit → cílový podíl realit v %. */
  propertyRatioTierMid: number;
  /** 50+ realit → cílový podíl realit v %. */
  propertyRatioTierHigh: number;
  /** Zvýhodnit novější obsah ve skóre řazení. */
  preferNewContent: boolean;
};

export const DEFAULT_SHORTS_FEED_SETTINGS: ShortsFeedSettings = {
  showProperties: true,
  showYoutube: true,
  showArticles: true,
  showNews: true,
  showEditorial: true,
  showUserPosts: true,
  showFinanceNews: true,
  propertyPriority: 'high',
  contentEveryNItems: 3,
  minPropertyRatioPercent: 70,
  propertyRatioTierLow: 50,
  propertyRatioTierMid: 70,
  propertyRatioTierHigh: 85,
  preferNewContent: true,
};
