import { API_BASE_URL } from '@/lib/api';

export type PortalTermsVersion = {
  id: string;
  version: number;
  title: string;
  termsHtml: string;
  rulesHtml: string;
  operatorContact: string;
  isPublished: boolean;
  requireReacceptOnLogin: boolean;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  createdBy?: { id: string; name: string | null; email: string } | null;
};

function apiBase(): string | null {
  if (!API_BASE_URL) return null;
  return API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
}

export async function fetchCurrentPortalTerms(): Promise<PortalTermsVersion | null> {
  const base = apiBase();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/portal-terms/current`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json().catch(() => null)) as PortalTermsVersion | null;
  } catch {
    return null;
  }
}

export function isPathAllowedForTermsReaccept(pathname: string): boolean {
  const p = pathname.toLowerCase();
  const allowed = [
    '/souhlas-s-podminkami',
    '/obchodni-podminky',
    '/login',
    '/prihlaseni',
    '/logout',
    '/api',
    '/nemovitost',
    '/nemovitosti',
    '/shorts',
    '/prispevky',
    '/tipy',
    '/o-portalu',
    '/privacy',
    '/privacy-policy',
    '/terms',
  ];
  return allowed.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}
