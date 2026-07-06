import { FACEBOOK_LOGIN_SCOPES } from '../social/facebook/facebook-page.constants';

/** Samostatné Meta OAuth toky — každý žádá pouze potřebná oprávnění. */
export type MetaOAuthFlowKey =
  | 'login'
  | 'pages'
  | 'catalog'
  | 'instagram'
  | 'whatsapp'
  | 'marketing'
  /** @deprecated Použijte marketing */
  | 'ads';

export type MetaOAuthFlowStatus =
  | 'connected'
  | 'missing_scopes'
  | 'ready'
  | 'env_missing'
  | 'reconnect';

export type MetaOAuthFlowDefinition = {
  key: MetaOAuthFlowKey;
  label: string;
  description: string;
  scopes: readonly string[];
  sessionMode: string;
  usesLoginApp: boolean;
  usesPagesApp: boolean;
  usesMarketingApp: boolean;
  oauthPath: string;
  envVarKey: string;
  /** Skrytý v Meta Centrum OAuth kontrole (např. WhatsApp má vlastní modul). */
  hiddenInMetaCenterOAuth?: boolean;
};

const pagesScopes = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'pages_manage_metadata',
] as const;

const marketingScopes = ['ads_management', 'ads_read', 'business_management'] as const;

export const META_OAUTH_FLOW_ENV_KEYS: Record<
  'login' | 'pages' | 'catalog' | 'instagram' | 'marketing' | 'whatsapp',
  string
> = {
  login: 'META_APPROVED_OAUTH_SCOPES_LOGIN',
  pages: 'META_APPROVED_OAUTH_SCOPES_PAGES',
  catalog: 'META_APPROVED_OAUTH_SCOPES_CATALOG',
  instagram: 'META_APPROVED_OAUTH_SCOPES_INSTAGRAM',
  marketing: 'META_APPROVED_OAUTH_SCOPES_MARKETING',
  whatsapp: 'META_APPROVED_OAUTH_SCOPES_WHATSAPP',
};

export const META_OAUTH_FLOWS: Record<
  Exclude<MetaOAuthFlowKey, 'ads'>,
  MetaOAuthFlowDefinition
> = {
  login: {
    key: 'login',
    label: 'Facebook Login',
    description: 'Registrace a přihlášení uživatele (Login App)',
    scopes: FACEBOOK_LOGIN_SCOPES.split(','),
    sessionMode: 'meta_center_login',
    usesLoginApp: true,
    usesPagesApp: false,
    usesMarketingApp: false,
    oauthPath: '/api/social/facebook/oauth/login',
    envVarKey: META_OAUTH_FLOW_ENV_KEYS.login,
  },
  pages: {
    key: 'pages',
    label: 'Facebook stránky',
    description: 'Výběr stránky, publikování a metadata',
    scopes: pagesScopes,
    sessionMode: 'meta_center_pages',
    usesLoginApp: false,
    usesPagesApp: true,
    usesMarketingApp: false,
    oauthPath: '/api/social/facebook/oauth/pages',
    envVarKey: META_OAUTH_FLOW_ENV_KEYS.pages,
  },
  catalog: {
    key: 'catalog',
    label: 'Commerce / Catalog',
    description: 'Business Manager a Commerce Manager (bez scope catalog_management)',
    scopes: ['business_management'],
    sessionMode: 'meta_center_catalog',
    usesLoginApp: false,
    usesPagesApp: true,
    usesMarketingApp: false,
    oauthPath: '/api/social/facebook/oauth/catalog',
    envVarKey: META_OAUTH_FLOW_ENV_KEYS.catalog,
  },
  instagram: {
    key: 'instagram',
    label: 'Instagram',
    description: 'Instagram Business účet a zprávy',
    scopes: ['instagram_basic', 'instagram_manage_messages'],
    sessionMode: 'meta_center_instagram',
    usesLoginApp: false,
    usesPagesApp: true,
    usesMarketingApp: false,
    oauthPath: '/api/social/facebook/oauth/instagram',
    envVarKey: META_OAUTH_FLOW_ENV_KEYS.instagram,
  },
  whatsapp: {
    key: 'whatsapp',
    label: 'WhatsApp Business',
    description: 'WhatsApp Business API',
    scopes: ['whatsapp_business_management', 'whatsapp_business_messaging'],
    sessionMode: 'meta_center_whatsapp',
    usesLoginApp: false,
    usesPagesApp: true,
    usesMarketingApp: false,
    oauthPath: '/api/social/facebook/oauth/whatsapp',
    envVarKey: META_OAUTH_FLOW_ENV_KEYS.whatsapp,
    hiddenInMetaCenterOAuth: true,
  },
  marketing: {
    key: 'marketing',
    label: 'Marketing / Ads',
    description: 'Reklamní účet, statistiky a Business Manager',
    scopes: marketingScopes,
    sessionMode: 'meta_center_marketing',
    usesLoginApp: false,
    usesPagesApp: false,
    usesMarketingApp: true,
    oauthPath: '/api/social/facebook/oauth/marketing',
    envVarKey: META_OAUTH_FLOW_ENV_KEYS.marketing,
  },
};

