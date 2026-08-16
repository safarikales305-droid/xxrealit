import { CompanyDirectoryCategory } from '@prisma/client';

/** Mapování CZ-NACE kódů na interní kategorie XXREALIT. */
const NACE_PREFIX_MAP: Array<{ prefix: string; category: CompanyDirectoryCategory }> = [
  { prefix: '41', category: CompanyDirectoryCategory.STAVEBNICTVI },
  { prefix: '42', category: CompanyDirectoryCategory.STAVEBNICTVI },
  { prefix: '43', category: CompanyDirectoryCategory.STAVEBNICTVI },
  { prefix: '68', category: CompanyDirectoryCategory.REALITY },
  { prefix: '66', category: CompanyDirectoryCategory.FINANCE },
  { prefix: '64', category: CompanyDirectoryCategory.FINANCE },
  { prefix: '65', category: CompanyDirectoryCategory.FINANCE },
  { prefix: '71', category: CompanyDirectoryCategory.PROJEKTOVANI },
  { prefix: '74', category: CompanyDirectoryCategory.ARCHITEKTURA },
  { prefix: '68', category: CompanyDirectoryCategory.SPRAVA_NEMOVITOSTI },
  { prefix: '81', category: CompanyDirectoryCategory.SPRAVA_NEMOVITOSTI },
  { prefix: '43', category: CompanyDirectoryCategory.REMESLA },
  { prefix: '35', category: CompanyDirectoryCategory.DEVELOPMENT },
  { prefix: '71', category: CompanyDirectoryCategory.ENERGETIKA },
  { prefix: '66', category: CompanyDirectoryCategory.HYPOTEKA },
];

const EXACT_NACE_MAP: Record<string, CompanyDirectoryCategory> = {
  '41200': CompanyDirectoryCategory.STAVEBNICTVI,
  '41201': CompanyDirectoryCategory.STAVEBNICTVI,
  '68310': CompanyDirectoryCategory.REALITY,
  '68320': CompanyDirectoryCategory.REALITY,
  '71110': CompanyDirectoryCategory.PROJEKTOVANI,
  '71120': CompanyDirectoryCategory.ARCHITEKTURA,
  '71121': CompanyDirectoryCategory.ARCHITEKTURA,
};

export function mapAresActivitiesToCategories(
  activities: string[],
  hintCategory?: CompanyDirectoryCategory | null,
): CompanyDirectoryCategory[] {
  const found = new Set<CompanyDirectoryCategory>();

  for (const code of activities) {
    const normalized = code.trim();
    if (!normalized || normalized === '00') continue;

    const exact = EXACT_NACE_MAP[normalized];
    if (exact) {
      found.add(exact);
      continue;
    }

    for (const row of NACE_PREFIX_MAP) {
      if (normalized.startsWith(row.prefix)) {
        found.add(row.category);
      }
    }
  }

  if (hintCategory && found.size === 0) {
    found.add(hintCategory);
  }

  if (found.size === 0) {
    found.add(CompanyDirectoryCategory.OSTATNI);
  }

  return [...found];
}

export function naceCodesForCategory(
  category: CompanyDirectoryCategory,
): string[] {
  switch (category) {
    case CompanyDirectoryCategory.STAVEBNICTVI:
      return ['41', '42', '43'];
    case CompanyDirectoryCategory.REALITY:
      return ['6831', '6832', '68'];
    case CompanyDirectoryCategory.FINANCE:
      return ['64', '65', '66'];
    case CompanyDirectoryCategory.PROJEKTOVANI:
      return ['7111', '7112'];
    case CompanyDirectoryCategory.ARCHITEKTURA:
      return ['7112'];
    case CompanyDirectoryCategory.SPRAVA_NEMOVITOSTI:
      return ['6832', '81'];
    case CompanyDirectoryCategory.REMESLA:
      return ['43'];
    case CompanyDirectoryCategory.DEVELOPMENT:
      return ['41', '42'];
    case CompanyDirectoryCategory.ENERGETIKA:
      return ['35', '71'];
    case CompanyDirectoryCategory.HYPOTEKA:
      return ['6619', '6492'];
    default:
      return [];
  }
}
