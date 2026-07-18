export const META_MARKETING_OAUTH_REAUTH_MESSAGE_CS =
  'Marketing OAuth je potřeba znovu autorizovat.';

export const MARKETING_OAUTH_KEY_SCOPES = [
  'ads_management',
  'business_management',
  'pages_manage_ads',
  'pages_read_engagement',
] as const;

export type MarketingOAuthPermissionRow = {
  permission: string;
  status: string;
};

export type MarketingOAuthTokenDebug = {
  is_valid: boolean;
  expires_at: number | null;
  scopes: string[];
  user_id: string | null;
  app_id: string | null;
};

export type MarketingOAuthPostConnectAttempt = {
  draftId: string;
  draftName: string;
  preflightOk: boolean;
  preflightMessage: string;
  adOk: boolean;
  adMessage: string;
};

export type MarketingOAuthStatus = {
  fetchedAt: string;
  trigger: string | null;
  userId: string | null;
  userName: string | null;
  tokenExpiresAt: string | null;
  tokenIsValid: boolean;
  needsReauthorization: boolean;
  reauthorizationMessage: string | null;
  grantedPermissions: string[];
  allPermissions: MarketingOAuthPermissionRow[];
  debugScopes: string[];
  hasAdsManagement: boolean;
  hasBusinessManagement: boolean;
  hasPagesManageAds: boolean;
  hasPagesReadEngagement: boolean;
  tokenDebug: MarketingOAuthTokenDebug | null;
  postConnect: { attempts: MarketingOAuthPostConnectAttempt[] } | null;
};

export function buildMarketingOAuthStatus(input: {
  trigger?: string | null;
  userId?: string | null;
  userName?: string | null;
  tokenExpiresAt?: Date | string | null;
  grantedPermissions?: string[];
  allPermissions?: MarketingOAuthPermissionRow[];
  tokenDebug?: MarketingOAuthTokenDebug | null;
  postConnect?: { attempts: MarketingOAuthPostConnectAttempt[] } | null;
}): MarketingOAuthStatus {
  const granted = [...new Set((input.grantedPermissions ?? []).map((s) => s.trim()).filter(Boolean))];
  const debugScopes = [...new Set((input.tokenDebug?.scopes ?? []).map((s) => s.trim()).filter(Boolean))];
  const expiresAt =
    input.tokenExpiresAt instanceof Date
      ? input.tokenExpiresAt
      : input.tokenExpiresAt
        ? new Date(input.tokenExpiresAt)
        : input.tokenDebug?.expires_at
          ? new Date(input.tokenDebug.expires_at * 1000)
          : null;
  const tokenIsValid = input.tokenDebug?.is_valid !== false;
  const expired = expiresAt ? expiresAt.getTime() <= Date.now() : false;
  const hasAdsManagement = granted.includes('ads_management') || debugScopes.includes('ads_management');
  const needsReauthorization = !tokenIsValid || expired || !hasAdsManagement;

  return {
    fetchedAt: new Date().toISOString(),
    trigger: input.trigger ?? null,
    userId: input.userId ?? input.tokenDebug?.user_id ?? null,
    userName: input.userName ?? null,
    tokenExpiresAt: expiresAt ? expiresAt.toISOString() : null,
    tokenIsValid,
    needsReauthorization,
    reauthorizationMessage: needsReauthorization ? META_MARKETING_OAUTH_REAUTH_MESSAGE_CS : null,
    grantedPermissions: granted,
    allPermissions: input.allPermissions ?? [],
    debugScopes,
    hasAdsManagement,
    hasBusinessManagement:
      granted.includes('business_management') || debugScopes.includes('business_management'),
    hasPagesManageAds: granted.includes('pages_manage_ads') || debugScopes.includes('pages_manage_ads'),
    hasPagesReadEngagement:
      granted.includes('pages_read_engagement') || debugScopes.includes('pages_read_engagement'),
    tokenDebug: input.tokenDebug ?? null,
    postConnect: input.postConnect ?? null,
  };
}
