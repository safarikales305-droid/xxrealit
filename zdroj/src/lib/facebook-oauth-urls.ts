import { getAppOrigin } from '@/lib/app-url';

/** Jediná kanonická Meta / Facebook OAuth callback URL. */
export function getFacebookMetaConnectCallbackUrl(): string {
  return `${getAppOrigin()}/api/social/facebook/meta-connect-callback`;
}

/** @deprecated Použijte getFacebookMetaConnectCallbackUrl() */
export function getFacebookSharedOAuthCallbackUrl(): string {
  return getFacebookMetaConnectCallbackUrl();
}

/** @deprecated Použijte getFacebookMetaConnectCallbackUrl() */
export function getFacebookLoginCallbackUrl(): string {
  return getFacebookMetaConnectCallbackUrl();
}

/** @deprecated Použijte getFacebookMetaConnectCallbackUrl() */
export function getFacebookPageCallbackUrl(): string {
  return getFacebookMetaConnectCallbackUrl();
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

/** 301 přesměrování na kanonický OAuth callback (zachová query). */
export function buildLegacyOAuthCallbackRedirect(
  requestUrl: string,
  searchParams: URLSearchParams,
): URL {
  const target = new URL('/api/social/facebook/meta-connect-callback', requestUrl);
  searchParams.forEach((value, key) => {
    target.searchParams.set(key, value);
  });
  return target;
}
