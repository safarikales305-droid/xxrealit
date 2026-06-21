import { UserRole } from '@prisma/client';

export const EMAIL_ALREADY_REGISTERED_MSG = 'Tento e-mail je již registrovaný.';
export const WHATSAPP_ALREADY_USED_MSG =
  'Toto WhatsApp číslo je již použité u jiného účtu.';
export const ICO_ALREADY_USED_MSG = 'Toto IČO je již použité u jiného účtu.';

/** Role, u kterých je IČO unikátní napříč účty. */
export const ICO_UNIQUE_ROLES: readonly UserRole[] = [
  UserRole.AGENT,
  UserRole.AGENCY,
  UserRole.COMPANY,
  UserRole.INVESTOR,
  UserRole.FINANCIAL_ADVISOR,
  UserRole.PORTAL_WORKER,
];

export function normalizeProfileIco(ico: string | null | undefined): string | null {
  const t = (ico ?? '').trim();
  return t.length > 0 ? t : null;
}

export function isIcoUniqueRole(role: UserRole): boolean {
  return (ICO_UNIQUE_ROLES as readonly string[]).includes(role);
}
