import { UserRole } from '@prisma/client';

export type ProfileRequirementsInput = {
  role: UserRole | string;
  name?: string | null;
  email?: string | null;
  emailVerified?: boolean;
  whatsappVerified?: boolean;
  city?: string | null;
  isTipar?: boolean;
  tiparPayoutBankAccount?: string | null;
  professionalVerified?: boolean;
  professionalVerificationStatus?: string | null;
  brokerOfficeName?: string | null;
  agentProfile?: { companyName?: string; ico?: string; city?: string } | null;
  companyProfile?: { companyName?: string; ico?: string; city?: string } | null;
  agencyProfile?: { agencyName?: string; ico?: string; city?: string } | null;
  financialAdvisorProfile?: { ico?: string; city?: string } | null;
  investorProfile?: { city?: string } | null;
};

function str(v: string | null | undefined): string {
  return (v ?? '').trim();
}

export function resolveProfileAddress(input: ProfileRequirementsInput): string {
  return (
    str(input.city) ||
    str(input.agentProfile?.city) ||
    str(input.companyProfile?.city) ||
    str(input.agencyProfile?.city) ||
    str(input.financialAdvisorProfile?.city) ||
    str(input.investorProfile?.city)
  );
}

export function resolveProfileIco(input: ProfileRequirementsInput): string {
  const role = String(input.role ?? '').toUpperCase();
  if (role === UserRole.COMPANY) return str(input.companyProfile?.ico);
  if (role === UserRole.AGENCY) return str(input.agencyProfile?.ico);
  if (role === UserRole.AGENT) return str(input.agentProfile?.ico);
  if (role === UserRole.FINANCIAL_ADVISOR) return str(input.financialAdvisorProfile?.ico);
  return '';
}

export function resolveCompanyName(input: ProfileRequirementsInput): string {
  const role = String(input.role ?? '').toUpperCase();
  if (role === UserRole.COMPANY) {
    return str(input.companyProfile?.companyName) || str(input.brokerOfficeName);
  }
  if (role === UserRole.AGENCY) {
    return str(input.agencyProfile?.agencyName) || str(input.brokerOfficeName);
  }
  if (role === UserRole.AGENT) {
    return str(input.agentProfile?.companyName) || str(input.brokerOfficeName);
  }
  return '';
}

const PROFESSIONAL_ROLES = new Set<string>([
  UserRole.AGENT,
  UserRole.COMPANY,
  UserRole.AGENCY,
  UserRole.CRAFTSMAN,
  UserRole.FINANCIAL_ADVISOR,
  UserRole.INVESTOR,
]);

export function collectProfessionalRequirementIssues(input: ProfileRequirementsInput): string[] {
  const issues: string[] = [];
  const role = String(input.role ?? '').toUpperCase();

  if (!PROFESSIONAL_ROLES.has(role)) return issues;

  if (!str(input.name)) issues.push('Vyplňte jméno v profilu');
  if (!str(input.email)) issues.push('Vyplňte e-mail');
  if (!input.emailVerified) issues.push('Ověřte e-mail');
  if (!input.whatsappVerified) issues.push('Ověřte WhatsApp číslo');
  if (!resolveProfileAddress(input)) issues.push('Vyplňte adresu / město');

  const icoRoles: UserRole[] = [
    UserRole.AGENT,
    UserRole.COMPANY,
    UserRole.AGENCY,
    UserRole.FINANCIAL_ADVISOR,
  ];
  if (icoRoles.includes(role as UserRole)) {
    if (!resolveProfileIco(input)) issues.push('Vyplňte IČO');
  }

  if (role === UserRole.COMPANY || role === UserRole.AGENCY) {
    if (!resolveCompanyName(input)) issues.push('Vyplňte název firmy');
  }

  if (input.professionalVerificationStatus !== 'APPROVED' || !input.professionalVerified) {
    issues.push('Požádejte o ověření a počkejte na schválení administrátorem');
  }

  return issues;
}

export function collectTiparRequirementIssues(input: ProfileRequirementsInput): string[] {
  const issues: string[] = [];
  if (!str(input.name)) issues.push('Vyplňte jméno');
  if (!str(input.email)) issues.push('Vyplňte e-mail');
  if (!input.emailVerified) issues.push('Ověřte e-mail');
  if (!input.whatsappVerified) issues.push('Ověřte WhatsApp číslo');
  if (!resolveProfileAddress(input)) issues.push('Vyplňte adresu / město');
  if (!str(input.tiparPayoutBankAccount)) {
    issues.push('Vyplňte číslo bankovního účtu pro výplatu provizí');
  }
  return issues;
}

export function canUseTiparFeatures(input: ProfileRequirementsInput): boolean {
  return input.isTipar === true && collectTiparRequirementIssues(input).length === 0;
}

export function canTopUpCredits(input: ProfileRequirementsInput): boolean {
  if (!input.whatsappVerified) return false;
  if (!input.emailVerified) return false;
  if (!str(input.name)) return false;
  return true;
}

export function showVerifiedProfessionalBadge(input: ProfileRequirementsInput): boolean {
  if (input.professionalVerificationStatus !== 'APPROVED' || !input.professionalVerified) {
    return false;
  }
  const withoutAdmin = collectProfessionalRequirementIssues(input).filter(
    (x) => !x.includes('administrátorem'),
  );
  return withoutAdmin.length === 0;
}

export function showVerifiedTiparBadge(input: ProfileRequirementsInput): boolean {
  return input.isTipar === true && collectTiparRequirementIssues(input).length === 0;
}
