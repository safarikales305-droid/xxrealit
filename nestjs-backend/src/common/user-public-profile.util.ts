import { UserRole } from '@prisma/client';

export const POST_PUBLISH_REQUIRES_PUBLIC_PROFILE_MSG =
  'Pro publikování příspěvků musíte mít zapnutý veřejný profil. Zapněte si jej v nastavení profilu, nebo požádejte administrátora.';

export type UserPublicProfileSnapshot = {
  role: UserRole;
  isPublicBrokerProfile: boolean;
  publicProfessionalProfile: boolean;
  agentProfile?: { isPublic: boolean } | null;
  companyProfile?: { isPublic: boolean } | null;
  agencyProfile?: { isPublic: boolean } | null;
  financialAdvisorProfile?: { isPublic: boolean } | null;
  investorProfile?: { isPublic: boolean } | null;
};

/** Uživatel má zapnutý veřejný účet / profil (stejná logika jako katalog profesionálů). */
export function isUserPublicProfileEnabled(user: UserPublicProfileSnapshot): boolean {
  if (user.publicProfessionalProfile === true) return true;
  if (user.isPublicBrokerProfile === true) return true;

  switch (user.role) {
    case UserRole.AGENT:
      return user.agentProfile?.isPublic === true;
    case UserRole.COMPANY:
      return user.companyProfile?.isPublic === true;
    case UserRole.AGENCY:
      return user.agencyProfile?.isPublic === true;
    case UserRole.FINANCIAL_ADVISOR:
      return user.financialAdvisorProfile?.isPublic === true;
    case UserRole.INVESTOR:
      return user.investorProfile?.isPublic === true;
    default:
      return false;
  }
}

export function hasFilledContactPhone(input: {
  phone?: string | null;
  whatsappPhone?: string | null;
}): boolean {
  return Boolean(String(input.whatsappPhone ?? input.phone ?? '').trim());
}
