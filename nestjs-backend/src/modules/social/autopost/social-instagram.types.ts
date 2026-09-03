export type InstagramMediaType = 'PHOTO' | 'REEL';

export type InstagramContainerStatus =
  | 'UPLOADING'
  | 'PROCESSING'
  | 'READY'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'FAILED';

export type InstagramPublishResult = {
  externalPostId: string;
  publishedUrl: string;
  containerId: string;
  mediaType: InstagramMediaType;
  raw: unknown;
};

export type InstagramDiagnosticStep = {
  key: string;
  label: string;
  ok: boolean;
  message?: string | null;
  code?: number | null;
};

export type InstagramConnectionStatus = {
  connected: boolean;
  instagramBusinessId: string | null;
  instagramUsername: string | null;
  instagramName: string | null;
  profilePictureUrl: string | null;
  linkedPageId: string | null;
  linkedPageName: string | null;
  tokenActive: boolean;
  tokenExpiresAt: string | null;
  tokenScopes: string[];
  missingScopes: string[];
  scopesOk: boolean;
  needsReconnect: boolean;
  message: string | null;
  diagnostics: InstagramDiagnosticStep[];
};

export const INSTAGRAM_REQUIRED_SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
] as const;

export const DEFAULT_INSTAGRAM_POST_TEMPLATE = `{title}

{description}

Více na XXREALIT.cz

{hashtags}`;
