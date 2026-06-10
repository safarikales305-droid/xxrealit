import { AgentVerificationStatus, UserRole } from '@prisma/client';

type ProfileVerification = {
  verificationStatus: AgentVerificationStatus;
} | null;

type UserWithProfiles = {
  role: UserRole;
  agentProfile?: ProfileVerification;
  companyProfile?: ProfileVerification;
  agencyProfile?: ProfileVerification;
  financialAdvisorProfile?: ProfileVerification;
  investorProfile?: ProfileVerification;
};

export function professionalVerificationStatus(
  user: UserWithProfiles,
): AgentVerificationStatus | null {
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
  return professionalVerificationStatus(user) === AgentVerificationStatus.verified;
}

/** Role zobrazené v katalogu /makleri (realitní makléř / kancelář). */
export const BROKER_CATALOG_ROLES: UserRole[] = [UserRole.AGENT, UserRole.AGENCY];

export function parseBrokerCatalogRoles(raw?: string): UserRole[] | undefined {
  if (!raw?.trim()) return undefined;
  const allowed = new Set<UserRole>(BROKER_CATALOG_ROLES);
  const parsed = raw
    .split(',')
    .map((x) => x.trim().toUpperCase())
    .filter((x): x is UserRole => allowed.has(x as UserRole));
  return parsed.length > 0 ? parsed : undefined;
}
