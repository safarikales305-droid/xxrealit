export type CommunityCategoryKey =
  | 'VSE'
  | 'MAKLERI'
  | 'STAVEBNI_FIRMY'
  | 'REALITNI_KANCELARE'
  | 'FINANCNI_PORADCI'
  | 'INVESTORI'
  | 'DEVELOPERI'
  | 'PROJEKTANTI'
  | 'ARCHITEKTI'
  | 'REMESLNIKI'
  | 'DALSI_PROFESIONALOVE'
  | 'PRACOVNICI_PORTALU';

const CATEGORY_TO_ROLE: Partial<Record<Exclude<CommunityCategoryKey, 'VSE' | 'DALSI_PROFESIONALOVE'>, string>> = {
  MAKLERI: 'AGENT',
  STAVEBNI_FIRMY: 'COMPANY',
  REALITNI_KANCELARE: 'AGENCY',
  FINANCNI_PORADCI: 'FINANCIAL_ADVISOR',
  INVESTORI: 'INVESTOR',
  DEVELOPERI: 'DEVELOPER',
  REMESLNIKI: 'CRAFTSMAN',
  PRACOVNICI_PORTALU: 'PORTAL_WORKER',
};

const CATEGORY_TO_COMPANY: Partial<Record<CommunityCategoryKey, string>> = {
  STAVEBNI_FIRMY: 'STAVEBNICTVI',
  REALITNI_KANCELARE: 'REALITY',
  FINANCNI_PORADCI: 'FINANCE',
  DEVELOPERI: 'DEVELOPMENT',
  PROJEKTANTI: 'PROJEKTOVANI',
  ARCHITEKTI: 'ARCHITEKTURA',
  REMESLNIKI: 'REMESLA',
};

const ALL_FEED_ROLES =
  'AGENT,AGENCY,COMPANY,FINANCIAL_ADVISOR,INVESTOR,DEVELOPER,CRAFTSMAN,PORTAL_WORKER';

export function communityCategoryToAuthorRole(
  category: CommunityCategoryKey,
): string | undefined {
  if (category === 'VSE' || category === 'DALSI_PROFESIONALOVE') return undefined;
  if (category === 'PROJEKTANTI' || category === 'ARCHITEKTI') return undefined;
  return CATEGORY_TO_ROLE[category];
}

export function communityCategoryToAuthorRolesCsv(
  category: CommunityCategoryKey,
): string | undefined {
  if (category === 'VSE' || category === 'DALSI_PROFESIONALOVE') return ALL_FEED_ROLES;
  if (category === 'PROJEKTANTI' || category === 'ARCHITEKTI') return ALL_FEED_ROLES;
  return CATEGORY_TO_ROLE[category];
}

export function communityCategoryToCompanyCategory(
  category: CommunityCategoryKey,
): string | undefined {
  return CATEGORY_TO_COMPANY[category];
}

export function professionalRoleLabel(role: string): string {
  const map: Record<string, string> = {
    AGENT: 'Makléř',
    AGENCY: 'Realitní kancelář',
    COMPANY: 'Stavební firma',
    FINANCIAL_ADVISOR: 'Finanční poradce',
    INVESTOR: 'Investor',
    DEVELOPER: 'Developer',
    CRAFTSMAN: 'Řemeslník',
    PORTAL_WORKER: 'Pracovník portálu',
  };
  return map[role] ?? role;
}

export function companyCategoryLabel(category?: string | null): string {
  const map: Record<string, string> = {
    STAVEBNICTVI: 'Stavební firma',
    REALITY: 'Realitní kancelář',
    FINANCE: 'Finanční poradce',
    PROJEKTOVANI: 'Projektant',
    ARCHITEKTURA: 'Architekt',
    SPRAVA_NEMOVITOSTI: 'Správce nemovitostí',
    REMESLA: 'Řemeslník',
    DEVELOPMENT: 'Developer',
    ENERGETIKA: 'Energetický specialista',
    HYPOTEKA: 'Hypoteční specialista',
    OSTATNI: 'Firma',
  };
  return category ? map[category] ?? category : 'Firma';
}
