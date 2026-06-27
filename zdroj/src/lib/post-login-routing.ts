import { portalWorkerHomePath, type PortalWorkerStatus } from '@/lib/portal-worker-routing';

/**
 * Role, které nesmí projít onboardingem „Vložit inzerát / Vložit tip“.
 * Odpovídá Prisma enum UserRole — WORKER/EMPLOYEE/STAFF/MODERATOR v projektu neexistují.
 */
export const FIRST_CONTENT_ONBOARDING_EXEMPT_ROLES = [
  'ADMIN',
  'PORTAL_WORKER',
  'PROPERTY_SEEKER',
] as const;

export function isExemptFromFirstContentOnboarding(role: string | undefined | null): boolean {
  if (!role) return false;
  return (FIRST_CONTENT_ONBOARDING_EXEMPT_ROLES as readonly string[]).includes(role);
}

/** Cílová stránka po přihlášení pro interní / pracovní role. */
export function postLoginHomePath(
  role: string,
  portalWorkerStatus?: PortalWorkerStatus,
): string {
  if (role === 'ADMIN') return '/admin';
  if (role === 'PORTAL_WORKER') return portalWorkerHomePath(portalWorkerStatus);
  if (role === 'PROPERTY_SEEKER') return '/?tab=shorts';
  return '/';
}

type MeShape = {
  role?: string;
  portalWorkerStatus?: PortalWorkerStatus;
};

/** Načte /auth/me — pro interní role vrátí pracovní cestu, jinak null. */
export async function fetchInternalRoleLoginPath(meUrl = '/api/auth/me'): Promise<string | null> {
  try {
    const res = await fetch(meUrl, { credentials: 'include', cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { user?: MeShape } & MeShape;
    const user = data.user ?? data;
    const role = typeof user.role === 'string' ? user.role : '';
    if (!role || !isExemptFromFirstContentOnboarding(role)) return null;
    return postLoginHomePath(role, user.portalWorkerStatus);
  } catch {
    return null;
  }
}
