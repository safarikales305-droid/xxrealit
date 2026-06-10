export type VerificationStatus = 'pending' | 'verified' | 'rejected';

export type ProfessionalVerificationLike = {
  role?: string | null;
  isVerified?: boolean | null;
  verificationStatus?: string | null;
};

export function normalizeVerificationStatus(
  raw: string | null | undefined,
): VerificationStatus | null {
  const v = String(raw ?? '').trim().toLowerCase();
  if (v === 'pending' || v === 'verified' || v === 'rejected') return v;
  return null;
}

export function isProfessionalVerifiedProfile(
  profile: ProfessionalVerificationLike | null | undefined,
): boolean {
  if (!profile) return false;
  if (profile.isVerified === true) return true;
  return normalizeVerificationStatus(profile.verificationStatus) === 'verified';
}

export function verifiedBadgeLabelForRole(role: string | null | undefined): string {
  switch (String(role ?? '').toUpperCase()) {
    case 'AGENT':
      return 'Ověřený makléř';
    case 'AGENCY':
      return 'Ověřená realitní kancelář';
    case 'COMPANY':
      return 'Ověřená stavební firma';
    case 'FINANCIAL_ADVISOR':
      return 'Ověřený finanční poradce';
    case 'INVESTOR':
      return 'Ověřený investor';
    default:
      return 'Ověřený profesionál';
  }
}

/** Katalog /makleri — jen realitní role. */
export const BROKER_CATALOG_ROLES = ['AGENT', 'AGENCY'] as const;

export function isBrokerCatalogRole(role: string | null | undefined): boolean {
  const r = String(role ?? '').toUpperCase();
  return (BROKER_CATALOG_ROLES as readonly string[]).includes(r);
}
