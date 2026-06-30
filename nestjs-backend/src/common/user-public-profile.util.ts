export const POST_PUBLISH_REQUIRES_PUBLIC_PROFILE_MSG =
  'Pro publikování příspěvků musíte mít zapnutý veřejný profil. Zapněte si jej v nastavení profilu, nebo požádejte administrátora.';

export type UserPublicProfileSnapshot = {
  publicProfile?: boolean | null;
};

/** Uživatel má zapnutý veřejný profil — jediné kanonické pole. */
export function isUserPublicProfileEnabled(user: UserPublicProfileSnapshot): boolean {
  return user.publicProfile === true;
}

export function userPublicProfileWriteData(isPublic: boolean) {
  return {
    publicProfile: isPublic,
    isPublicBrokerProfile: isPublic,
    publicProfessionalProfile: isPublic,
    canPublishPosts: isPublic,
    showInProfessionals: isPublic,
  };
}

export function hasFilledContactPhone(input: {
  phone?: string | null;
  whatsappPhone?: string | null;
}): boolean {
  return Boolean(String(input.whatsappPhone ?? input.phone ?? '').trim());
}
