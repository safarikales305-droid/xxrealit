export const META_CENTER_OAUTH_MODE = 'meta_center_connect';
export const META_CENTER_OAUTH_STATE_PREFIX = 'x';

export const META_CENTER_CONNECT_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'pages_manage_metadata',
  'business_management',
  'catalog_management',
  'ads_management',
  'ads_read',
  'instagram_basic',
  'instagram_manage_messages',
  'whatsapp_business_management',
  'whatsapp_business_messaging',
].join(',');

export const META_CONNECT_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const META_CENTER_ADMIN_URL = '/admin/marketing/meta-centrum';

export const META_TEST_EVENT_NAMES = [
  'PageView',
  'ViewContent',
  'Search',
  'Lead',
  'CompleteRegistration',
  'Contact',
  'PurchaseCredits',
  'Favorite',
  'Share',
  'VideoPlay',
  'MessageSeller',
  'AddListing',
  'PublishListing',
  'PublishPost',
  'PublishReel',
] as const;

export type MetaConnectionCheckKey =
  | 'login_app'
  | 'login_app_secret'
  | 'login_oauth'
  | 'meta_connected'
  | 'app'
  | 'app_secret'
  | 'oauth'
  | 'access_token'
  | 'business'
  | 'ad_account'
  | 'page'
  | 'facebook_pages_api'
  | 'user_facebook_pages'
  | 'instagram'
  | 'commerce'
  | 'catalog'
  | 'dataset'
  | 'pixel'
  | 'capi'
  | 'webhook'
  | 'whatsapp'
  | 'feed'
  | 'api';

export type MetaConnectionStatusLevel = 'online' | 'optional' | 'missing_config' | 'api_error';

export type MetaConnectionSource =
  | 'whatsapp_module'
  | 'social_autopost'
  | 'user_facebook_pages'
  | 'facebook_login'
  | 'meta_connect'
  | 'meta_catalog'
  | 'env'
  | 'graph_api'
  | 'feed';

export type MetaConnectionCheck = {
  key: MetaConnectionCheckKey;
  label: string;
  connected: boolean;
  optional?: boolean;
  status: MetaConnectionStatusLevel;
  error: string | null;
  detail?: string | null;
  fixAction: string | null;
  fixHref?: string | null;
  source: MetaConnectionSource;
};

export type MetaDiscoveredResources = {
  user: { id: string; name: string } | null;
  business: { id: string; name: string } | null;
  adAccount: { id: string; name: string } | null;
  page: { id: string; name: string; pageAccessToken?: string } | null;
  instagram: { id: string; username: string } | null;
  catalog: { id: string; name: string } | null;
  pixel: { id: string; name: string } | null;
  dataset: { id: string } | null;
  commerce: { id: string; name: string } | null;
  whatsapp: { businessAccountId: string; phoneNumberId: string | null } | null;
  testEventCode: string | null;
  warnings: string[];
};
