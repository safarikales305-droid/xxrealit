import { NewsPublishMode } from '@prisma/client';

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
  portalPostAuthorLabel: 'Redakce XXREALIT',
  addHashtags: true,
  maxTeaserLength: 280,
  defaultOgImageUrl: '/images/aktuality-default-og.svg',
  youtubeMonitoringEnabled: true,
  youtubeCheckIntervalMinutes: 30,
  youtubeMaxPostsPerDay: 5,
  youtubeMinRelevance: 70,
  youtubeCreatePortalPost: true,
  youtubeCreateFacebookPost: false,
  youtubeUseAiTeaser: true,
  youtubeInitialSyncVideos: 5,
  youtubeInitialSyncIgnoreRelevance: true,
};

export const NEWS_ARTICLES_PER_DAY_MIN = 0;
export const NEWS_ARTICLES_PER_DAY_MAX = 20;
