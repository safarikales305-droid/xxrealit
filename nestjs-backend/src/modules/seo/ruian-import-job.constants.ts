/** Stavy RÚIAN import jobu v SeoLocationImportRun.status */
export const RUIAN_JOB_STATUS = {
  QUEUED: 'QUEUED',
  DISCOVERING: 'DISCOVERING',
  DOWNLOADING: 'DOWNLOADING',
  EXTRACTING: 'EXTRACTING',
  PARSING: 'PARSING',
  SAVING: 'SAVING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  INTERRUPTED: 'INTERRUPTED',
  EMPTY_IMPORT: 'EMPTY_IMPORT',
} as const;

export type RuianJobStatus = (typeof RUIAN_JOB_STATUS)[keyof typeof RUIAN_JOB_STATUS];

export const RUIAN_IMPORT_SCOPE = {
  SEO: 'seo',
  ADDRESSES: 'addresses',
  FULL: 'full',
} as const;

export type RuianImportScope = (typeof RUIAN_IMPORT_SCOPE)[keyof typeof RUIAN_IMPORT_SCOPE];

/** SEO lokality — bez ulic a adresních míst (miliony záznamů) */
export const RUIAN_SEO_ELEMENT_TYPES = new Set([
  'Vusc',
  'Kraj',
  'Okres',
  'Orp',
  'POU',
  'Obec',
  'CastObce',
  'Momc',
  'MestskaCast',
  'KatastralniUzemi',
]);

/** Kompletní adresní import */
export const RUIAN_ADDRESS_ELEMENT_TYPES = new Set(['Ulice', 'AdresniMisto']);

export const RUIAN_FULL_ELEMENT_TYPES = new Set([
  ...RUIAN_SEO_ELEMENT_TYPES,
  ...RUIAN_ADDRESS_ELEMENT_TYPES,
]);

export const RUIAN_IMPORT_PHASES_SEO = [
  'kraje',
  'okresy',
  'orp',
  'obce',
  'casti_obci',
  'katastry',
] as const;

export const RUIAN_BATCH_SIZE = 500;
export const RUIAN_HEARTBEAT_MS = 20_000;
export const RUIAN_STALE_JOB_MS = 120_000;
export const RUIAN_WORKER_TICK_MS = 5_000;

export type RuianJobCheckpoint = {
  completedPhases?: string[];
  currentPhase?: string;
  parsedRecords?: number;
  memoryMb?: number;
  lastOfficialCode?: string;
};

export type RuianJobLogEntry = {
  at: string;
  level: 'info' | 'warn' | 'error';
  step: string;
  message: string;
  meta?: Record<string, unknown>;
};
