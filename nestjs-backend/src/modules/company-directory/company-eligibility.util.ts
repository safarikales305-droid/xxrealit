import type { CompanyDirectoryEntry } from '@prisma/client';

export function isCompanyAutomationExcluded(company: {
  hidden?: boolean;
  inLiquidation?: boolean;
  inactive?: boolean;
  dissolved?: boolean;
  companyStatus?: string | null;
  name?: string | null;
}): boolean {
  if (company.hidden || company.inLiquidation || company.inactive || company.dissolved) {
    return true;
  }
  const status = (company.companyStatus ?? '').toUpperCase();
  if (status && status !== 'AKTIVNI') return true;
  const name = (company.name ?? '').toLowerCase();
  if (/\bv\s+likvidaci\b/.test(name)) return true;
  return false;
}

export function canEnqueueSocialIntro(company: Pick<
  CompanyDirectoryEntry,
  | 'publicProfile'
  | 'enrichmentStatus'
  | 'socialIntroPublishedAt'
  | 'socialIntroPostId'
  | 'hidden'
  | 'inLiquidation'
  | 'inactive'
  | 'dissolved'
  | 'companyStatus'
  | 'name'
>): boolean {
  if (!company.publicProfile) return false;
  if (company.socialIntroPublishedAt || company.socialIntroPostId) return false;
  if (isCompanyAutomationExcluded(company)) return false;
  return company.enrichmentStatus === 'ENRICHED' || company.enrichmentStatus === 'VERIFIED';
}

export function canAutoEnrollEmailCampaign(company: Pick<
  CompanyDirectoryEntry,
  | 'verifiedBusinessEmail'
  | 'discoveredEmail'
  | 'communicationOptOut'
  | 'emailBounced'
  | 'profileStatus'
  | 'hidden'
  | 'inLiquidation'
  | 'inactive'
  | 'dissolved'
  | 'companyStatus'
  | 'name'
>): boolean {
  if (isCompanyAutomationExcluded(company)) return false;
  if (company.communicationOptOut || company.emailBounced) return false;
  if (company.profileStatus === 'CLAIMED' || company.profileStatus === 'VERIFIED') return false;
  const email = company.verifiedBusinessEmail?.trim() || company.discoveredEmail?.trim();
  return Boolean(email);
}
