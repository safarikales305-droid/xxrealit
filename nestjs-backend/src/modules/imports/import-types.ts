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

export type ImportRunResult = {
  importedNew: number;
  importedUpdated: number;
  skipped: number;
  disabled: number;
  errors: string[];
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

