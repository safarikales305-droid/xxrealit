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
};

export function dashboardPathForRole(role: UserRole): string {
  return `/dashboard/${DASHBOARD_SEGMENTS[role]}`;
}
