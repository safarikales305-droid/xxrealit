import { PortalWorkerStatus, ProfessionalVerificationStatus, UserRole } from '@prisma/client';
import { isUserPublicProfileEnabled } from './user-public-profile.util';

/** Role zobrazitelné ve veřejném katalogu profesionálů. */
export const PROFESSIONAL_PUBLIC_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.AGENT,
  UserRole.AGENCY,
  UserRole.COMPANY,
  UserRole.CRAFTSMAN,
  UserRole.FINANCIAL_ADVISOR,
  UserRole.INVESTOR,
  UserRole.PORTAL_WORKER,
]);

export type PublicVisibilityUser = {
  role: UserRole;
  publicProfile?: boolean | null;
  canPublishPosts?: boolean | null;
  showInProfessionals?: boolean | null;
  publicProfessionalProfile?: boolean | null;
  isPublicBrokerProfile?: boolean | null;
  accountLimited?: boolean | null;
  portalWorkerStatus?: PortalWorkerStatus | null;
  professionalVerified?: boolean | null;
  professionalVerificationStatus?: ProfessionalVerificationStatus | null;
};

export function isAccountPubliclyAccessible(
  user: Pick<PublicVisibilityUser, 'accountLimited'>,
): boolean {
  return user.accountLimited !== true;
}

export function isPortalWorkerApproved(
  user: Pick<PublicVisibilityUser, 'role' | 'portalWorkerStatus'>,
): boolean {
  if (user.role !== UserRole.PORTAL_WORKER) return true;
  return user.portalWorkerStatus === PortalWorkerStatus.APPROVED;
}

/** Veřejná stránka profilu (/profile/{id}). */
export function isUserPublicProfilePageVisible(user: PublicVisibilityUser): boolean {
  if (!isAccountPubliclyAccessible(user)) return false;
  if (!isPortalWorkerApproved(user)) return false;
  return isUserPublicProfileEnabled(user);
}

/** Autor může vytvářet veřejné příspěvky. */
export function canUserPublishPosts(user: PublicVisibilityUser): boolean {
  if (!isUserPublicProfilePageVisible(user)) return false;
  return user.canPublishPosts === true;
}

/** Příspěvky autora ve feedu Příspěvky. */
export function isCommunityPostAuthorVisible(user: PublicVisibilityUser): boolean {
  return canUserPublishPosts(user);
}

/** Katalog Profesionálové / sidebar. */
export function shouldShowUserInProfessionals(user: PublicVisibilityUser): boolean {
  if (!isAccountPubliclyAccessible(user)) return false;
  if (!PROFESSIONAL_PUBLIC_ROLES.has(user.role)) return false;
  if (!isPortalWorkerApproved(user)) return false;
  if (user.showInProfessionals === true) return true;
  if (user.role === UserRole.PORTAL_WORKER) {
    return isUserPublicProfileEnabled(user);
  }
  return (
    user.publicProfessionalProfile === true || user.isPublicBrokerProfile === true
  );
}

export function isProfessionalRoleForDirectory(role: UserRole): boolean {
  return PROFESSIONAL_PUBLIC_ROLES.has(role);
}
