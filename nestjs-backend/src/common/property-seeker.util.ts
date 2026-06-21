import { UserRole } from '@prisma/client';

export const PROPERTY_SEEKER_TIP_BLOCKED_MSG =
  'Tip na nemovitost je dostupný pouze uživatelům s placeným kreditem.';

export const PROPERTY_SEEKER_SHARE_REQUIRED = 5;

export const PROPERTY_SEEKER_SHARE_MESSAGE =
  'Ahoj, našel jsem realitní portál XXrealit.cz – můžeš sledovat inzeráty jako Shorts videa, klasické nabídky i příspěvky makléřů. Mrkni na to: https://www.xxrealit.cz';

export function isPropertySeeker(role: string | null | undefined): boolean {
  return role === UserRole.PROPERTY_SEEKER || role === 'PROPERTY_SEEKER';
}

export function propertySeekerOnboardingComplete(user: {
  whatsappVerified: boolean;
  shareCount: number;
  shareCompletedAt: Date | null;
}): boolean {
  if (user.shareCompletedAt) return user.whatsappVerified;
  return user.whatsappVerified && user.shareCount >= PROPERTY_SEEKER_SHARE_REQUIRED;
}
