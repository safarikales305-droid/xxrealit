import type { UserRole } from '@prisma/client';
import type { FacebookPostType, SocialPublishKind } from '@prisma/client';

export type SocialApiLogEntry = {
  at: string;
  action: string;
  ok: boolean;
  statusCode?: number;
  body: unknown;
};

export type FacebookPublishResult = {
  externalPostId: string;
  publishedUrl: string;
  usedVideo: boolean;
  facebookPostType?: FacebookPostType;
  publishKind?: SocialPublishKind;
  contentTitle?: string | null;
  externalReelId?: string | null;
  reelPublishedUrl?: string | null;
  teaserDurationSec?: number | null;
  originalVideoDurationSec?: number | null;
  teaserError?: string | null;
  teaserUrl?: string | null;
  teaserLocalPath?: string | null;
  teaserDrawtextUsed?: boolean | null;
  teaserDrawtextSkippedReason?: string | null;
  introVideoUsed?: boolean | null;
  introVideoPropertyType?: string | null;
  introVideoDurationSec?: number | null;
  totalReelDurationSec?: number | null;
  introVideoError?: string | null;
  introVideoId?: string | null;
  introVideoTitle?: string | null;
  introVideoIdUsed?: string | null;
  sourceListingVideoUrl?: string | null;
  finalVideoUrl?: string | null;
  finalVideoGeneratedAt?: Date | string | null;
  finalVideoSizeBytes?: number | null;
  composeLog?: Record<string, unknown> | null;
  raw: unknown;
};

export type FacebookAutopostSettings = {
  enabled: boolean;
  pageId: string;
  pageAccessTokenEncrypted: string;
  pageName: string;
  /** Long-lived user token pro obnovu page tokenu (OAuth). */
  userAccessTokenEncrypted: string;
  tokenExpiresAt: string | null;
  tokenObtainedAt: string | null;
  tokenLastUsedAt: string | null;
  tokenScopes: string[];
  tokenWarning: string | null;
  connectedViaOAuth: boolean;
  publishPosts: boolean;
  publishProperties: boolean;
  publishShorts: boolean;
  /** Shorts/video inzeráty publikovat jako Facebook Reels. */
  publishShortsAsReels: boolean;
  /** Video příspěvky uživatelů publikovat jako Facebook Reels. */
  publishPostVideosAsReels: boolean;
  /** Při selhání Reels zkusit běžný video příspěvek. */
  reelsFallbackToVideoPost: boolean;
  /** Při nedostupném videu publikovat klasický příspěvek s fotkou. */
  reelsFallbackToPhotoPost: boolean;
  approvedOnly: boolean;
  publicPostsOnly: boolean;
  professionalsOnly: boolean;
  allowedRoles: UserRole[];
  /** Opakované publikování inzerátů na Facebook. */
  repeatPublishing: boolean;
};

export type PlatformPlaceholderSettings = {
  enabled: boolean;
  publishListings?: boolean;
  publishPosts?: boolean;
  publishShortsAsReels?: boolean;
  repeatPublishing?: boolean;
  preparedForFuture?: boolean;
};

export type InstagramAutopostSettings = PlatformPlaceholderSettings & {
  instagramBusinessId?: string | null;
  instagramUsername?: string | null;
  instagramName?: string | null;
  profilePictureUrl?: string | null;
  linkedPageId?: string | null;
  linkedPageName?: string | null;
  connected?: boolean;
  lastSyncedAt?: string | null;
};

export type SocialAutopostGlobalSettings = {
  autoPublishNewListings: boolean;
  autoPublishNewPosts: boolean;
  publishShortsAsReels: boolean;
  publishClassicAsPhotoPost: boolean;
  hidePublicPrice: boolean;
  repeatPublishingEnabled: boolean;
  /** Maximální délka video ukázky pro sociální sítě (sekundy). */
  videoTeaserMaxSeconds: number;
  /** Text na konci video ukázky. */
  videoTeaserEndSlideText: string;
  /** Přidat závěrečný slide s textem na konec videa. */
  videoTeaserEndSlideEnabled: boolean;
  /** Publikovat videa jako Reels (Facebook). */
  publishVideosAsReels: boolean;
  /** Publikovat obrázky jako foto příspěvek. */
  publishImagesAsPhotoPost: boolean;
  /** Při selhání uploadu média publikovat pouze odkaz. */
  fallbackToLinkOnMediaFailure: boolean;
  /** Pro sociální sítě použít stejné pravidlo ukázky videa jako na portálu. */
  socialVideoUsePortalTeaserRule: boolean;
  /** Vlastní délka ukázky videa pro sociální sítě (null = z portálu). */
  socialVideoTeaserSeconds: number | null;
  /** Publikovat celé video na sociální sítě (bez teaseru). */
  socialVideoPublishFull: boolean;
};

