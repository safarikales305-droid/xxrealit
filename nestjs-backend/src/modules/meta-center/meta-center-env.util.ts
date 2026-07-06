import type { MetaCenterSetting } from '@prisma/client';

function readEnv(name: string): string | null {
  const raw = process.env[name]?.trim();
  return raw || null;
}

export type MetaCenterResolvedIds = {
  businessId: string | null;
  catalogId: string | null;
  datasetId: string | null;
  pixelId: string | null;
  capiToken: string | null;
  commerceManagerId: string | null;
};

export type MetaTrackingMode = 'pixel' | 'dataset' | 'none';

export const META_DATASET_V21_MESSAGE =
  'Účet používá Meta Dataset (Graph API v21+). Pixel není vyžadován.';

export const META_CAPI_OPTIONAL_MESSAGE = 'Nenastaveno (volitelné)';

/** Pixel má přednost; bez Pixelu se použije Dataset (Graph API v21+). */
export function resolveMetaTrackingMode(ids: MetaCenterResolvedIds): MetaTrackingMode {
  if (ids.pixelId) return 'pixel';
  if (ids.datasetId) return 'dataset';
  return 'none';
}

export function resolvePrimaryEventSourceId(ids: MetaCenterResolvedIds): string | null {
  return ids.pixelId ?? ids.datasetId ?? null;
}

export function hasMetaEventTracking(ids: MetaCenterResolvedIds): boolean {
  return Boolean(ids.pixelId || ids.datasetId);
}

/** ENV má přednost před hodnotami uloženými po Meta Connect. */
export function resolveMetaCenterIds(row: MetaCenterSetting): MetaCenterResolvedIds {
  return {
    businessId: readEnv('FACEBOOK_BUSINESS_ID') ?? row.businessManagerId?.trim() ?? null,
    catalogId: readEnv('FACEBOOK_CATALOG_ID') ?? row.catalogId?.trim() ?? null,
    datasetId: readEnv('FACEBOOK_DATASET_ID') ?? row.datasetId?.trim() ?? null,
    pixelId: readEnv('FACEBOOK_PIXEL_ID') ?? row.pixelId?.trim() ?? null,
    capiToken: readEnv('FACEBOOK_CAPI_ACCESS_TOKEN') ?? row.conversionsApiToken?.trim() ?? null,
    commerceManagerId: row.commerceManagerId?.trim() ?? row.commerceAccountId?.trim() ?? null,
  };
}

export function isOptionalMetaEnvSet(name: string): boolean {
  return Boolean(readEnv(name));
}
