import { getAppOrigin } from '@/lib/app-url';

/**
 * @deprecated Redirect URI pro Meta Centrum vždy řeší backend přes getMetaRedirectUri().
 * Pro diagnostiku použijte Meta Centrum → META OAuth kontrola.
 */
export function getFacebookMetaConnectCallbackUrl(): string {
  return `${getAppOrigin()}/api/social/facebook/meta-connect-callback`;
}

export function getFacebookSharedOAuthCallbackUrl(): string {
  return `${getAppOrigin()}/api/social/facebook/callback`;
}

/** Veřejná OAuth callback URL na frontend doméně (proxy na Nest). */
export function getFacebookLoginCallbackUrl(): string {
  return `${getAppOrigin()}/api/auth/facebook/callback`;
}

export function getFacebookPageCallbackUrl(): string {
  return `${getAppOrigin()}/api/social/facebook/page-callback`;
}

export function getSocialIntegrationsUrl(): string {
  return `${getAppOrigin()}/profil/dashboard?tab=social-integrations`;
}

export function getFacebookLoginErrorUrl(reason?: string): string {
  const base = `${getAppOrigin()}/login?facebook=error`;
  if (!reason?.trim()) return base;
  return `${base}&reason=${encodeURIComponent(reason.trim().slice(0, 120))}`;
}

export function getFacebookLoginSuccessUrl(): string {
  return `${getAppOrigin()}/login?facebook=success`;
}

export function getFacebookConnectedDashboardUrl(): string {
  return getFacebookLoginSuccessUrl();
}

export function getMetaFacebookLoginSettingsUrl(appId: string): string {
  return `https://developers.facebook.com/apps/${appId}/fb-login/settings/`;
}
