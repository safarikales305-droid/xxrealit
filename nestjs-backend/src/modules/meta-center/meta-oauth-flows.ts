import { FACEBOOK_LOGIN_SCOPES } from '../social/facebook/facebook-page.constants';

/** Samostatné Meta OAuth toky — každý žádá pouze potřebná oprávnění. */
export type MetaOAuthFlowKey =
  | 'login'
  | 'pages'
  | 'catalog'
  | 'instagram'
  | 'whatsapp'
  | 'ads';

export type MetaOAuthFlowDefinition = {
  key: MetaOAuthFlowKey;
  label: string;
  description: string;
  scopes: readonly string[];
  sessionMode: string;
  usesLoginApp: boolean;
  usesPagesApp: boolean;
};

const pagesScopes = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'pages_manage_metadata',
] as const;

export const META_OAUTH_FLOWS: Record<MetaOAuthFlowKey, MetaOAuthFlowDefinition> = {
  login: {
    key: 'login',
    label: 'Facebook Login',
    description: 'Registrace a přihlášení uživatele',
    scopes: FACEBOOK_LOGIN_SCOPES.split(','),
    sessionMode: 'login',
    usesLoginApp: true,
    usesPagesApp: false,
  },
  pages: {
    key: 'pages',
    label: 'Facebook stránky',
    description: 'Výběr stránky, publikování a metadata (Meta Centrum základ)',
    scopes: pagesScopes,
    sessionMode: 'meta_center_pages',
    usesLoginApp: false,
    usesPagesApp: true,
  },
  catalog: {
    key: 'catalog',
    label: 'Commerce / Catalog',
    description: 'Správa produktového katalogu (pouze při propojení Commerce)',
    scopes: ['business_management', 'catalog_management'],
    sessionMode: 'meta_center_catalog',
    usesLoginApp: false,
    usesPagesApp: true,
  },
  instagram: {
    key: 'instagram',
    label: 'Instagram',
    description: 'Instagram Business účet a zprávy',
    scopes: ['instagram_basic', 'instagram_manage_messages'],
    sessionMode: 'meta_center_instagram',
    usesLoginApp: false,
    usesPagesApp: true,
  },
  whatsapp: {
    key: 'whatsapp',
    label: 'WhatsApp Business',
    description: 'WhatsApp Business API',
    scopes: ['whatsapp_business_management', 'whatsapp_business_messaging'],
    sessionMode: 'meta_center_whatsapp',
    usesLoginApp: false,
    usesPagesApp: true,
  },
  ads: {
    key: 'ads',
    label: 'Reklamní účet',
    description: 'Správa reklam a čtení statistik',
    scopes: ['ads_management', 'ads_read'],
    sessionMode: 'meta_center_ads',
    usesLoginApp: false,
    usesPagesApp: true,
  },
};

export const META_CENTER_SESSION_MODES = [
  'meta_center_connect',
  'meta_center_pages',
  'meta_center_catalog',
  'meta_center_instagram',
  'meta_center_whatsapp',
  'meta_center_ads',
] as const;

export const META_CENTER_DEFAULT_FLOW: MetaOAuthFlowKey = 'pages';

export function isMetaCenterSessionMode(mode: string): boolean {
  return (META_CENTER_SESSION_MODES as readonly string[]).includes(mode);
}

export function resolveMetaOAuthFlow(key: string | undefined | null): MetaOAuthFlowKey | null {
  if (!key?.trim()) return null;
  const normalized = key.trim().toLowerCase() as MetaOAuthFlowKey;
  return normalized in META_OAUTH_FLOWS ? normalized : null;
}

export function scopesForFlow(flow: MetaOAuthFlowKey): string {
  return META_OAUTH_FLOWS[flow].scopes.join(',');
}

export function listMetaOAuthFlowDiagnostics() {
  return Object.values(META_OAUTH_FLOWS).map((flow) => ({
    key: flow.key,
    label: flow.label,
    description: flow.description,
    scopes: [...flow.scopes],
    scopeString: flow.scopes.join(','),
    usesLoginApp: flow.usesLoginApp,
    usesPagesApp: flow.usesPagesApp,
    sessionMode: flow.sessionMode,
  }));
}
