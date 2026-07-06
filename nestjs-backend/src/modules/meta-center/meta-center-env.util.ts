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
