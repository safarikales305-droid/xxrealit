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

export const PROFESSIONAL_PUBLIC_ROLES_LIST: UserRole[] = [...PROFESSIONAL_PUBLIC_ROLES];

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

/** Admin ručně skryl z katalogu / carouselu. */
export function isExplicitlyHiddenFromPublic(
  user: Pick<PublicVisibilityUser, 'showInProfessionals'>,
): boolean {
  return user.showInProfessionals === false;
}

/** Veřejná stránka profilu (/profile/{id}). */
export function isUserPublicProfilePageVisible(user: PublicVisibilityUser): boolean {
  if (!isAccountPubliclyAccessible(user)) return false;
  if (!isPortalWorkerApproved(user)) return false;
  return isUserPublicProfileEnabled(user);
}

/** Autor může vytvářet nové veřejné příspěvky. */
export function canUserPublishPosts(user: PublicVisibilityUser): boolean {
  if (!isUserPublicProfilePageVisible(user)) return false;
  return user.canPublishPosts === true;
}

/** Příspěvky autora ve feedu Příspěvky (zobrazení, ne vytváření). */
export function isCommunityPostAuthorVisible(user: PublicVisibilityUser): boolean {
  if (!isAccountPubliclyAccessible(user)) return false;
  if (!isPortalWorkerApproved(user)) return false;
  if (!PROFESSIONAL_PUBLIC_ROLES.has(user.role)) return false;
  return isUserPublicProfileEnabled(user);
}

/** Katalog Profesionálové / sidebar / carousel Profily na portálu. */
export function shouldShowUserInProfessionals(user: PublicVisibilityUser): boolean {
  if (!isAccountPubliclyAccessible(user)) return false;
  if (!PROFESSIONAL_PUBLIC_ROLES.has(user.role)) return false;
  if (!isPortalWorkerApproved(user)) return false;
  if (isExplicitlyHiddenFromPublic(user)) return false;

  if (user.role === UserRole.PORTAL_WORKER) {
    return isUserPublicProfileEnabled(user);
  }

  return (
    isUserPublicProfileEnabled(user) ||
    user.publicProfessionalProfile === true ||
    user.isPublicBrokerProfile === true
  );
}

/** Alias — stejná pravidla jako katalog profesionálů. */
export const shouldShowUserInPortalCarousel = shouldShowUserInProfessionals;

export function isProfessionalRoleForDirectory(role: UserRole): boolean {
  return PROFESSIONAL_PUBLIC_ROLES.has(role);
}
