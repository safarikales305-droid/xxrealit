import { CompanyDirectoryCategory } from '@prisma/client';

export const COMPANY_DIRECTORY_ENABLED =
  (process.env.COMPANY_DIRECTORY_ENABLED ?? 'true').toLowerCase() === 'true';

export const ARES_IMPORT_ENABLED =
  (process.env.ARES_IMPORT_ENABLED ?? 'true').toLowerCase() === 'true';

export const GOOGLE_COMPANY_ENRICHMENT_ENABLED =
  (process.env.GOOGLE_COMPANY_ENRICHMENT_ENABLED ?? 'true').toLowerCase() === 'true';

export const COMPANY_REVIEWS_ENABLED =
  (process.env.COMPANY_REVIEWS_ENABLED ?? 'true').toLowerCase() === 'true';

export const COMPANY_REVIEW_MEDIA_ENABLED =
  (process.env.COMPANY_REVIEW_MEDIA_ENABLED ?? 'true').toLowerCase() === 'true';

export const COMPANY_REVIEW_SOCIAL_PUBLISHING_ENABLED =
  (process.env.COMPANY_REVIEW_SOCIAL_PUBLISHING_ENABLED ?? 'true').toLowerCase() === 'true';

export const AI_REVIEW_ANALYSIS_ENABLED =
  (process.env.AI_REVIEW_ANALYSIS_ENABLED ?? 'false').toLowerCase() === 'true';

export const COMPANY_CONTACT_DISCOVERY_ENABLED =
  (process.env.COMPANY_CONTACT_DISCOVERY_ENABLED ?? 'false').toLowerCase() === 'true';

export const COMPANY_OUTREACH_ENABLED =
  (process.env.COMPANY_OUTREACH_ENABLED ?? 'false').toLowerCase() === 'true';

export const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY?.trim() ?? '';

export const GOOGLE_PLACES_CACHE_TTL_MS = Math.max(
  3_600_000,
  Number(process.env.GOOGLE_PLACES_CACHE_TTL_MS ?? 3_600_000) || 3_600_000,
);

export const GOOGLE_ENRICHMENT_BATCH_SIZE = Math.max(
  1,
  Math.min(10, Number(process.env.GOOGLE_ENRICHMENT_BATCH_SIZE ?? 3) || 3),
);

export const GOOGLE_ENRICHMENT_DELAY_MS = Math.max(
  500,
  Number(process.env.GOOGLE_ENRICHMENT_DELAY_MS ?? 2000) || 2000,
);

export const CONTACT_DISCOVERY_BATCH_SIZE = Math.max(
  1,
  Math.min(10, Number(process.env.CONTACT_DISCOVERY_BATCH_SIZE ?? 1) || 1),
);

export const CONTACT_DISCOVERY_DELAY_MS = Math.max(
  500,
  Number(process.env.CONTACT_DISCOVERY_DELAY_MS ?? 3000) || 3000,
);

export const ARES_IMPORT_BATCH_SIZE = Math.max(
  1,
  Math.min(50, Number(process.env.ARES_IMPORT_BATCH_SIZE ?? 10) || 10),
);

export const ARES_IMPORT_DELAY_MS = Math.max(
  200,
  Number(process.env.ARES_IMPORT_DELAY_MS ?? 1500) || 1500,
);

export const ARES_IMPORT_MAX_REQUESTS_PER_RUN = Math.max(
  1,
  Number(process.env.ARES_IMPORT_MAX_REQUESTS_PER_RUN ?? 20) || 20,
);

export const ARES_BASE_URL =
  process.env.ARES_BASE_URL?.replace(/\/$/, '') ??
  'https://ares.gov.cz/ekonomicke-subjekty-v-be/rest';

export const ARES_WORKER_TICK_MS = 5000;

export const CZECH_REGIONS: Array<{ code: number; name: string }> = [
  { code: 19, name: 'Hlavní město Praha' },
  { code: 27, name: 'Středočeský kraj' },
  { code: 35, name: 'Jihočeský kraj' },
  { code: 43, name: 'Plzeňský kraj' },
  { code: 51, name: 'Karlovarský kraj' },
  { code: 60, name: 'Ústecký kraj' },
  { code: 78, name: 'Liberecký kraj' },
  { code: 86, name: 'Královéhradecký kraj' },
  { code: 94, name: 'Pardubický kraj' },
  { code: 108, name: 'Vysočina' },
  { code: 116, name: 'Jihomoravský kraj' },
  { code: 124, name: 'Olomoucký kraj' },
  { code: 132, name: 'Zlínský kraj' },
  { code: 141, name: 'Moravskoslezský kraj' },
];

export const CATEGORY_LABELS: Record<CompanyDirectoryCategory, string> = {
  STAVEBNICTVI: 'Stavebnictví',
  REALITY: 'Reality',
  FINANCE: 'Finance',
  PROJEKTOVANI: 'Projektování',
  ARCHITEKTURA: 'Architektura',
  SPRAVA_NEMOVITOSTI: 'Správa nemovitostí',
  REMESLA: 'Řemesla',
  DEVELOPMENT: 'Development',
  ENERGETIKA: 'Energetika',
  HYPOTEKA: 'Hypoteční služby',
  OSTATNI: 'Ostatní',
};

export const CATEGORY_SLUG_PREFIX: Record<CompanyDirectoryCategory, string> = {
  STAVEBNICTVI: 'stavebni-firma',
  REALITY: 'realitni-kancelar',
  FINANCE: 'financni-poradce',
  PROJEKTOVANI: 'projektant',
  ARCHITEKTURA: 'architekt',
  SPRAVA_NEMOVITOSTI: 'spravce-nemovitosti',
  REMESLA: 'remeslnik',
  DEVELOPMENT: 'developer',
  ENERGETIKA: 'energeticky-specialista',
  HYPOTEKA: 'hypotecni-specialista',
  OSTATNI: 'firma',
};
