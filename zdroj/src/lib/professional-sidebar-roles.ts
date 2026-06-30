/** Role zobrazené v boxu Profesionálové (sidebar + katalog). */
export const PROFESSIONAL_SIDEBAR_ROLES = [
  'AGENT',
  'AGENCY',
  'COMPANY',
  'CRAFTSMAN',
  'FINANCIAL_ADVISOR',
  'INVESTOR',
  'PORTAL_WORKER',
] as const;

export type ProfessionalSidebarRole = (typeof PROFESSIONAL_SIDEBAR_ROLES)[number];

export function professionalSidebarRolesQuery(): string {
  return PROFESSIONAL_SIDEBAR_ROLES.join(',');
}

export function professionalRoleLabel(role: string | null | undefined): string {
  switch (String(role ?? '').toUpperCase()) {
    case 'AGENT':
      return 'Makléř';
    case 'AGENCY':
      return 'Realitní kancelář';
    case 'COMPANY':
      return 'Stavební firma';
    case 'CRAFTSMAN':
      return 'Řemeslník';
    case 'FINANCIAL_ADVISOR':
      return 'Finanční poradce';
    case 'INVESTOR':
      return 'Investor';
    case 'PORTAL_WORKER':
      return 'Pracovník portálu';
    default:
      return 'Profesionál';
  }
}
