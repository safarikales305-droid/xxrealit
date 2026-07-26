import type { SeoLocationKind } from '@prisma/client';

export const SEO_GENERATION_WORKER_TICK_MS = 5_000;
export const SEO_GENERATION_HEARTBEAT_MS = 15_000;
export const SEO_GENERATION_STALE_JOB_MS = 5 * 60_000;
export const SEO_GENERATION_DEFAULT_BATCH_SIZE = 100;
export const SEO_GENERATION_MIN_BATCH_SIZE = 50;
export const SEO_GENERATION_MAX_BATCH_SIZE = 200;
export const SEO_GENERATION_VERSION = 1;

export const SEO_GENERATION_JOB_STATUS = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;

export const SEO_GENERATION_JOB_TYPE = {
  TEST: 'TEST',
  BATCH: 'BATCH',
  ALL: 'ALL',
  REGENERATE_DRAFTS: 'REGENERATE_DRAFTS',
  REGENERATE_ERRORS: 'REGENERATE_ERRORS',
  REGENERATE_STALE: 'REGENERATE_STALE',
} as const;

export const SEO_LOCATION_KINDS_FOR_PAGES: SeoLocationKind[] = [
  'MESTO',
  'MESTYS',
  'OBEC',
  'MESTSKA_CAST',
];

export type SeoQualityTier = 'HIGH' | 'MEDIUM' | 'LOW';

export type SeoGenerationFilters = {
  intentSlug?: string;
  regionId?: string;
  districtId?: string;
  locationId?: string;
  onlyWithListings?: boolean;
  onlyMissing?: boolean;
  onlyNoindex?: boolean;
  qualityTiers?: SeoQualityTier[];
  limit?: number;
};

export type SeoGenerationLogEntry = {
  at: string;
  level: 'info' | 'warn' | 'error';
  message: string;
};
