import { UserRole } from '@prisma/client';

/** Role s přístupem ke Komunikačnímu centru. */
export const COMMUNICATION_ROLES: UserRole[] = [
  UserRole.AGENT,
  UserRole.AGENCY,
  UserRole.COMPANY,
  UserRole.INVESTOR,
  UserRole.FINANCIAL_ADVISOR,
  UserRole.CRAFTSMAN,
  UserRole.ADMIN,
];

export function isCommunicationRole(role: UserRole | string | null | undefined): boolean {
  if (!role) return false;
  return COMMUNICATION_ROLES.includes(role as UserRole);
}
