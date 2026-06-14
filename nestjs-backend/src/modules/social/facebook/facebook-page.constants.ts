export const GRAPH_API = 'https://graph.facebook.com/v21.0';

/** Facebook Login / registrace — public_profile + email (Meta App Review). */
export const FACEBOOK_LOGIN_SCOPES = 'public_profile,email';

/** Propojení Facebook stránky — vyžaduje Meta App Review. */
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
