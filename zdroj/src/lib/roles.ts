/** Mirrors `UserRole` in Prisma — keep paths `/dashboard/{value}` in sync. */
export const USER_ROLES = [
  'makler',
  'kancelar',
  'sledujici',
  'soukromy',
  'remeslnik',
  'stavebni_firma',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export function isUserRole(v: string): v is UserRole {
  return (USER_ROLES as readonly string[]).includes(v);
}

export const ROLE_LABELS: Record<UserRole, string> = {
  makler: 'Makléř',
  kancelar: 'Kancelář / realitní kancelář',
  sledujici: 'Sledující / zájemce',
  soukromy: 'Soukromý prodejce',
  remeslnik: 'Řemeslník',
  stavebni_firma: 'Stavební firma',
};

export const DASHBOARD_SEGMENTS: Record<UserRole, string> = {
  makler: 'makler',
  kancelar: 'kancelar',
  sledujici: 'sledujici',
  soukromy: 'soukromy',
  remeslnik: 'remeslnik',
  stavebni_firma: 'stavebni_firma',
};

export function dashboardPathForRole(role: UserRole): string {
  return `/dashboard/${DASHBOARD_SEGMENTS[role]}`;
}
