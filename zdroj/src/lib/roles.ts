/** Mirrors stored `User.role` — used by middleware JWT and UI. */
export const USER_ROLES = [
  'makler',
  'kancelar',
  'remeslnik',
  'firma',
  'uzivatel',
  'sledujici',
  'soukromy',
  'stavebni_firma',
  /** Prisma / Nest enum strings from API */
  'USER',
  'AGENT',
  'COMPANY',
  'AGENCY',
  'DEVELOPER',
  'PRIVATE_SELLER',
  'ADMIN',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export function isUserRole(v: string): v is UserRole {
  return (USER_ROLES as readonly string[]).includes(v);
}

export const ROLE_LABELS: Record<UserRole, string> = {
  makler: 'Makléř',
  kancelar: 'Kancelář / realitní kancelář',
  remeslnik: 'Řemeslník',
  firma: 'Firma',
  uzivatel: 'Uživatel',
  sledujici: 'Sledující / zájemce',
  soukromy: 'Soukromý prodejce',
  stavebni_firma: 'Stavební firma',
  USER: 'Soukromý inzerent',
  AGENT: 'Realitní makléř',
  COMPANY: 'Stavební firma',
  AGENCY: 'Realitní kancelář',
  DEVELOPER: 'Developer',
  PRIVATE_SELLER: 'Soukromý prodejce',
  ADMIN: 'Administrátor',
};

export const DASHBOARD_SEGMENTS: Record<UserRole, string> = {
  makler: 'makler',
  kancelar: 'kancelar',
  remeslnik: 'remeslnik',
  firma: 'firma',
  uzivatel: 'uzivatel',
  sledujici: 'sledujici',
  soukromy: 'soukromy',
  stavebni_firma: 'stavebni_firma',
  USER: 'USER',
  AGENT: 'AGENT',
  COMPANY: 'COMPANY',
  AGENCY: 'AGENCY',
  DEVELOPER: 'stavebni_firma',
  PRIVATE_SELLER: 'uzivatel',
  ADMIN: 'ADMIN',
};

export function dashboardPathForRole(role: UserRole): string {
  return `/dashboard/${DASHBOARD_SEGMENTS[role]}`;
}

/** Role, které mohou podat žádost o převod na makléře (Nest + UI musí být v souladu). */
export const PROFESSIONAL_UPGRADE_ELIGIBLE_ROLES = [
  'USER',
  'PRIVATE_SELLER',
  'DEVELOPER',
] as const;

/** Uživatel ještě není profesionální profil ani admin — může vidět sekci „Rozšířit účet“. */
export function canRequestProfessionalProfileUpgrade(role: string | undefined | null): boolean {
  if (!role) return false;
  if (role === 'AGENT' || role === 'COMPANY' || role === 'AGENCY' || role === 'ADMIN') return false;
  return (PROFESSIONAL_UPGRADE_ELIGIBLE_ROLES as readonly string[]).includes(role);
}
