import { UserRole } from '@prisma/client';

export type VerificationEligibilityInput = {
  role: UserRole;
  name: string | null;
  email: string;
  bio: string | null;
  avatar: string | null;
  brokerOfficeName?: string | null;
  agentProfile?: {
    companyName?: string;
    ico?: string;
    bio?: string;
    avatarUrl?: string | null;
  } | null;
  companyProfile?: {
    companyName?: string;
    ico?: string;
    description?: string;
    logoUrl?: string | null;
  } | null;
  agencyProfile?: {
    agencyName?: string;
    ico?: string;
    logoUrl?: string | null;
  } | null;
  financialAdvisorProfile?: {
    ico?: string;
    bio?: string;
    avatarUrl?: string | null;
  } | null;
  investorProfile?: {
    bio?: string;
    avatarUrl?: string | null;
  } | null;
};

function str(v: string | null | undefined): string {
  return (v ?? '').trim();
}

export function resolveVerificationBio(input: VerificationEligibilityInput): string {
  return (
    str(input.bio) ||
    str(input.agentProfile?.bio) ||
    str(input.companyProfile?.description) ||
    str(input.financialAdvisorProfile?.bio) ||
    str(input.investorProfile?.bio)
  );
}

export function resolveVerificationAvatar(input: VerificationEligibilityInput): string {
  return (
    str(input.avatar) ||
    str(input.agentProfile?.avatarUrl) ||
    str(input.companyProfile?.logoUrl) ||
    str(input.agencyProfile?.logoUrl) ||
    str(input.financialAdvisorProfile?.avatarUrl) ||
    str(input.investorProfile?.avatarUrl)
  );
}

export function resolveVerificationCompanyName(input: VerificationEligibilityInput): string {
  switch (input.role) {
    case UserRole.COMPANY:
      return str(input.companyProfile?.companyName) || str(input.brokerOfficeName);
    case UserRole.AGENCY:
      return str(input.agencyProfile?.agencyName) || str(input.brokerOfficeName);
    case UserRole.AGENT:
      return str(input.agentProfile?.companyName) || str(input.brokerOfficeName);
    default:
      return '';
  }
}

export function resolveVerificationIco(input: VerificationEligibilityInput): string {
  switch (input.role) {
    case UserRole.COMPANY:
      return str(input.companyProfile?.ico);
    case UserRole.AGENCY:
      return str(input.agencyProfile?.ico);
    case UserRole.AGENT:
      return str(input.agentProfile?.ico);
    case UserRole.FINANCIAL_ADVISOR:
      return str(input.financialAdvisorProfile?.ico);
    default:
      return '';
  }
}

/** Povinné údaje před odesláním žádosti (nikdy obecná „rozšířte profil“). */
export function collectVerificationBlockingIssues(
  input: VerificationEligibilityInput,
): string[] {
  const issues: string[] = [];

  if (!str(input.name)) {
    issues.push('Chybí jméno');
  }
  if (!str(input.email)) {
    issues.push('Chybí e-mail');
  }

  if (input.role === UserRole.COMPANY || input.role === UserRole.AGENCY) {
    if (!resolveVerificationCompanyName(input)) {
      issues.push('Chybí název firmy');
    }
    const hasBusinessProfile =
      input.role === UserRole.COMPANY
        ? Boolean(input.companyProfile)
        : Boolean(input.agencyProfile);
    if (hasBusinessProfile && !resolveVerificationIco(input)) {
      issues.push('Chybí IČO');
    }
  }

  if (input.role === UserRole.FINANCIAL_ADVISOR && input.financialAdvisorProfile) {
    if (!resolveVerificationIco(input)) {
      issues.push('Chybí IČO');
    }
  }

  return issues;
}

/** Doporučené údaje — zobrazit v UI, neblokovat odeslání. */
export function collectVerificationRecommendations(
  input: VerificationEligibilityInput,
): string[] {
  const tips: string[] = [];
  if (!resolveVerificationBio(input)) {
    tips.push('Chybí bio');
  }
  if (!resolveVerificationAvatar(input)) {
    tips.push('Chybí profilová fotografie');
  }
  return tips;
}
