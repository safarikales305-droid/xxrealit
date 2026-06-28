import { buildAbsoluteSiteUrl } from './site-origin';

export const PROPERTY_SEEKER_SHARE_REQUIRED = 5;

export const PROPERTY_SEEKER_PORTAL_HOME = '/?tab=shorts';

const PROPERTY_SEEKER_SHARE_MESSAGE_PREFIX =
  'Ahoj, našel jsem realitní portál XXrealit.cz – můžeš sledovat inzeráty jako Shorts videa, klasické nabídky i příspěvky makléřů. Mrkni na to:';

/** Dynamická URL portálu z env / aktuálního originu (ne hardcoded www). */
export function getPropertySeekerShareMessage(): string {
  return `${PROPERTY_SEEKER_SHARE_MESSAGE_PREFIX} ${buildAbsoluteSiteUrl('/')}`;
}

/** @deprecated Preferujte getPropertySeekerShareMessage() — zachováno pro kompatibilitu. */
export const PROPERTY_SEEKER_SHARE_MESSAGE = getPropertySeekerShareMessage();

export type PropertySeekerMe = {
  whatsappVerified?: boolean;
  shareCount?: number;
  shareCompletedAt?: string | null;
};

export function propertySeekerOnboardingComplete(me: PropertySeekerMe): boolean {
  if (me.shareCompletedAt) return Boolean(me.whatsappVerified);
  return (
    Boolean(me.whatsappVerified) &&
    (me.shareCount ?? 0) >= PROPERTY_SEEKER_SHARE_REQUIRED
  );
}

const ONBOARDING_PATHS = [
  '/registrace/hledam-nemovitost',
  '/registrace/overeni-whatsapp',
  '/registrace/sdileni',
] as const;

const BLOCKED_AFTER_ONBOARDING = [
  '/moje-inzeraty',
  '/inzerat/novy',
  '/vlozit',
  '/create',
  '/kredity',
  '/tipar',
  '/pracovnik',
  '/dashboard',
] as const;

function isOnboardingPath(pathname: string): boolean {
  return ONBOARDING_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isBlockedWritePath(pathname: string): boolean {
  return BLOCKED_AFTER_ONBOARDING.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export function shouldRedirectPropertySeeker(
  role: string | undefined | null,
  me: PropertySeekerMe | null,
  pathname: string,
): string | null {
  if (role !== 'PROPERTY_SEEKER') return null;
  const p = pathname.split('?')[0] ?? pathname;
  if (p.startsWith('/api')) return null;
  if (p === '/login' || p === '/logout') return null;

  if (!me?.whatsappVerified) {
    return p.startsWith('/registrace/overeni-whatsapp') ? null : '/registrace/overeni-whatsapp';
  }

  if (!propertySeekerOnboardingComplete(me ?? {})) {
    if (p.startsWith('/registrace/sdileni') || p.startsWith('/registrace/overeni-whatsapp')) {
      return null;
    }
    return '/registrace/sdileni';
  }

  if (isOnboardingPath(p) || p.startsWith('/onboarding')) {
    return PROPERTY_SEEKER_PORTAL_HOME;
  }
  if (isBlockedWritePath(p)) return PROPERTY_SEEKER_PORTAL_HOME;
  return null;
}
