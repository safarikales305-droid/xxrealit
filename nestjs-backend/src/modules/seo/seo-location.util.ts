/**
 * Normalizace textu pro SEO slug (bez diakritiky).
 */
export function foldSeoAscii(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function buildSeoLocationSlug(name: string, officialCode?: string): string {
  const base = foldSeoAscii(name);
  if (!base && officialCode) return `loc-${officialCode}`;
  return base || 'lokalita';
}

export type SeoLocationImportRow = {
  officialCode: string;
  name: string;
  slug?: string;
  slugAscii?: string;
  locative?: string;
  kind: string;
  parentOfficialCode?: string | null;
  regionOfficialCode?: string | null;
  districtOfficialCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  population?: number | null;
  psc?: string | null;
  cadastreCode?: string | null;
  searchTerms?: string[];
  isActive?: boolean;
};

export function normalizeSeoLocationKind(raw: string): string {
  const k = raw.trim().toUpperCase().replace(/-/g, '_');
  const map: Record<string, string> = {
    KRAJ: 'KRAJ',
    OKRES: 'OKRES',
    ORP: 'ORP',
    MESTO: 'MESTO',
    MĚSTO: 'MESTO',
    MESTYS: 'MESTYS',
    MĚSTYS: 'MESTYS',
    OBEC: 'OBEC',
    VESNICE: 'OBEC',
    MESTSKA_CAST: 'MESTSKA_CAST',
    'MĚSTSKÁ_ČÁST': 'MESTSKA_CAST',
    CAST_OBCE: 'CAST_OBCE',
    'ČÁST_OBCE': 'CAST_OBCE',
    KATASTR: 'KATASTR',
    PSC: 'PSC',
    PSČ: 'PSC',
    LOKALITA: 'LOKALITA',
  };
  return map[k] ?? 'OBEC';
}

export function buildProgrammaticSeoPageKey(intentSlug: string, locationSlug: string): string {
  return `${intentSlug}:${locationSlug}`;
}
