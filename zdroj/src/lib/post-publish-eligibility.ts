import type { NestMeProfile } from '@/lib/nest-client';

export const POST_PUBLISH_REQUIRES_PUBLIC_PROFILE_MSG =
  'Pro publikování příspěvků musíte mít zapnutý veřejný profil. Zapněte si jej v nastavení profilu, nebo požádejte administrátora.';

const POST_PUBLISH_ROLES = new Set([
  'AGENT',
  'COMPANY',
  'AGENCY',
  'FINANCIAL_ADVISOR',
  'INVESTOR',
  'PORTAL_WORKER',
]);

export function isUserPublicProfileEnabled(me: NestMeProfile | { isPublicProfile?: boolean }): boolean {
  return me.isPublicProfile === true;
}

export function canUserPublishPosts(me: NestMeProfile | null | undefined): boolean {
  if (!me?.role) return false;
  if (!POST_PUBLISH_ROLES.has(me.role)) return false;
  return isUserPublicProfileEnabled(me);
}

export function isAdminUserPublicProfileEnabled(user: { isPublicProfile?: boolean }): boolean {
  return user.isPublicProfile === true;
}

export function canRolePublishPosts(role: string | null | undefined): boolean {
  if (!role) return false;
  return POST_PUBLISH_ROLES.has(role);
}