export const META_CENTER_SESSION_MODES = [
  'meta_center_connect',
  'meta_center_login',
  'meta_center_pages',
  'meta_center_catalog',
  'meta_center_instagram',
  'meta_center_whatsapp',
  'meta_center_marketing',
  'meta_center_ads',
] as const;

export const META_CENTER_DEFAULT_FLOW: MetaOAuthFlowKey = 'pages';

export const META_CATALOG_MGMT_NOT_REQUIRED_MESSAGE =
  'catalog_management není v této Meta aplikaci vyžadován. Katalog se spravuje přes Business Manager / Commerce Manager.';

export const META_CATALOG_VIA_BM_MESSAGE =
  'Catalog je řízen přes Business Manager / Commerce Manager. OAuth scope catalog_management není vyžadován.';

/** @deprecated catalog_management už není vyžadován */
export const META_CATALOG_SCOPE_REVIEW_MESSAGE = META_CATALOG_MGMT_NOT_REQUIRED_MESSAGE;

export function normalizeMetaOAuthFlowKey(
  key: string | undefined | null,
): Exclude<MetaOAuthFlowKey, 'ads'> | null {
  if (!key?.trim()) return null;
  const normalized = key.trim().toLowerCase();
  if (normalized === 'ads') return 'marketing';
  return normalized in META_OAUTH_FLOWS
    ? (normalized as Exclude<MetaOAuthFlowKey, 'ads'>)
    : null;
}

export function isMetaCenterSessionMode(mode: string): boolean {
  return (META_CENTER_SESSION_MODES as readonly string[]).includes(mode);
}

export function resolveMetaOAuthFlow(key: string | undefined | null): MetaOAuthFlowKey | null {
  const normalized = normalizeMetaOAuthFlowKey(key);
  return normalized;
}

export function parseFlowFromOAuthState(state: string): Exclude<MetaOAuthFlowKey, 'ads'> {
  const withoutPrefix = state.startsWith('x') ? state.slice(1) : state;
  if (withoutPrefix.startsWith('preview_')) {
    const rest = withoutPrefix.slice('preview_'.length);
    const idx = rest.indexOf('_');
    const part = idx > 0 ? rest.slice(0, idx) : rest;
    return normalizeMetaOAuthFlowKey(part) ?? 'pages';
  }
  const idx = withoutPrefix.indexOf('_');
  const part = idx > 0 ? withoutPrefix.slice(0, idx) : withoutPrefix;
  return normalizeMetaOAuthFlowKey(part) ?? 'pages';
}

export function scopesForFlow(flow: MetaOAuthFlowKey): string {
  const key = normalizeMetaOAuthFlowKey(flow) ?? 'pages';
  return META_OAUTH_FLOWS[key].scopes.join(',');
}

export function getMetaOAuthFlowDefinition(
  flow: MetaOAuthFlowKey,
): MetaOAuthFlowDefinition {
  const key = normalizeMetaOAuthFlowKey(flow) ?? 'pages';
  return META_OAUTH_FLOWS[key];
}
