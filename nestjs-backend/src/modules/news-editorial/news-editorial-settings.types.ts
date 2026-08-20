import { NewsPublishMode } from '@prisma/client';

export type NewsAutomationSettings = {
  enabled: boolean;
  fetchIntervalMinutes: number;
  publishMode: NewsPublishMode;
  minArticlesPerDay: number;
  maxArticlesPerDay: number;
  publishTimes: string[];
  autoPublishMinQuality: number;
  createPortalPost: boolean;
  createFacebookPost: boolean;
  portalPostAuthorLabel: string;
  addHashtags: boolean;
  maxTeaserLength: number;
  defaultOgImageUrl?: string;
};

export const DEFAULT_NEWS_AUTOMATION_SETTINGS: NewsAutomationSettings = {
  enabled: true,
  fetchIntervalMinutes: 30,
  publishMode: NewsPublishMode.AFTER_APPROVAL,
  minArticlesPerDay: 1,
  maxArticlesPerDay: 5,
  publishTimes: ['09:00', '12:00', '17:00'],
  autoPublishMinQuality: 80,
  createPortalPost: true,
  createFacebookPost: false,
  portalPostAuthorLabel: 'Redakce XXREALIT',
  addHashtags: true,
  maxTeaserLength: 280,
  defaultOgImageUrl: '/images/aktuality-default-og.jpg',
};

export const NEWS_ARTICLES_PER_DAY_MIN = 0;
export const NEWS_ARTICLES_PER_DAY_MAX = 20;
