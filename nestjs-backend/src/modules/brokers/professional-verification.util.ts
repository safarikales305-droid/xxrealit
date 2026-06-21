import {
  AgentVerificationStatus,
  ProfessionalVerificationStatus,
  UserRole,
} from '@prisma/client';

type ProfileVerification = {
  verificationStatus: AgentVerificationStatus;
} | null;

export type UserWithProfiles = {
  role: UserRole;
  professionalVerified?: boolean;
  professionalVerificationStatus?: ProfessionalVerificationStatus;
  publicProfessionalProfile?: boolean;
  whatsappVerified?: boolean;
  agentProfile?: ProfileVerification;
  companyProfile?: ProfileVerification;
  agencyProfile?: ProfileVerification;
  financialAdvisorProfile?: ProfileVerification;
  investorProfile?: ProfileVerification;
};

export function professionalVerificationStatus(
  user: UserWithProfiles,
): AgentVerificationStatus | null {
  if (user.professionalVerificationStatus) {
    switch (user.professionalVerificationStatus) {
      case ProfessionalVerificationStatus.APPROVED:
        return AgentVerificationStatus.verified;
      case ProfessionalVerificationStatus.PENDING:
        return AgentVerificationStatus.pending;
      case ProfessionalVerificationStatus.REJECTED:
        return AgentVerificationStatus.rejected;
      default:
        break;
    }
  }
  switch (user.role) {
    case UserRole.AGENT:
      return user.agentProfile?.verificationStatus ?? null;
    case UserRole.COMPANY:
      return user.companyProfile?.verificationStatus ?? null;
    case UserRole.AGENCY:
      return user.agencyProfile?.verificationStatus ?? null;
    case UserRole.FINANCIAL_ADVISOR:
      return user.financialAdvisorProfile?.verificationStatus ?? null;
    case UserRole.INVESTOR:
      return user.investorProfile?.verificationStatus ?? null;
    default:
      return null;
  }
}

export function isProfessionalVerified(user: UserWithProfiles): boolean {
  if (
    user.professionalVerified === true &&
    user.professionalVerificationStatus === ProfessionalVerificationStatus.APPROVED
  ) {
    return true;
  }
  return professionalVerificationStatus(user) === AgentVerificationStatus.verified;
}

export function isCatalogEligibleProfessional(user: UserWithProfiles): boolean {
  return (
    user.publicProfessionalProfile === true &&
    user.professionalVerified === true &&
    user.professionalVerificationStatus === ProfessionalVerificationStatus.APPROVED &&
    user.whatsappVerified === true &&
    isProfessionalVerified(user)
  );
}

/** Role zobrazené v katalogu /makleri (realitní makléř / kancelář). */
export const BROKER_CATALOG_ROLES: UserRole[] = [UserRole.AGENT, UserRole.AGENCY];

/** Role v sidebaru Profesionálové na homepage. */
export const PROFESSIONAL_SIDEBAR_ROLES: UserRole[] = [
  UserRole.AGENT,
  UserRole.AGENCY,
  UserRole.COMPANY,
  UserRole.CRAFTSMAN,
  UserRole.FINANCIAL_ADVISOR,
  UserRole.INVESTOR,
];

export function parseBrokerCatalogRoles(raw?: string): UserRole[] | undefined {
  if (!raw?.trim()) return undefined;
  const allowed = new Set<UserRole>(PROFESSIONAL_SIDEBAR_ROLES);
  const parsed = raw
    .split(',')
    .map((x) => x.trim().toUpperCase())
    .filter((x): x is UserRole => allowed.has(x as UserRole));
  return parsed.length > 0 ? parsed : undefined;
}

export const CATALOG_VERIFIED_USER_WHERE = {
  professionalVerified: true,
  professionalVerificationStatus: ProfessionalVerificationStatus.APPROVED,
  publicProfessionalProfile: true,
  whatsappVerified: true,
} as const;

export function verifiedBadgeLabelForRole(role: UserRole | string | null | undefined): string {
  switch (String(role ?? '').toUpperCase()) {
    case UserRole.AGENT:
      return 'Ověřený makléř';
    case UserRole.AGENCY:
      return 'Ověřená realitní kancelář';
    case UserRole.COMPANY:
      return 'Ověřená stavební firma';
    case UserRole.FINANCIAL_ADVISOR:
      return 'Ověřený finanční poradce';
    case UserRole.INVESTOR:
      return 'Ověřený investor';
    case UserRole.CRAFTSMAN:
      return 'Ověřený řemeslník';
    default:
      return 'Ověřený profesionál';
  }
}

export function verifiedBadgeLabelForUser(
  user: UserWithProfiles & { isTipar?: boolean },
): string | null {
  if (user.isTipar) {
    return 'Ověřený tipař';
  }
  return verifiedBadgeLabelForRole(user.role);
}

export function publicProfileHref(userId: string, _role?: UserRole | string): string {
  return `/profile/${userId}`;
}
