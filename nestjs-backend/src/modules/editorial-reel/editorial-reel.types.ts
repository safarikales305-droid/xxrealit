import type { EditorialReelJobStatus, ReelNarrationMode, ReelTransitionStyle } from '@prisma/client';

export type ReelNarrationModeType = ReelNarrationMode;

/** Budoucí AI voice / avatar — zatím jen rozhraní. */
export interface ReelNarrationProvider {
  readonly mode: ReelNarrationMode;
  generate(input: {
    introText: string;
    segments: Array<{ title: string; channelTitle?: string; categoryLabel?: string }>;
    outroText: string;
  }): Promise<{ audioPath?: string; captions?: string }>;
}

export type EditorialReelAutomationSettings = {
  enabled: boolean;
  videosPerReel: number;
  maxWaitHours: number;
  minVideos: number;
  autoPublish: boolean;
  categorySlugs: string[];
  templateId?: string | null;
  musicTrackId?: string | null;
  ctaUrl: string;
  introText: string;
  outroText: string;
};

export const DEFAULT_EDITORIAL_REEL_SETTINGS: EditorialReelAutomationSettings = {
  enabled: false,
  videosPerReel: 5,
  maxWaitHours: 24,
  minVideos: 3,
  autoPublish: true,
  categorySlugs: [],
  ctaUrl: 'https://www.xxrealit.cz/?tab=shorts&source=facebook-reel',
  introText: 'Co je nového ve světě realit',
  outroText: 'Sledujte další videa na XXREALIT.cz',
};

export type EditorialReelTemplateInput = {
  name: string;
  introSec?: number;
  segmentSec?: number;
  outroSec?: number;
  videosPerReel?: number;
  transition?: ReelTransitionStyle;
  showLogo?: boolean;
  showVideoTitle?: boolean;
  showChannelTitle?: boolean;
  showCategory?: boolean;
  ctaText?: string;
  introText?: string | null;
  musicTrackId?: string | null;
  narrationMode?: ReelNarrationMode;
  isDefault?: boolean;
};

export type CreateReelJobInput = {
  postIds: string[];
  title?: string;
  templateId?: string;
  categoryId?: string;
  autoPublish?: boolean;
};

export type EditorialCenterDashboard = {
  activeYoutubeChannels: number;
  activeRssSources: number;
  videosImportedToday: number;
  articlesImportedToday: number;
  shortsContentCount: number;
  autoPublishingActive: boolean;
  facebookReelsThisWeek: number;
  syncErrors: number;
  reelAutomationActive: boolean;
  lastReelAt: string | null;
  lastReelStatus: EditorialReelJobStatus | null;
};
