import { UserRole } from '@prisma/client';

export const POST_PUBLISH_REQUIRES_PUBLIC_PROFILE_MSG =
  'Pro publikování příspěvků musíte mít zapnutý veřejný profil. Zapněte si jej v nastavení profilu, nebo požádejte administrátora.';

export type UserPublicProfileSnapshot = {
  isPublicProfile?: boolean | null;
};

/** Uživatel má zapnutý veřejný profil — jediné kanonické pole. */
export function isUserPublicProfileEnabled(user: UserPublicProfileSnapshot): boolean {
  return user.isPublicProfile === true;
}

export function userPublicProfileWriteData(isPublic: boolean) {
  return {
    isPublicProfile: isPublic,
    isPublicBrokerProfile: isPublic,
    publicProfessionalProfile: isPublic,
  };
}

export function hasFilledContactPhone(input: {
  phone?: string | null;
  whatsappPhone?: string | null;
}): boolean {
  return Boolean(String(input.whatsappPhone ?? input.phone ?? '').trim());
}

export const POST_PUBLISH_ROLES: UserRole[] = [
  UserRole.AGENT,
  UserRole.COMPANY,
  UserRole.AGENCY,
  UserRole.FINANCIAL_ADVISOR,
  UserRole.INVESTOR,
  UserRole.PORTAL_WORKER,
];
