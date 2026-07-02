export type CommunityCategoryKey =
  | 'VSE'
  | 'MAKLERI'
  | 'STAVEBNI_FIRMY'
  | 'REALITNI_KANCELARE'
  | 'FINANCNI_PORADCI'
  | 'INVESTORI'
  | 'PRACOVNICI_PORTALU';

const CATEGORY_TO_ROLE: Record<Exclude<CommunityCategoryKey, 'VSE'>, string> = {
  MAKLERI: 'AGENT',
  STAVEBNI_FIRMY: 'COMPANY',
  REALITNI_KANCELARE: 'AGENCY',
  FINANCNI_PORADCI: 'FINANCIAL_ADVISOR',
  INVESTORI: 'INVESTOR',
  PRACOVNICI_PORTALU: 'PORTAL_WORKER',
};

const ALL_FEED_ROLES =
  'AGENT,AGENCY,COMPANY,FINANCIAL_ADVISOR,INVESTOR,PORTAL_WORKER';

export function communityCategoryToAuthorRole(
  category: CommunityCategoryKey,
): string | undefined {
  if (category === 'VSE') return undefined;
  return CATEGORY_TO_ROLE[category];
}

export function communityCategoryToAuthorRolesCsv(
  category: CommunityCategoryKey,
): string | undefined {
  if (category === 'VSE') return ALL_FEED_ROLES;
  return CATEGORY_TO_ROLE[category];
}

export function professionalRoleLabel(role: string): string {
  const map: Record<string, string> = {
    AGENT: 'Makléř',
    AGENCY: 'Realitní kancelář',
    COMPANY: 'Stavební firma',
    FINANCIAL_ADVISOR: 'Finanční poradce',
    INVESTOR: 'Investor',
    PORTAL_WORKER: 'Pracovník portálu',
  };
  return map[role] ?? role;
}
