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
    '/obchodni-podminky',
    '/o-portalu',
    '/data-deletion',
    '/nemovitost',
    '/nemovitosti',
    '/shorts',
    '/prispevky',
    '/tipy',
  ];
  return allowedPrefixes.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

export function isPathAllowedForRegistrationRequirements(pathname: string): boolean {
  const p = pathname.toLowerCase();
  const allowedPrefixes = [
    '/onboarding',
    '/inzerat',
    '/profil',
    '/login',
    '/prihlaseni',
    '/registrace',
    '/privacy',
    '/privacy-policy',
    '/terms',
    '/obchodni-podminky',
    '/o-portalu',
    '/data-deletion',
    '/nemovitost',
    '/nemovitosti',
    '/shorts',
    '/prispevky',
    '/tipy',
  ];
  return allowedPrefixes.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

export async function fetchRegistrationGateSettings(): Promise<PublicRegistrationGateSettings | null> {
  const data = await fetchRegistrationGateSettingsRaw();
  if (!data?.shortsGateEnabled) return null;
  return data;
}

/** Veřejná nastavení výzvy — bez kontroly shortsGateEnabled (login/registrace). */
export async function fetchRegistrationGateSettingsRaw(): Promise<PublicRegistrationGateSettings | null> {
  if (!API_BASE_URL) return null;
  const base = API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
  try {
    const res = await fetch(`${base}/registration-gate/settings`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json().catch(() => null)) as PublicRegistrationGateSettings | null;
  } catch {
    return null;
  }
}

export const AUTH_PORTAL_GATE_COPY = {
  title: 'Registrujte se na portálu XXRealit',
  description:
    'Sledujte příspěvky, videa, inzeráty a profesionály. Přihlaste se nebo si vytvořte účet zdarma.',
  buttonText: 'Registrovat',
} as const;

export function buildAuthPortalGateSettings(
  base: PublicRegistrationGateSettings | null,
): PublicRegistrationGateSettings {
  const videoUrl = base?.videoUrl ?? null;
  return {
    shortsGateEnabled: true,
    shortsGateAfterViews: base?.shortsGateAfterViews ?? 4,
    gateType: videoUrl ? 'VIDEO' : (base?.gateType ?? 'BANNER'),
    title: AUTH_PORTAL_GATE_COPY.title,
    description: AUTH_PORTAL_GATE_COPY.description,
    buttonText: AUTH_PORTAL_GATE_COPY.buttonText,
    videoUrl,
    bannerImageUrl: base?.bannerImageUrl ?? null,
    skipAfterSeconds: base?.skipAfterSeconds ?? 5,
  };
}
