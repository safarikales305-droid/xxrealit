import type { NestMeProfile } from '@/lib/nest-client';

export const POST_PUBLISH_REQUIRES_PUBLIC_PROFILE_MSG =
  'Pro publikování příspěvků musíte mít zapnutý veřejný profil. Zapněte si jej v nastavení profilu, nebo požádejte administrátora.';

export function isUserPublicProfileEnabled(
  me: NestMeProfile | { publicProfile?: boolean } | null | undefined,
): boolean {
  return me?.publicProfile === true;
}

export function canUserPublishPosts(me: NestMeProfile | null | undefined): boolean {
  return isUserPublicProfileEnabled(me);
}

export function isAdminUserPublicProfileEnabled(user: { publicProfile?: boolean }): boolean {
  return user.publicProfile === true;
}

export function canRolePublishPosts(_role: string | null | undefined): boolean {
  return true;
}
