import { NewsPublishMode } from '@prisma/client';

export type FacebookLinkTarget =
  | 'PORTAL_DETAIL'
  | 'SOURCE'
  | 'YOUTUBE_ORIGINAL'
  | 'ARTICLE_DETAIL';

export const DEFAULT_FACEBOOK_POST_TEMPLATE = `🏡 Nový příspěvek na XXREALIT

{title}

{teaser}

👉 Více:
{url}

{hashtags}`;

export const DEFAULT_FACEBOOK_YOUTUBE_TEMPLATE = `🎥 Nové video na XXREALIT

{title}

{teaser}

👉 Více:
{url}

{hashtags}`;

export const DEFAULT_FACEBOOK_HASHTAGS = '#xxrealit #reality #bydleni';

export type NewsAutomationSettings = {
  enabled: boolean;
  autoFetchSources: boolean;
  autoAiProcessing: boolean;
  autoPublishArticles: boolean;
  fetchIntervalMinutes: number;
  publishMode: NewsPublishMode;
  minArticlesPerDay: number;
  maxArticlesPerDay: number;
  maxArticlesPerSourcePerDay: number;
  minRelevanceScore: number;
  publishTimes: string[];
  minMinutesBetweenArticles: number;
  autoPublishMinQuality: number;
  minLanguageQuality: number;
  createPortalPost: boolean;
  createFacebookPost: boolean;
  portalPostAuthorLabel: string;
  addHashtags: boolean;
  maxTeaserLength: number;
  defaultOgImageUrl?: string;
  youtubeMonitoringEnabled: boolean;
  youtubeCheckIntervalMinutes: number;
  youtubeMaxPostsPerDay: number;
  youtubeMinRelevance: number;
  youtubeCreatePortalPost: boolean;
  youtubeCreateFacebookPost: boolean;
  youtubeUseAiTeaser: boolean;
  youtubeInitialSyncVideos: number;
  youtubeInitialSyncIgnoreRelevance: boolean;
  facebookLinkTargetPortalPost: FacebookLinkTarget;
  facebookLinkTargetNewsArticle: FacebookLinkTarget;
  facebookLinkTargetYoutube: FacebookLinkTarget;
  facebookPostTemplate: string;
  facebookYoutubePostTemplate: string;
  facebookHashtags: string;
};

export const DEFAULT_NEWS_AUTOMATION_SETTINGS: NewsAutomationSettings = {
  enabled: true,
  autoFetchSources: true,
  autoAiProcessing: true,
  autoPublishArticles: false,
  fetchIntervalMinutes: 30,
  publishMode: NewsPublishMode.AFTER_APPROVAL,
  minArticlesPerDay: 1,
  maxArticlesPerDay: 5,
  maxArticlesPerSourcePerDay: 2,
  minRelevanceScore: 45,
  publishTimes: ['09:00', '12:00', '17:00'],
  minMinutesBetweenArticles: 120,
  autoPublishMinQuality: 80,
  minLanguageQuality: 80,
  createPortalPost: true,
  createFacebookPost: false,
  portalPostAuthorLabel: 'AI redakce XXrealit',
  addHashtags: true,
  maxTeaserLength: 280,
  defaultOgImageUrl: '/images/aktuality-default-og.svg',
  youtubeMonitoringEnabled: true,
  youtubeCheckIntervalMinutes: 10,
  youtubeMaxPostsPerDay: 50,
  youtubeMinRelevance: 70,
  youtubeCreatePortalPost: true,
  youtubeCreateFacebookPost: false,
  youtubeUseAiTeaser: true,
  youtubeInitialSyncVideos: 30,
  youtubeInitialSyncIgnoreRelevance: true,
  facebookLinkTargetPortalPost: 'PORTAL_DETAIL',
  facebookLinkTargetNewsArticle: 'ARTICLE_DETAIL',
  facebookLinkTargetYoutube: 'PORTAL_DETAIL',
  facebookPostTemplate: DEFAULT_FACEBOOK_POST_TEMPLATE,
  facebookYoutubePostTemplate: DEFAULT_FACEBOOK_YOUTUBE_TEMPLATE,
  facebookHashtags: DEFAULT_FACEBOOK_HASHTAGS,
};

export const NEWS_ARTICLES_PER_DAY_MIN = 0;
export const NEWS_ARTICLES_PER_DAY_MAX = 20;
