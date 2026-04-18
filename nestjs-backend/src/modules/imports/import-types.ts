import type { ListingImportMethod, ListingImportPortal } from '@prisma/client';

export type ImportedListingDraft = {
  externalId: string;
  title: string;
  description: string;
  price: number;
  city: string;
  address?: string;
  images: string[];
  videoUrl?: string | null;
  offerType?: string;
  propertyType?: string;
  sourceUrl?: string;
  attributes?: Record<string, unknown>;
};

/** Syrový input ze scraperu/API parseru – může být nekompletní. */
export type RawImportedListing = {
  externalId?: unknown;
  title?: unknown;
  description?: unknown;
  price?: unknown;
  city?: unknown;
  address?: unknown;
  images?: unknown;
  videoUrl?: unknown;
  offerType?: unknown;
  propertyType?: unknown;
  sourceUrl?: unknown;
  attributes?: unknown;
};

export type ImportRunResult = {
  importedNew: number;
  importedUpdated: number;
  skipped: number;
  disabled: number;
  errors: string[];
  /** Varování (např. prázdný výsledek, nejspíš špatná URL stránky). */
  warnings?: string[];
  /** Krátká zpráva pro admin UI. */
  summary?: string | null;
  /** Metriky běhu (scraping, normalizace). */
  stats?: {
    startUrl?: string;
    finalUrl?: string;
    rawCandidates?: number;
    normalizedValid?: number;
    parseMethod?: string;
    requestLog?: unknown;
    listPage429Count?: number;
    detailPage429Count?: number;
    detailFetchesAttempted?: number;
    detailFetchesCompleted?: number;
    scraperSettings?: unknown;
  };
};

export type ImportExecutionContext = {
  portal: ListingImportPortal;
  method: ListingImportMethod;
  sourceId: string;
  sourceName: string;
  limitPerRun: number;
  endpointUrl?: string | null;
  credentialsJson?: Record<string, unknown> | null;
  settingsJson?: Record<string, unknown> | null;
};

