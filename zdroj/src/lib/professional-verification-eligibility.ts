import type { NestMeProfile } from '@/lib/nest-client';

function str(v: string | null | undefined): string {
  return (v ?? '').trim();
}

export function resolveVerificationBio(me: NestMeProfile): string {
  return (
    str(me.bio) ||
    str(me.agentProfile?.bio) ||
    str(me.companyProfile?.description) ||
    str(me.agencyProfile?.description) ||
    str(me.financialAdvisorProfile?.bio) ||
    str(me.investorProfile?.bio)
  );
}

export function resolveVerificationAvatar(me: NestMeProfile): string {
  return (
    str(me.avatarUrl) ||
    str(me.agentProfile?.avatarUrl) ||
    str(me.companyProfile?.logoUrl) ||
    str(me.agencyProfile?.logoUrl) ||
    str(me.financialAdvisorProfile?.avatarUrl) ||
    str(me.investorProfile?.avatarUrl)
  );
}

function resolveProfileAddress(me: NestMeProfile): string {
  return (
    str(me.city) ||
    str(me.agentProfile?.city) ||
    str(me.companyProfile?.city) ||
    str(me.agencyProfile?.city) ||
    str(me.financialAdvisorProfile?.city) ||
    str(me.investorProfile?.city)
  );
}

function resolveCompanyName(me: NestMeProfile): string {
  const role = String(me.role ?? '').toUpperCase();
  if (role === 'COMPANY') {
    return str(me.companyProfile?.companyName) || str(me.brokerOfficeName);
  }
  if (role === 'AGENCY') {
    return str(me.agencyProfile?.agencyName) || str(me.brokerOfficeName);
  }
  if (role === 'AGENT') {
    return str(me.agentProfile?.companyName) || str(me.brokerOfficeName);
  }
  return '';
}

function resolveIco(me: NestMeProfile): string {
  const role = String(me.role ?? '').toUpperCase();
  if (role === 'COMPANY') return str(me.companyProfile?.ico);
  if (role === 'AGENCY') return str(me.agencyProfile?.ico);
  if (role === 'AGENT') return str(me.agentProfile?.ico);
  if (role === 'FINANCIAL_ADVISOR') return str(me.financialAdvisorProfile?.ico);
  return '';
}

export function collectVerificationBlockingIssues(me: NestMeProfile): string[] {
  if (me.profileRequirements?.professional?.length) {
    return me.profileRequirements.professional.filter(
      (issue) => !issue.includes('administrátorem'),
    );
  }

  const issues: string[] = [];
  const role = String(me.role ?? '').toUpperCase();

  if (!str(me.name)) issues.push('Chybí jméno');
  if (!str(me.email)) issues.push('Chybí e-mail');
  if (!me.emailVerified) issues.push('Ověřte e-mail');
  if (!me.whatsappVerified) issues.push('Ověřte WhatsApp číslo');
  if (!resolveProfileAddress(me)) issues.push('Vyplňte adresu / město');

  if (['AGENT', 'COMPANY', 'AGENCY', 'FINANCIAL_ADVISOR'].includes(role)) {
    if (!resolveIco(me)) issues.push('Chybí IČO');
  }

  if (role === 'COMPANY' || role === 'AGENCY') {
    if (!resolveCompanyName(me)) issues.push('Chybí název firmy');
  }

  return issues;
}

export function collectVerificationRecommendations(me: NestMeProfile): string[] {
  const tips: string[] = [];
  if (!resolveVerificationBio(me)) tips.push('Chybí bio');
  if (!resolveVerificationAvatar(me)) tips.push('Chybí profilová fotografie');
  return tips;
}

/** @deprecated Použijte collectVerificationBlockingIssues */
export function collectVerificationEligibilityIssues(me: NestMeProfile): string[] {
  return [
    ...collectVerificationBlockingIssues(me),
    ...collectVerificationRecommendations(me),
  ];
}

export function professionalVerificationStatusLabel(
  status: NestMeProfile['professionalVerificationStatus'] | undefined,
): string {
  switch (status) {
    case 'PENDING':
      return 'Čeká na schválení';
    case 'APPROVED':
      return 'Schváleno';
    case 'REJECTED':
      return 'Zamítnuto';
    default:
      return 'Nezažádáno';
  }
}

export const PROFESSIONAL_VERIFICATION_ROLES = [
  'AGENT',
  'COMPANY',
  'AGENCY',
  'CRAFTSMAN',
  'FINANCIAL_ADVISOR',
  'INVESTOR',
] as const;

export function isProfessionalVerificationRole(role: string | null | undefined): boolean {
  return (PROFESSIONAL_VERIFICATION_ROLES as readonly string[]).includes(
    String(role ?? '').toUpperCase(),
  );
}
