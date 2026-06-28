const rawGraphVersion = process.env.FACEBOOK_GRAPH_API_VERSION?.trim() || 'v25.0';
export const FACEBOOK_GRAPH_VERSION = rawGraphVersion.startsWith('v')
  ? rawGraphVersion
  : `v${rawGraphVersion}`;

export const GRAPH_API = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}`;
export const GRAPH_VIDEO_API = `https://graph-video.facebook.com/${FACEBOOK_GRAPH_VERSION}`;

export const FACEBOOK_OAUTH_DIALOG = `https://www.facebook.com/${FACEBOOK_GRAPH_VERSION}/dialog/oauth`;

/** Facebook Login / registrace — public_profile + email. */
export const FACEBOOK_LOGIN_SCOPES = 'public_profile,email';

/** Facebook Pages API — oprávnění pro výběr stránky a import příspěvků. */
export const FACEBOOK_PAGE_API_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  'pages_manage_posts',
].join(',');

/** Propojení účtu + stránky — všechna požadovaná oprávnění. */
export const FACEBOOK_FULL_SCOPES = [
  'email',
  'public_profile',
  ...FACEBOOK_PAGE_API_SCOPES.split(','),
].join(',');

/** Počet příspěvků načtených z Graph API při synchronizaci stránky. */
export const FACEBOOK_PAGE_POSTS_LIMIT = 10;

/** Interval automatické synchronizace stránek (ms). */
export const FACEBOOK_PAGE_SYNC_INTERVAL_MS = 30 * 60 * 1000;

/** @deprecated Použijte FACEBOOK_PAGE_API_SCOPES */
export const FACEBOOK_PAGE_CONNECT_SCOPES = FACEBOOK_PAGE_API_SCOPES;

/** @deprecated Použijte FACEBOOK_PAGE_CONNECT_SCOPES */
export const FACEBOOK_ADVANCED_PAGE_SCOPES = FACEBOOK_PAGE_CONNECT_SCOPES;

/** @deprecated Použijte FACEBOOK_LOGIN_SCOPES */
export const FACEBOOK_BASIC_SCOPES = FACEBOOK_LOGIN_SCOPES;

export const FACEBOOK_IMPORT_TAG = 'Importováno z Facebooku';
export const FACEBOOK_PAGE_BADGE = 'Facebook stránka';
