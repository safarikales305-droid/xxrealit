import type { UserRole } from '@prisma/client';

export type SocialApiLogEntry = {
  at: string;
  action: string;
  ok: boolean;
  statusCode?: number;
  body: unknown;
};

export type FacebookAutopostSettings = {
  enabled: boolean;
  pageId: string;
  pageAccessTokenEncrypted: string;
  pageName: string;
  tokenExpiresAt: string | null;
  publishPosts: boolean;
  publishProperties: boolean;
  publishShorts: boolean;
  approvedOnly: boolean;
  publicPostsOnly: boolean;
  professionalsOnly: boolean;
  allowedRoles: UserRole[];
};

export type PlatformPlaceholderSettings = {
  enabled: boolean;
};

export type SocialAutopostSettings = {
  facebook: FacebookAutopostSettings;
  instagram: PlatformPlaceholderSettings;
  youtube: PlatformPlaceholderSettings;
  tiktok: PlatformPlaceholderSettings;
  lastApiResponses: SocialApiLogEntry[];
};

export type FacebookAutopostSettingsPublic = Omit<
  FacebookAutopostSettings,
  'pageAccessTokenEncrypted'
> & {
  connected: boolean;
  maskedToken: string | null;
  tokenSet: boolean;
};

export type SocialAutopostSettingsPublic = {
  facebook: FacebookAutopostSettingsPublic;
  instagram: PlatformPlaceholderSettings;
  youtube: PlatformPlaceholderSettings;
  tiktok: PlatformPlaceholderSettings;
  lastApiResponses: SocialApiLogEntry[];
};

export const DEFAULT_FACEBOOK_AUTOPOST: FacebookAutopostSettings = {
  enabled: false,
  pageId: '',
  pageAccessTokenEncrypted: '',
  pageName: '',
  tokenExpiresAt: null,
  publishPosts: true,
  publishProperties: true,
  publishShorts: true,
  approvedOnly: true,
  publicPostsOnly: true,
  professionalsOnly: false,
  allowedRoles: [],
};

export const DEFAULT_SOCIAL_AUTOPOST_SETTINGS: SocialAutopostSettings = {
  facebook: { ...DEFAULT_FACEBOOK_AUTOPOST },
  instagram: { enabled: false },
  youtube: { enabled: false },
  tiktok: { enabled: false },
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
