export const FACEBOOK_GRAPH_VERSION = 'v23.0';

export const GRAPH_API = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}`;

export const FACEBOOK_OAUTH_DIALOG = `https://www.facebook.com/${FACEBOOK_GRAPH_VERSION}/dialog/oauth`;

/** Facebook Login / registrace — public_profile + email. */
export const FACEBOOK_LOGIN_SCOPES = 'public_profile,email';

/** Propojení účtu + stránky — všechna požadovaná oprávnění. */
export const FACEBOOK_FULL_SCOPES = [
  'email',
  'public_profile',
  'pages_show_list',
  'pages_read_engagement',
  'pages_read_user_content',
].join(',');

/** @deprecated Použijte FACEBOOK_FULL_SCOPES */
export const FACEBOOK_PAGE_CONNECT_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_read_user_content',
].join(',');

/** @deprecated Použijte FACEBOOK_PAGE_CONNECT_SCOPES */
export const FACEBOOK_ADVANCED_PAGE_SCOPES = FACEBOOK_PAGE_CONNECT_SCOPES;

/** @deprecated Použijte FACEBOOK_LOGIN_SCOPES */
export const FACEBOOK_BASIC_SCOPES = FACEBOOK_LOGIN_SCOPES;

export const FACEBOOK_IMPORT_TAG = 'Importováno z Facebooku';
export const FACEBOOK_PAGE_BADGE = 'Facebook stránka';
