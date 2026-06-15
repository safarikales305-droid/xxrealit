import { getAppOrigin } from '@/lib/app-url';

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

export function getFacebookConnectedDashboardUrl(): string {
  return `${getAppOrigin()}/profil/dashboard?facebook=connected`;
}
