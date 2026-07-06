import type { MetaGraphResult } from './meta-graph-client.service';

export type MetaGraphIssueKind =
  | 'ok'
  | 'api_error'
  | 'missing_permission'
  | 'catalog_not_found'
  | 'business_no_catalog'
  | 'catalog_not_in_app'
  | 'not_configured';

export type MetaScopeGrantStatus = {
  scope: string;
  granted: boolean;
};

export const META_EXTERNAL_LINKS = {
  developersApps: 'https://developers.facebook.com/apps/',
  commerceManager: 'https://business.facebook.com/commerce/',
  catalogs: 'https://business.facebook.com/settings/catalogs',
} as const;

export const META_PERMISSION_WARNING_CATALOG =
  'Meta aplikace nemá oprávnění catalog_management. Přidejte oprávnění do Meta App nebo přidejte katalog do aplikace.';

export const META_REQUIRED_GRAPH_SCOPES = [
  'business_management',
  'catalog_management',
  'pages_show_list',
  'pages_manage_metadata',
  'pages_read_engagement',
  'pages_manage_posts',
  'instagram_basic',
  'instagram_manage_insights',
  'whatsapp_business_management',
  'whatsapp_business_messaging',
] as const;

const ISSUE_MESSAGES: Record<Exclude<MetaGraphIssueKind, 'ok'>, string> = {
  api_error: 'Graph API neodpovídá nebo vrátila neočekávanou chybu.',
  missing_permission: META_PERMISSION_WARNING_CATALOG,
  catalog_not_found: 'Katalog neexistuje nebo není dostupný přes Graph API.',
  business_no_catalog: 'Business Manager nemá žádný product catalog.',
  catalog_not_in_app: 'Katalog není připojen do Meta aplikace.',
  not_configured: 'Chybí konfigurace (Business ID, Catalog ID nebo access token).',
};

export function issueMessage(kind: MetaGraphIssueKind): string {
  if (kind === 'ok') return '';
  return ISSUE_MESSAGES[kind];
}

export function isPermissionGraphError(
  errType: string,
  errCode: number | undefined,
  errMsg: string,
): boolean {
  return (
    errCode === 200 ||
    errCode === 10 ||
    errType === 'OAuthException' ||
    errType === 'GraphMethodException' ||
    /permission|not authorized|does not have/i.test(errMsg)
  );
}

export function isUnsupportedGetRequest(errMsg: string): boolean {
  return /unsupported get request/i.test(errMsg);
}

export function classifyGraphFailure(
  res: MetaGraphResult<unknown>,
  endpoint: string,
  scopes: string[],
): { kind: MetaGraphIssueKind; message: string; technicalDetail: string | null } {
  if (res.ok) {
    return { kind: 'ok', message: '', technicalDetail: null };
  }

  const err = (
    res.data as {
      error?: {
        message?: string;
        code?: number;
        type?: string;
        error_subcode?: number;
        fbtrace_id?: string;
      };
    } | null
  )?.error;
  const errType = err?.type ?? '';
  const errCode = err?.code;
  const errMsg = err?.message ?? res.errorMessage;

  if (isPermissionGraphError(errType, errCode, errMsg)) {
    const missingCatalog = !scopes.includes('catalog_management');
    const missingBusiness = !scopes.includes('business_management');
    let message = META_PERMISSION_WARNING_CATALOG;
    if (missingBusiness && !missingCatalog) {
      message =
        'Meta aplikace nemá oprávnění business_management. Přidejte oprávnění do Meta App.';
    } else if (missingCatalog && missingBusiness) {
      message =
        'Meta aplikace nemá oprávnění catalog_management nebo business_management. Přidejte oprávnění do Meta App nebo přidejte katalog do aplikace.';
    }
    return {
      kind: 'missing_permission',
      message,
      technicalDetail: `${errType || 'GraphAPI'}${errCode != null ? ` #${errCode}` : ''}: ${errMsg} · GET ${endpoint}`,
    };
  }

  if (isUnsupportedGetRequest(errMsg)) {
    return {
      kind: 'catalog_not_found',
      message: issueMessage('catalog_not_found'),
      technicalDetail: `GET ${endpoint}: ${errMsg}`,
    };
  }

  try {
    return {
      kind: 'api_error',
      message: issueMessage('api_error'),
      technicalDetail: JSON.stringify({
        endpoint: `GET ${endpoint}`,
        type: errType || null,
        code: errCode ?? null,
        message: errMsg,
        subcode: err?.error_subcode ?? null,
        fbtrace_id: err?.fbtrace_id ?? null,
      }),
    };
  } catch {
    return {
      kind: 'api_error',
      message: issueMessage('api_error'),
      technicalDetail: `${errType || 'GraphAPI'} @ GET ${endpoint}: ${errMsg}`,
    };
  }
}

export function classifyMissingScopes(scopes: string[]): MetaGraphIssueKind {
  const needsCatalog = !scopes.includes('catalog_management');
  const needsBusiness = !scopes.includes('business_management');
  if (needsCatalog || needsBusiness) return 'missing_permission';
  return 'ok';
}

export function buildScopeGrantList(grantedScopes: string[]): MetaScopeGrantStatus[] {
  const granted = new Set(grantedScopes);
  return META_REQUIRED_GRAPH_SCOPES.map((scope) => ({
    scope,
    granted: granted.has(scope),
  }));
}

export function diagnosticLevelFromIssue(
  online: boolean,
  kind: MetaGraphIssueKind,
): 'ok' | 'warning' | 'error' {
  if (online) return 'ok';
  if (
    kind === 'missing_permission' ||
    kind === 'not_configured' ||
    kind === 'business_no_catalog' ||
    kind === 'catalog_not_in_app' ||
    kind === 'catalog_not_found'
  ) {
    return 'warning';
  }
  return 'error';
}

export function hasPermissionWarning(
  commerceKind: MetaGraphIssueKind,
  catalogKind: MetaGraphIssueKind,
): boolean {
  return commerceKind === 'missing_permission' || catalogKind === 'missing_permission';
}
