import { UserRole } from '@prisma/client';

const KNOWN: readonly string[] = [
  UserRole.USER,
  UserRole.AGENT,
  UserRole.COMPANY,
  UserRole.AGENCY,
  UserRole.DEVELOPER,
  UserRole.PRIVATE_SELLER,
  UserRole.ADMIN,
];

/**
 * Ochrana proti neplatné / chybějící roli z DB nebo starým JWT (nesmí shodit runtime).
 */
export function ensureUserRole(
  role: UserRole | string | null | undefined,
): UserRole {
  if (role != null && KNOWN.includes(role as string)) {
    return role as UserRole;
  }
  return UserRole.USER;
}
