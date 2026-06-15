export type VerificationStatus = 'pending' | 'verified' | 'rejected';

export type ProfessionalVerificationStatusUser =
  | 'NONE'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED';

export type ProfessionalVerificationLike = {
  role?: string | null;
  isVerified?: boolean | null;
  verificationStatus?: string | null;
  professionalVerified?: boolean | null;
  professionalVerificationStatus?: string | null;
  publicProfessionalProfile?: boolean | null;
};

export function normalizeVerificationStatus(
  raw: string | null | undefined,
): VerificationStatus | null {
  const v = String(raw ?? '').trim().toLowerCase();
  if (v === 'pending' || v === 'verified' || v === 'rejected') return v;
  return null;
}

export function normalizeUserProfessionalStatus(
  raw: string | null | undefined,
): ProfessionalVerificationStatusUser | null {
  const v = String(raw ?? '').trim().toUpperCase();
  if (v === 'NONE' || v === 'PENDING' || v === 'APPROVED' || v === 'REJECTED') return v;
  return null;
}

export function isProfessionalVerifiedProfile(
  profile: ProfessionalVerificationLike | null | undefined,
): boolean {
  if (!profile) return false;
  const userStatus = normalizeUserProfessionalStatus(profile.professionalVerificationStatus);
  if (profile.professionalVerified === true && userStatus === 'APPROVED') return true;
  if (profile.isVerified === true) return true;
  return normalizeVerificationStatus(profile.verificationStatus) === 'verified';
}

export function isMeProfessionallyApproved(
  me: ProfessionalVerificationLike | null | undefined,
): boolean {
  return isProfessionalVerifiedProfile(me);
}

export function isMeVerificationPending(
  me: ProfessionalVerificationLike | null | undefined,
): boolean {
  if (!me) return false;
  const s = normalizeUserProfessionalStatus(me.professionalVerificationStatus);
  if (s === 'PENDING') return true;
  return normalizeVerificationStatus(me.verificationStatus) === 'pending';
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
    case 'CRAFTSMAN':
      return 'Ověřený řemeslník';
    default:
      return 'Ověřený profesionál';
  }
}

/** Katalog /makleri — jen realitní role. */
export const BROKER_CATALOG_ROLES = ['AGENT', 'AGENCY'] as const;

export {
  collectVerificationEligibilityIssues,
  isProfessionalVerificationRole,
  professionalVerificationStatusLabel,
  PROFESSIONAL_VERIFICATION_ROLES,
} from '@/lib/professional-verification-eligibility';

export function isBrokerCatalogRole(role: string | null | undefined): boolean {
  const r = String(role ?? '').toUpperCase();
  return (BROKER_CATALOG_ROLES as readonly string[]).includes(r);
}
