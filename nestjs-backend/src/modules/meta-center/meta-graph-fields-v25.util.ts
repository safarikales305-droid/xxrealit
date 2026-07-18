import type { MetaGraphResult } from './meta-graph-client.service';

export type MetaGraphFetcher = {
  get<T>(path: string, token: string, query?: Record<string, string>): Promise<MetaGraphResult<T>>;
};

/** Graph API v25 — pouze podporovaná pole (bez owner_business, tasks, …). */
export const META_GRAPH_V25_FIELDS = {
  adAccount:
    'id,name,account_status,disable_reason,currency,timezone_name,business,amount_spent,balance,spend_cap',
  adAccountMinimal: 'id,name,account_status,currency,timezone_name',
  page: 'id,name,link',
  pageMinimal: 'id,name',
  business: 'id,name',
  catalog: 'id,name,business{id,name}',
  catalogMinimal: 'id,name',
  pixel: 'id,name',
  productSet: 'id,name,product_catalog{id,name}',
  creative:
    'id,name,account_id,object_story_spec,product_set_id,effective_object_story_id,status',
  adSet:
    'id,name,account_id,campaign_id,status,effective_status,promoted_object,targeting,billing_event,optimization_goal',
  me: 'id,name',
  permissions: 'permission,status',
  adPixelList: 'id,name,last_fired_time',
} as const;

export const META_GRAPH_UNSUPPORTED_FIELDS_WARNING_CS =
  'Některá diagnostická pole nejsou ve verzi Graph API v25 podporována.';

export const META_GRAPH_V25_FIELD_CATALOG: Array<{
  resource: string;
  endpoint: string;
  fields: string;
  fallbackFields?: string;
}> = [
  { resource: 'Ad Account', endpoint: 'GET /act_{ad_account_id}', fields: META_GRAPH_V25_FIELDS.adAccount, fallbackFields: META_GRAPH_V25_FIELDS.adAccountMinimal },
  { resource: 'User', endpoint: 'GET /me', fields: META_GRAPH_V25_FIELDS.me },
  { resource: 'Permissions', endpoint: 'GET /me/permissions', fields: META_GRAPH_V25_FIELDS.permissions },
  { resource: 'Facebook Page', endpoint: 'GET /{page_id}', fields: META_GRAPH_V25_FIELDS.page, fallbackFields: META_GRAPH_V25_FIELDS.pageMinimal },
  { resource: 'Business', endpoint: 'GET /{business_id}', fields: META_GRAPH_V25_FIELDS.business },
  { resource: 'Catalog', endpoint: 'GET /{catalog_id}', fields: META_GRAPH_V25_FIELDS.catalog, fallbackFields: META_GRAPH_V25_FIELDS.catalogMinimal },
  { resource: 'Product Set', endpoint: 'GET /{product_set_id}', fields: META_GRAPH_V25_FIELDS.productSet },
  { resource: 'Pixel / Dataset', endpoint: 'GET /{pixel_id}', fields: META_GRAPH_V25_FIELDS.pixel },
  { resource: 'Ad Creative', endpoint: 'GET /{creative_id}', fields: META_GRAPH_V25_FIELDS.creative },
  { resource: 'Ad Set', endpoint: 'GET /{ad_set_id}', fields: META_GRAPH_V25_FIELDS.adSet },
  { resource: 'Pixel list (BM)', endpoint: 'GET /{business_id}/adspixels', fields: META_GRAPH_V25_FIELDS.adPixelList },
];

export function isGraphUnsupportedFieldsError(result: MetaGraphResult<unknown>): boolean {
  if (result.ok) return false;
  if (result.errorCode !== '100') return false;
  const msg = (result.errorMessage ?? '').toLowerCase();
  return (
    msg.includes('nonexistent field') ||
    msg.includes('unsupported field') ||
    msg.includes('(#100)')
  );
}

export type GraphGetWithFieldFallbackResult<T> = {
  result: MetaGraphResult<T>;
  requestedFields: string;
  unsupportedFieldsSkipped: boolean;
  skippedFields: string[];
};

export async function graphGetWithV25FieldFallback<T>(
  graph: MetaGraphFetcher,
  path: string,
  token: string,
  fields: string,
  fallbackFields?: string,
): Promise<GraphGetWithFieldFallbackResult<T>> {
  const primary = await graph.get<T>(path, token, { fields });
  if (primary.ok || !isGraphUnsupportedFieldsError(primary)) {
    return {
      result: primary,
      requestedFields: fields,
      unsupportedFieldsSkipped: false,
      skippedFields: [],
    };
  }

  const minimal = fallbackFields ?? fields.split(',')[0] ?? 'id';
  if (minimal === fields) {
    return {
      result: primary,
      requestedFields: fields,
      unsupportedFieldsSkipped: true,
      skippedFields: fields.split(',').slice(1),
    };
  }

  const retry = await graph.get<T>(path, token, { fields: minimal });
  const skipped = fields
    .split(',')
    .map((f) => f.trim())
    .filter((f) => !minimal.split(',').map((x) => x.trim()).includes(f));

  return {
    result: retry,
    requestedFields: retry.ok ? minimal : fields,
    unsupportedFieldsSkipped: true,
    skippedFields: skipped,
  };
}

export function unsupportedFieldsWarningCheck(
  key: string,
  skippedFields: string[],
): import('./meta-ad-preflight.util').MetaPreflightCheck | null {
  if (!skippedFields.length) return null;
  return {
    key: `diagnostics_fields_${key}`,
    ok: true,
    severity: 'warning',
    message: META_GRAPH_UNSUPPORTED_FIELDS_WARNING_CS,
    details: { skippedFields, graphApiVersion: 'v25.0' },
  };
}