export type SocialAutopostSettings = {
  global: SocialAutopostGlobalSettings;
  facebook: FacebookAutopostSettings;
  instagram: InstagramAutopostSettings;
  youtube: PlatformPlaceholderSettings;
  tiktok: PlatformPlaceholderSettings;
  lastApiResponses: SocialApiLogEntry[];
};

export type FacebookAutopostSettingsPublic = Omit<
  FacebookAutopostSettings,
  'pageAccessTokenEncrypted' | 'userAccessTokenEncrypted'
> & {
  /** Alias pro `enabled` v API odpovědi. */
  facebookEnabled?: boolean;
  connected: boolean;
  maskedToken: string | null;
  tokenSet: boolean;
};

export type SocialAutopostSettingsPublic = {
  global: SocialAutopostGlobalSettings;
  facebook: FacebookAutopostSettingsPublic;
  instagram: InstagramAutopostSettings;
  youtube: PlatformPlaceholderSettings;
  tiktok: PlatformPlaceholderSettings;
  lastApiResponses: SocialApiLogEntry[];
};

export const DEFAULT_SOCIAL_AUTOPOST_GLOBAL: SocialAutopostGlobalSettings = {
  autoPublishNewListings: true,
  autoPublishNewPosts: true,
  publishShortsAsReels: true,
  publishClassicAsPhotoPost: true,
  hidePublicPrice: true,
  repeatPublishingEnabled: true,
  videoTeaserMaxSeconds: 5,
  videoTeaserEndSlideText: 'Více na XXREALIT.cz',
  videoTeaserEndSlideEnabled: true,
  publishVideosAsReels: true,
  publishImagesAsPhotoPost: true,
  fallbackToLinkOnMediaFailure: false,
  socialVideoUsePortalTeaserRule: true,
  socialVideoTeaserSeconds: null,
  socialVideoPublishFull: false,
};

export const DEFAULT_FACEBOOK_AUTOPOST: FacebookAutopostSettings = {
  enabled: false,
  pageId: '',
  pageAccessTokenEncrypted: '',
  pageName: '',
  userAccessTokenEncrypted: '',
  tokenExpiresAt: null,
  tokenObtainedAt: null,
  tokenLastUsedAt: null,
  tokenScopes: [],
  tokenWarning: null,
  connectedViaOAuth: false,
  publishPosts: true,
  publishProperties: true,
  publishShorts: true,
  publishShortsAsReels: true,
  publishPostVideosAsReels: true,
  reelsFallbackToVideoPost: true,
  reelsFallbackToPhotoPost: true,
  approvedOnly: true,
  publicPostsOnly: true,
  professionalsOnly: false,
  allowedRoles: [],
  repeatPublishing: true,
};

export const DEFAULT_PLATFORM_PLACEHOLDER: PlatformPlaceholderSettings = {
  enabled: false,
  publishListings: false,
  publishPosts: false,
  publishShortsAsReels: false,
  repeatPublishing: false,
  preparedForFuture: true,
};

export const DEFAULT_INSTAGRAM_AUTOPOST: InstagramAutopostSettings = {
  enabled: false,
  publishListings: false,
  publishPosts: false,
  publishShortsAsReels: false,
  repeatPublishing: false,
  preparedForFuture: false,
  instagramBusinessId: null,
  instagramUsername: null,
  instagramName: null,
  profilePictureUrl: null,
  linkedPageId: null,
  linkedPageName: null,
  connected: false,
  lastSyncedAt: null,
};

export const DEFAULT_SOCIAL_AUTOPOST_SETTINGS: SocialAutopostSettings = {
  global: { ...DEFAULT_SOCIAL_AUTOPOST_GLOBAL },
  facebook: { ...DEFAULT_FACEBOOK_AUTOPOST },
  instagram: { ...DEFAULT_INSTAGRAM_AUTOPOST },
  youtube: { ...DEFAULT_PLATFORM_PLACEHOLDER },
  tiktok: { ...DEFAULT_PLATFORM_PLACEHOLDER },
  lastApiResponses: [],
};

export const PROFESSIONAL_ROLES: UserRole[] = [
  'AGENT',
  'AGENCY',
  'COMPANY',
  'FINANCIAL_ADVISOR',
  'INVESTOR',
  'DEVELOPER',
  'PRIVATE_SELLER',
  'CRAFTSMAN',
];

export function maskAccessToken(token: string | null | undefined): string | null {
  const t = token?.trim();
  if (!t) return null;
  if (t.length <= 8) return '••••••••';
  return `${t.slice(0, 4)}••••••••${t.slice(-4)}`;
}
