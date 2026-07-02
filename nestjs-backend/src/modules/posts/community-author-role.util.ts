import { UserRole } from '@prisma/client';

const CATEGORY_TO_ROLE: Record<string, UserRole> = {
  MAKLERI: UserRole.AGENT,
  STAVEBNI_FIRMY: UserRole.COMPANY,
  REALITNI_KANCELARE: UserRole.AGENCY,
  FINANCNI_PORADCI: UserRole.FINANCIAL_ADVISOR,
  INVESTORI: UserRole.INVESTOR,
  PRACOVNICI_PORTALU: UserRole.PORTAL_WORKER,
};

const DIRECT_ROLES = new Set<string>([
  UserRole.AGENT,
  UserRole.AGENCY,
  UserRole.COMPANY,
  UserRole.FINANCIAL_ADVISOR,
  UserRole.INVESTOR,
  UserRole.PORTAL_WORKER,
]);

/** Pro feed příspěvků: `all` / `VSE` → bez filtru role. */
export function parseCommunityFeedAuthorRole(
  categoryRaw?: string,
  authorRoleRaw?: string,
): UserRole | undefined {
  const direct = (authorRoleRaw ?? '').trim().toUpperCase();
  if (DIRECT_ROLES.has(direct)) return direct as UserRole;

  const cat = (categoryRaw ?? '').trim().toUpperCase();
  if (!cat || cat === 'VSE' || cat === 'ALL') return undefined;
  return CATEGORY_TO_ROLE[cat];
}
