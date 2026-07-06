import type { MetaCenterSetting } from '@prisma/client';

function readEnv(name: string): string | null {
  const raw = process.env[name]?.trim();
  return raw || null;
}

const PLACEHOLDER_ID = /^(SEM_VLOZ|PLACEHOLDER|TODO|CHANGE_ME|XXX)/i;

export type MetaCenterResolvedIds = {
  businessId: string | null;
  catalogId: string | null;
  datasetId: string | null;
  pixelId: string | null;
  capiToken: string | null;
  commerceManagerId: string | null;
  adAccountId: string | null;
};

export type MetaTrackingMode = 'pixel' | 'dataset' | 'none';

export const META_DATASET_V21_MESSAGE =
  'Účet používá Meta Dataset (Graph API v21+). Pixel není vyžadován.';

export const META_PIXEL_PLACEHOLDER_MESSAGE =
  'Pixel není nastavený, používá se Dataset.';

export const META_AD_ACCOUNT_OPTIONAL_MESSAGE =
  'Reklamní účet není nastavený. Je potřeba až pro spouštění kampaní.';

export const META_CAPI_OPTIONAL_MESSAGE = 'Nenastaveno (volitelné)';

export function isPlaceholderMetaId(value: string | null | undefined): boolean {
  if (!value?.trim()) return true;
  return PLACEHOLDER_ID.test(value.trim());
}

export function sanitizeMetaPixelId(value: string | null | undefined): string | null {
  if (!value?.trim() || isPlaceholderMetaId(value)) return null;
  return value.trim();
}

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
  const rawPixel =
    readEnv('META_PIXEL_ID') ??
    readEnv('FACEBOOK_PIXEL_ID') ??
    row.pixelId?.trim() ??
    null;
  return {
    businessId: readEnv('FACEBOOK_BUSINESS_ID') ?? row.businessManagerId?.trim() ?? null,
    catalogId: readEnv('FACEBOOK_CATALOG_ID') ?? row.catalogId?.trim() ?? null,
    datasetId:
      readEnv('META_DATASET_ID') ??
      readEnv('FACEBOOK_DATASET_ID') ??
      row.datasetId?.trim() ??
      null,
    pixelId: sanitizeMetaPixelId(rawPixel),
    capiToken: readEnv('FACEBOOK_CAPI_ACCESS_TOKEN') ?? row.conversionsApiToken?.trim() ?? null,
    commerceManagerId: row.commerceManagerId?.trim() ?? row.commerceAccountId?.trim() ?? null,
    adAccountId:
      readEnv('META_AD_ACCOUNT_ID') ??
      readEnv('FACEBOOK_AD_ACCOUNT_ID') ??
      row.adAccountId?.trim() ??
      null,
  };
}

export function isOptionalMetaEnvSet(name: string): boolean {
  return Boolean(readEnv(name));
}

export function hasPlaceholderPixelEnv(): boolean {
  const raw =
    process.env.META_PIXEL_ID?.trim() ||
    process.env.FACEBOOK_PIXEL_ID?.trim() ||
    '';
  return Boolean(raw) && isPlaceholderMetaId(raw);
}
