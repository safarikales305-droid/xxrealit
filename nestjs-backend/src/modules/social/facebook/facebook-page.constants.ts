export const GRAPH_API = 'https://graph.facebook.com/v21.0';

/** Základní OAuth scope před Meta App Review (bez email — vyžaduje schválení). */
export const FACEBOOK_BASIC_SCOPES = 'public_profile';

/**
 * Rozšířené pages scope — povolit až po schválení v Meta App Review.
 * Použijte buildConnectUrl(..., { advanced: true }).
 */
export const FACEBOOK_ADVANCED_PAGE_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_read_user_content',
  'pages_manage_metadata',
].join(',');

export const FACEBOOK_IMPORT_TAG = 'Importováno z Facebooku';
