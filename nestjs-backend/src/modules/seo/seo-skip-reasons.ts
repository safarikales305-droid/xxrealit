export const SEO_SKIP_REASONS = [
  'DUPLICATE_SLUG',
  'DUPLICATE_COMBINATION',
  'ALREADY_EXISTS',
  'MISSING_LOCALITY',
  'MISSING_LOCALITY_CODE',
  'MISSING_PROPERTY_TYPE',
  'INVALID_COMBINATION',
  'LOW_QUALITY',
  'NO_LISTINGS',
  'NO_RUIAN_DATA',
  'NO_CSU_DATA',
  'NO_TEMPLATE',
  'INVALID_SLUG',
  'NOT_INDEXABLE',
  'FILTERED_BY_JOB',
  'LOCKED_CONTENT',
  'DATABASE_CONFLICT',
  'UNKNOWN',
] as const;

export type SeoSkipReason = (typeof SEO_SKIP_REASONS)[number];

export const SEO_SKIP_REASON_LABELS: Record<SeoSkipReason, string> = {
  DUPLICATE_SLUG: 'Duplicitní slug',
  DUPLICATE_COMBINATION: 'Duplicitní kombinace',
  ALREADY_EXISTS: 'Stránka již existuje',
  MISSING_LOCALITY: 'Chybí lokalita',
  MISSING_LOCALITY_CODE: 'Chybí kód lokality',
  MISSING_PROPERTY_TYPE: 'Chybí typ nemovitosti',
  INVALID_COMBINATION: 'Neplatná kombinace',
  LOW_QUALITY: 'Nízká kvalita lokality (filtr jobu)',
  NO_LISTINGS: 'Bez inzerátů',
  NO_RUIAN_DATA: 'Chybí data RÚIAN',
  NO_CSU_DATA: 'Chybí data ČSÚ',
  NO_TEMPLATE: 'Chybí šablona',
  INVALID_SLUG: 'Neplatný slug',
  NOT_INDEXABLE: 'Není indexovatelná',
  FILTERED_BY_JOB: 'Filtrováno nastavením jobu',
  LOCKED_CONTENT: 'Obsah je zamčený',
  DATABASE_CONFLICT: 'Konflikt v databázi',
  UNKNOWN: 'Neznámý důvod',
};

export type SeoSkippedItemDetail = {
  at: string;
  reason: SeoSkipReason;
  intentSlug: string;
  locationSlug: string;
  locationName?: string;
  offerType?: string;
  propertyType?: string;
  expectedSlug?: string;
  existingPageId?: string;
  message: string;
};

export type SeoJobResultItem = {
  at: string;
  action: 'created' | 'updated';
  pageId: string;
  title: string | null;
  slug: string;
  publicUrl: string;
  adminPreviewUrl: string;
  status: string;
  indexable: boolean;
  intentSlug: string;
  locationName?: string;
};

export type SeoGenerationJobMeta = {
  logs?: Array<{ at: string; level: 'info' | 'warn' | 'error'; message: string }>;
  skipReasons?: Partial<Record<SeoSkipReason, number>>;
  skippedDetails?: SeoSkippedItemDetail[];
  recentResults?: SeoJobResultItem[];
};

export function incrementSkipReason(
  counts: Partial<Record<SeoSkipReason, number>>,
  reason: SeoSkipReason,
): Partial<Record<SeoSkipReason, number>> {
  return { ...counts, [reason]: (counts[reason] ?? 0) + 1 };
}
