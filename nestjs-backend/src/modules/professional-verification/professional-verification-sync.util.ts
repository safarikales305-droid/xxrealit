import {
  AgentVerificationStatus,
  ProfessionalVerificationStatus,
  UserRole,
} from '@prisma/client';

export const PROFESSIONAL_ROLES: UserRole[] = [
  UserRole.AGENT,
  UserRole.COMPANY,
  UserRole.AGENCY,
  UserRole.CRAFTSMAN,
  UserRole.FINANCIAL_ADVISOR,
  UserRole.INVESTOR,
];

export function isProfessionalRole(role: UserRole): boolean {
  return PROFESSIONAL_ROLES.includes(role);
}

export function mapUserStatusToAgentStatus(
  status: ProfessionalVerificationStatus,
): AgentVerificationStatus {
  switch (status) {
    case ProfessionalVerificationStatus.APPROVED:
      return AgentVerificationStatus.verified;
    case ProfessionalVerificationStatus.REJECTED:
      return AgentVerificationStatus.rejected;
    case ProfessionalVerificationStatus.PENDING:
      return AgentVerificationStatus.pending;
    default:
      return AgentVerificationStatus.pending;
  }
}

export function isUserProfessionallyApproved(user: {
  professionalVerified: boolean;
  professionalVerificationStatus: ProfessionalVerificationStatus;
}): boolean {
  return (
    user.professionalVerified &&
    user.professionalVerificationStatus === ProfessionalVerificationStatus.APPROVED
  );
}

export function isUserPublicProfessional(user: {
  publicProfessionalProfile: boolean;
  professionalVerified: boolean;
  professionalVerificationStatus: ProfessionalVerificationStatus;
}): boolean {
  return user.publicProfessionalProfile && isUserProfessionallyApproved(user);
}

export function professionalRoleLabel(role: UserRole): string {
  switch (role) {
    case UserRole.AGENT:
      return 'Makléř';
    case UserRole.COMPANY:
      return 'Stavební firma';
    case UserRole.AGENCY:
      return 'Realitní kancelář';
    case UserRole.FINANCIAL_ADVISOR:
      return 'Finanční poradce';
    case UserRole.INVESTOR:
      return 'Investor';
    case UserRole.CRAFTSMAN:
      return 'Řemeslník';
    default:
      return role;
  }
}
