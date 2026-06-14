import { API_BASE_URL } from '@/lib/api';

export type PublicRegistrationGateSettings = {
  shortsGateEnabled: boolean;
  shortsGateAfterViews: number;
  gateType: string;
  title: string;
  description: string;
  buttonText: string;
  videoUrl: string | null;
  bannerImageUrl: string | null;
  skipAfterSeconds: number;
};

export type RegistrationGateAdminSettings = PublicRegistrationGateSettings & {
  id: string;
  requireFirstContent: boolean;
  createdAt: string;
  updatedAt: string;
};

export function isPathAllowedForFirstContent(pathname: string): boolean {
  const p = pathname.toLowerCase();
  const allowedPrefixes = [
    '/onboarding',
    '/inzerat',
    '/profil/tipy',
    '/login',
    '/prihlaseni',
    '/registrace',
    '/privacy',
    '/privacy-policy',
    '/terms',
    '/data-deletion',
  ];
  return allowedPrefixes.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

export async function fetchRegistrationGateSettings(): Promise<PublicRegistrationGateSettings | null> {
  if (!API_BASE_URL) return null;
  const base = API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
  try {
    const res = await fetch(`${base}/registration-gate/settings`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as PublicRegistrationGateSettings | null;
    if (!data?.shortsGateEnabled) return null;
    return data;
  } catch {
    return null;
  }
}
