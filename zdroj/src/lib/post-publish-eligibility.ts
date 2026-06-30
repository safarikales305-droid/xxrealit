import type { NestMeProfile } from '@/lib/nest-client';

export const POST_PUBLISH_REQUIRES_PUBLIC_PROFILE_MSG =
  'Pro publikování příspěvků musíte mít zapnutý veřejný profil. Zapněte si jej v nastavení profilu, nebo požádejte administrátora.';

const POST_PUBLISH_ROLES = new Set([
  'AGENT',
  'COMPANY',
  'AGENCY',
  'FINANCIAL_ADVISOR',
  'INVESTOR',
]);

export function isUserPublicProfileEnabled(me: NestMeProfile): boolean {
  if (me.publicProfessionalProfile === true) return true;
  if (me.isPublicBrokerProfile === true) return true;
  if (me.agentProfile?.isPublic === true) return true;
  if (me.companyProfile?.isPublic === true) return true;
  if (me.agencyProfile?.isPublic === true) return true;
  if (me.financialAdvisorProfile?.isPublic === true) return true;
  if (me.investorProfile?.isPublic === true) return true;
  return false;
}

export function canUserPublishPosts(me: NestMeProfile | null | undefined): boolean {
  if (!me?.role) return false;
  if (!POST_PUBLISH_ROLES.has(me.role)) return false;
  return isUserPublicProfileEnabled(me);
}

export function isAdminUserPublicProfileEnabled(user: {
  isPublicBrokerProfile?: boolean;
  publicProfessionalProfile?: boolean;
}): boolean {
  if (user.publicProfessionalProfile === true) return true;
  if (user.isPublicBrokerProfile === true) return true;
  return false;
}

export function canRolePublishPosts(role: string | null | undefined): boolean {
  if (!role) return false;
  return POST_PUBLISH_ROLES.has(role);
}
