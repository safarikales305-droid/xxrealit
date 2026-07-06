import { getAppOrigin } from '@/lib/app-url';

/** Meta Centrum OAuth callback — musí odpovídat BACKEND_URL + /api/social/facebook/meta-connect-callback */
export function getFacebookMetaConnectCallbackUrl(): string {
  const apiBase =
    process.env.BACKEND_URL?.trim().replace(/\/+$/, '') ||
    process.env.API_URL?.trim().replace(/\/+$/, '') ||
    process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/+$/, '') ||
    '';
  if (apiBase) {
    const withApi = apiBase.endsWith('/api') ? apiBase : `${apiBase}/api`;
    return `${withApi}/social/facebook/meta-connect-callback`;
  }
  return `${getAppOrigin()}/api/social/facebook/meta-connect-callback`;
}

export function getFacebookSharedOAuthCallbackUrl(): string {
  return getFacebookMetaConnectCallbackUrl();
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
