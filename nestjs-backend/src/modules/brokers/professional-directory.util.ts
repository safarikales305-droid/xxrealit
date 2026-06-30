import {
  AgentVerificationStatus,
  PortalWorkerStatus,
  ProfessionalVerificationStatus,
  UserRole,
} from '@prisma/client';
import {
  shouldShowUserInProfessionals,
} from '../../common/public-visibility.util';
import {
  isProfessionalVerified,
  parseBrokerCatalogRoles,
  PROFESSIONAL_SIDEBAR_ROLES,
  professionalVerificationStatus,
  type UserWithProfiles,
} from './professional-verification.util';

export { parseBrokerCatalogRoles, PROFESSIONAL_SIDEBAR_ROLES };

type RoleProfilePublic = {
  isPublic?: boolean;
  verificationStatus?: AgentVerificationStatus;
  city?: string;
  phone?: string;
  email?: string;
};

export type ProfessionalDirectoryUser = {
  id: string;
  role: UserRole;
  name: string | null;
  avatar: string | null;
  bio: string | null;
  professionalVerified: boolean;
  professionalVerificationStatus: ProfessionalVerificationStatus;
  publicProfessionalProfile: boolean;
  publicProfile?: boolean;
  canPublishPosts?: boolean;
  showInProfessionals?: boolean;
  accountLimited?: boolean;
  portalWorkerStatus?: PortalWorkerStatus | null;
  isPublicBrokerProfile: boolean;
  brokerProfileSlug: string | null;
  brokerOfficeName: string;
  brokerRegionLabel: string;
  brokerReviewAverage: number;
  brokerReviewCount: number;
  allowBrokerReviews: boolean;
  brokerPhonePublic: string;
  brokerEmailPublic: string;
  isTestAccount?: boolean;
  testAccountPublicVisible?: boolean;
  agentProfile?: RoleProfilePublic | null;
  companyProfile?: RoleProfilePublic | null;
  agencyProfile?: RoleProfilePublic | null;
  financialAdvisorProfile?: RoleProfilePublic | null;
  investorProfile?: RoleProfilePublic | null;
};

export function roleProfilePublic(user: ProfessionalDirectoryUser): RoleProfilePublic | null {
  switch (user.role) {
    case UserRole.AGENT:
      return user.agentProfile ?? null;
    case UserRole.AGENCY:
      return user.agencyProfile ?? null;
    case UserRole.COMPANY:
      return user.companyProfile ?? null;
    case UserRole.FINANCIAL_ADVISOR:
      return user.financialAdvisorProfile ?? null;
    case UserRole.INVESTOR:
      return user.investorProfile ?? null;
    default:
      return null;
  }
}

/** isPublic OR publicProfile OR showInDirectory */
export function isProfessionalDirectoryPublic(user: ProfessionalDirectoryUser): boolean {
  return shouldShowUserInProfessionals(user);
}

/** isVerified OR verified — pracovník portálu: schválení přes portalWorkerStatus. */
export function isProfessionalDirectoryVerified(user: ProfessionalDirectoryUser): boolean {
  if (user.role === UserRole.PORTAL_WORKER) {
    return user.portalWorkerStatus === PortalWorkerStatus.APPROVED;
  }
  const profileUser = user as UserWithProfiles;
  if (
    user.professionalVerified === true &&
    user.professionalVerificationStatus === ProfessionalVerificationStatus.APPROVED
  ) {
    return true;
  }
  if (isProfessionalVerified(profileUser)) return true;
  return professionalVerificationStatus(profileUser) === AgentVerificationStatus.verified;
}

export function professionalDirectoryFilterReasons(
  user: ProfessionalDirectoryUser,
  allowedRoles: Set<UserRole>,
): string[] {
  const reasons: string[] = [];
  if (user.isTestAccount && !user.testAccountPublicVisible) {
    reasons.push('test_account_hidden');
  }
  if (!allowedRoles.has(user.role)) {
    reasons.push(`role_not_allowed:${user.role}`);
  }
  if (user.accountLimited) {
    reasons.push('account_limited');
  }
  if (!isProfessionalDirectoryPublic(user)) {
    reasons.push(
      'not_public(publicProfile,showInProfessionals,publicProfessionalProfile,isPublicBrokerProfile)',
    );
  }
  if (!isProfessionalDirectoryVerified(user)) {
    reasons.push(
      'not_verified(professionalVerified+APPROVED,roleProfile.verificationStatus)',
    );
  }
  return reasons;
}

export function serializeProfessionalDirectoryCard(user: ProfessionalDirectoryUser) {
  const profile = roleProfilePublic(user);
  const city =
    user.brokerRegionLabel?.trim() ||
    profile?.city?.trim() ||
    user.brokerOfficeName?.trim() ||
    '';
  const phonePublic =
    user.brokerPhonePublic?.trim() || profile?.phone?.trim() || null;
  const emailPublic =
    user.brokerEmailPublic?.trim() || profile?.email?.trim() || null;

  return {
    id: user.id,
    slug: user.brokerProfileSlug,
    role: user.role,
    name: user.name,
    avatarUrl: user.avatar,
    officeName: user.brokerOfficeName,
    regionLabel: city,
    city,
    phonePublic,
    emailPublic,
    bioExcerpt: (user.bio ?? '').trim().slice(0, 160),
    ratingAverage: user.allowBrokerReviews ? user.brokerReviewAverage : null,
    ratingCount: user.allowBrokerReviews ? user.brokerReviewCount : null,
    verificationStatus: professionalVerificationStatus(user as UserWithProfiles),
    isVerified: isProfessionalDirectoryVerified(user),
    isPublic: isProfessionalDirectoryPublic(user),
  };
}

export function parseProfessionalDirectoryRoles(raw?: string): UserRole[] {
  return parseBrokerCatalogRoles(raw) ?? [...PROFESSIONAL_SIDEBAR_ROLES];
}
