import {
  graphGetWithV25FieldFallback,
  META_GRAPH_V25_FIELDS,
  META_GRAPH_UNSUPPORTED_FIELDS_WARNING_CS,
  unsupportedFieldsWarningCheck,
  type MetaGraphFetcher,
} from './meta-graph-fields-v25.util';

export type { MetaGraphFetcher };

export type MetaPreflightSeverity = 'info' | 'warning' | 'error';

export type MetaPreflightCheck = {
  key: string;
  ok: boolean;
  severity: MetaPreflightSeverity;
  message: string;
  details?: Record<string, unknown>;
};

export type MetaAdPreflightContext = {
  adAccountId: string;
  businessId: string | null;
  pageId: string | null;
  catalogId: string | null;
  productSetId: string | null;
  pixelId: string | null;
  campaignId: string | null;
  adSetId: string | null;
  creativeId: string | null;
  graphApiVersion: string;
};

function extractCreativePageId(objectStorySpec: unknown): string | null {
  if (!objectStorySpec || typeof objectStorySpec !== 'object') return null;
  const spec = objectStorySpec as Record<string, unknown>;
  const pageId = spec.page_id;
  return typeof pageId === 'string' && pageId.trim() ? pageId.trim() : null;
}

function check(
  key: string,
  ok: boolean,
  message: string,
  severity: MetaPreflightSeverity = ok ? 'info' : 'error',
  details?: Record<string, unknown>,
): MetaPreflightCheck {
  return { key, ok, severity, message, ...(details ? { details } : {}) };
}

function actPath(adAccountId: string): string {
  const id = adAccountId.replace(/^act_/, '');
  return `/act_${id}`;
}

function normalizeActId(adAccountId: string): string {
  return adAccountId.replace(/^act_/, '');
}

function pushFieldWarnings(
  checks: MetaPreflightCheck[],
  resourceKey: string,
  skippedFields: string[],
): void {
  const warning = unsupportedFieldsWarningCheck(resourceKey, skippedFields);
  if (warning) checks.push(warning);
}

export function summarizePreflightChecks(checks: MetaPreflightCheck[]): {
  ok: boolean;
  errorCount: number;
  warningCount: number;
  message: string;
  hasUnsupportedFieldsWarning: boolean;
} {
  const errors = checks.filter((c) => !c.ok && c.severity === 'error');
  const warnings = checks.filter((c) => !c.ok && c.severity === 'warning');
  const fieldWarnings = checks.filter((c) =>
    c.key.startsWith('diagnostics_fields_'),
  );
  const hasUnsupportedFieldsWarning = fieldWarnings.length > 0;

  if (errors.length) {
    return {
      ok: false,
      errorCount: errors.length,
      warningCount: warnings.length + fieldWarnings.length,
      message: errors.map((c) => c.message).join(' '),
      hasUnsupportedFieldsWarning,
    };
  }

  const warningMessages = [
    ...warnings.map((c) => c.message),
    ...(hasUnsupportedFieldsWarning
      ? [META_GRAPH_UNSUPPORTED_FIELDS_WARNING_CS]
      : []),
  ];

  if (warningMessages.length) {
    return {
      ok: true,
      errorCount: 0,
      warningCount: warningMessages.length,
      message: [...new Set(warningMessages)].join(' '),
      hasUnsupportedFieldsWarning,
    };
  }

  return {
    ok: true,
    errorCount: 0,
    warningCount: 0,
    message: 'Pre-flight kontrola prošla.',
    hasUnsupportedFieldsWarning: false,
  };
}

const REQUIRED_AD_PERMISSIONS = [
  'ads_management',
  'ads_read',
  'business_management',
  'pages_read_engagement',
  'pages_manage_ads',
] as const;

export async function runMetaAdPreflightChecks(input: {
  graph: MetaGraphFetcher;
  token: string;
  ctx: MetaAdPreflightContext;
  tokenDebug?: {
    is_valid?: boolean;
    expires_at?: number;
    scopes?: string[];
    user_id?: string;
    app_id?: string;
  } | null;
}): Promise<MetaPreflightCheck[]> {
  const { graph, token, ctx } = input;
  const checks: MetaPreflightCheck[] = [];
  const actId = normalizeActId(input.ctx.adAccountId);

  const adAccountFetch = await graphGetWithV25FieldFallback<{
    id?: string;
    name?: string;
    account_status?: number;
    disable_reason?: number;
    currency?: string;
    timezone_name?: string;
    business?: { id?: string; name?: string };
    amount_spent?: string;
    balance?: string;
    spend_cap?: string;
  }>(
    graph,
    actPath(ctx.adAccountId),
    token,
    META_GRAPH_V25_FIELDS.adAccount,
    META_GRAPH_V25_FIELDS.adAccountMinimal,
  );

  pushFieldWarnings(checks, 'ad_account', adAccountFetch.skippedFields);

  if (!adAccountFetch.result.ok) {
    checks.push(
      check(
        'ad_account',
        false,
        adAccountFetch.unsupportedFieldsSkipped
          ? META_GRAPH_UNSUPPORTED_FIELDS_WARNING_CS
          : `Reklamní účet nelze načíst: ${adAccountFetch.result.errorMessage}`,
        adAccountFetch.unsupportedFieldsSkipped ? 'warning' : 'error',
        { requestedFields: adAccountFetch.requestedFields },
      ),
    );
  } else {
    const status = adAccountFetch.result.data.account_status;
    const active = status === 1 || status === 9;
    checks.push(
      check(
        'ad_account',
        active,
        active
          ? `Reklamní účet ${adAccountFetch.result.data.name ?? actId} je aktivní.`
          : `Reklamní účet není aktivní (account_status=${status ?? '—'}).`,
        active ? 'info' : 'error',
        {
          id: adAccountFetch.result.data.id,
          account_status: status,
          disable_reason: adAccountFetch.result.data.disable_reason ?? null,
          currency: adAccountFetch.result.data.currency ?? null,
          fields: adAccountFetch.requestedFields,
        },
      ),
    );
  }

  if (ctx.businessId) {
    const businessFetch = await graphGetWithV25FieldFallback<{
      id?: string;
      name?: string;
    }>(graph, `/${ctx.businessId}`, token, META_GRAPH_V25_FIELDS.business);
    pushFieldWarnings(checks, 'business', businessFetch.skippedFields);
    checks.push(
      businessFetch.result.ok
        ? check(
            'business',
            true,
            `Business ${businessFetch.result.data.name ?? ctx.businessId} je dostupný.`,
            'info',
            {
              id: businessFetch.result.data.id,
              fields: businessFetch.requestedFields,
            },
          )
        : check(
            'business',
            false,
            businessFetch.unsupportedFieldsSkipped
              ? META_GRAPH_UNSUPPORTED_FIELDS_WARNING_CS
              : `Business nelze načíst: ${businessFetch.result.errorMessage}`,
            businessFetch.unsupportedFieldsSkipped ? 'warning' : 'warning',
          ),
    );
  }

  const meRes = await graph.get<{ id?: string; name?: string }>(`/me`, token, {
    fields: META_GRAPH_V25_FIELDS.me,
  });
  checks.push(
    meRes.ok
      ? check(
          'me',
          true,
          `Token patří uživateli ${meRes.data.name ?? meRes.data.id ?? '—'}.`,
          'info',
          {
            id: meRes.data.id,
            name: meRes.data.name,
          },
        )
      : check(
          'me',
          false,
          `Nelze ověřit uživatele tokenu: ${meRes.errorMessage}`,
        ),
  );

  const permsRes = await graph.get<{
    data?: Array<{ permission?: string; status?: string }>;
  }>(`/me/permissions`, token, { fields: META_GRAPH_V25_FIELDS.permissions });
  const granted = new Set(
    (permsRes.ok ? (permsRes.data.data ?? []) : [])
      .filter((p) => p.status === 'granted' && p.permission)
      .map((p) => p.permission as string),
  );
  for (const perm of REQUIRED_AD_PERMISSIONS) {
    const has = granted.has(perm);
    checks.push(
      check(
        `permission_${perm}`,
        has,
        has ? `Oprávnění ${perm} je uděleno.` : `Chybí oprávnění ${perm}.`,
        has ? 'info' : 'error',
      ),
    );
  }

  if (input.tokenDebug) {
    const valid = input.tokenDebug.is_valid === true;
    checks.push(
      check(
        'token_debug',
        valid,
        valid
          ? `Access token je platný (app_id=${input.tokenDebug.app_id ?? '—'}).`
          : 'Access token není platný podle debug_token.',
        valid ? 'info' : 'error',
        {
          expires_at: input.tokenDebug.expires_at ?? null,
          scopes: input.tokenDebug.scopes ?? [],
          user_id: input.tokenDebug.user_id ?? null,
          app_id: input.tokenDebug.app_id ?? null,
        },
      ),
    );
  } else {
    checks.push(
      check(
        'token_debug',
        true,
        'Debug tokenu přeskočen — app access token není k dispozici.',
        'warning',
      ),
    );
  }

  if (ctx.pageId) {
    const pageFetch = await graphGetWithV25FieldFallback<{
      id?: string;
      name?: string;
      link?: string;
    }>(
      graph,
      `/${ctx.pageId}`,
      token,
      META_GRAPH_V25_FIELDS.page,
      META_GRAPH_V25_FIELDS.pageMinimal,
    );
    pushFieldWarnings(checks, 'page', pageFetch.skippedFields);
    checks.push(
      pageFetch.result.ok
        ? check(
            'page',
            true,
            `Stránka ${pageFetch.result.data.name ?? ctx.pageId} je dostupná.`,
            'info',
            {
              id: pageFetch.result.data.id,
              link: pageFetch.result.data.link,
              fields: pageFetch.requestedFields,
            },
          )
        : check(
            'page',
            false,
            pageFetch.unsupportedFieldsSkipped
              ? META_GRAPH_UNSUPPORTED_FIELDS_WARNING_CS
              : `Stránku nelze načíst: ${pageFetch.result.errorMessage}`,
            pageFetch.unsupportedFieldsSkipped ? 'warning' : 'error',
          ),
    );
  } else {
    checks.push(check('page', false, 'Chybí Page ID v nastavení Meta Centra.'));
  }

  if (ctx.pixelId) {
    const pixelFetch = await graphGetWithV25FieldFallback<{
      id?: string;
      name?: string;
    }>(graph, `/${ctx.pixelId}`, token, META_GRAPH_V25_FIELDS.pixel);
    pushFieldWarnings(checks, 'pixel', pixelFetch.skippedFields);
    checks.push(
      pixelFetch.result.ok
        ? check(
            'pixel',
            true,
            `Pixel/Dataset ${pixelFetch.result.data.name ?? ctx.pixelId} je dostupný.`,
            'info',
            {
              id: pixelFetch.result.data.id,
              fields: pixelFetch.requestedFields,
            },
          )
        : check(
            'pixel',
            false,
            pixelFetch.unsupportedFieldsSkipped
              ? META_GRAPH_UNSUPPORTED_FIELDS_WARNING_CS
              : `Pixel nelze načíst: ${pixelFetch.result.errorMessage}`,
            pixelFetch.unsupportedFieldsSkipped ? 'warning' : 'warning',
          ),
    );
  }

  if (ctx.creativeId) {
    const creativeFetch = await graphGetWithV25FieldFallback<{
      id?: string;
      name?: string;
      account_id?: string;
      object_story_spec?: unknown;
      product_set_id?: string;
      effective_object_story_id?: string;
      status?: string;
    }>(graph, `/${ctx.creativeId}`, token, META_GRAPH_V25_FIELDS.creative);
    pushFieldWarnings(checks, 'creative', creativeFetch.skippedFields);

    if (!creativeFetch.result.ok) {
      checks.push(
        check(
          'creative',
          false,
          creativeFetch.unsupportedFieldsSkipped
            ? META_GRAPH_UNSUPPORTED_FIELDS_WARNING_CS
            : `Creative nelze načíst: ${creativeFetch.result.errorMessage}`,
          creativeFetch.unsupportedFieldsSkipped ? 'warning' : 'error',
        ),
      );
    } else {
      const creativeRes = creativeFetch.result;
      const accountMatch =
        !creativeRes.data.account_id ||
        normalizeActId(creativeRes.data.account_id) === actId;
      const archived =
        creativeRes.data.status === 'DELETED' ||
        creativeRes.data.status === 'ARCHIVED';
      const productSetOk =
        !ctx.productSetId ||
        !creativeRes.data.product_set_id ||
        creativeRes.data.product_set_id === ctx.productSetId;
      checks.push(
        check(
          'creative',
          accountMatch && !archived,
          accountMatch
            ? archived
              ? `Creative ${ctx.creativeId} je archivované nebo smazané.`
              : `Creative ${ctx.creativeId} existuje a patří k účtu.`
            : `Creative patří jinému reklamnímu účtu (${creativeRes.data.account_id}).`,
          accountMatch && !archived ? 'info' : 'error',
          {
            account_id: creativeRes.data.account_id,
            product_set_id: creativeRes.data.product_set_id,
            status: creativeRes.data.status,
            fields: creativeFetch.requestedFields,
          },
        ),
      );
      if (
        ctx.productSetId &&
        creativeRes.data.product_set_id &&
        !productSetOk
      ) {
        checks.push(
          check(
            'creative_product_set',
            false,
            `Creative používá jiný product set (${creativeRes.data.product_set_id}) než kampaň (${ctx.productSetId}).`,
          ),
        );
      }
      const creativePageId = extractCreativePageId(
        creativeRes.data.object_story_spec,
      );
      if (ctx.pageId && creativePageId && creativePageId !== ctx.pageId) {
        checks.push(
          check(
            'creative_page',
            false,
            `Creative používá jinou stránku (${creativePageId}) než nastavení Meta Centra (${ctx.pageId}).`,
          ),
        );
      } else if (ctx.pageId && creativePageId) {
        checks.push(
          check(
            'creative_page',
            true,
            `Creative používá správné Page ID ${creativePageId}.`,
            'info',
          ),
        );
      }
    }
  } else {
    checks.push(check('creative', false, 'Chybí Meta Creative ID.'));
  }

  if (ctx.adSetId) {
    const adSetFetch = await graphGetWithV25FieldFallback<{
      id?: string;
      name?: string;
      account_id?: string;
      campaign_id?: string;
      status?: string;
      effective_status?: string;
      promoted_object?: unknown;
      targeting?: unknown;
      billing_event?: string;
      optimization_goal?: string;
    }>(graph, `/${ctx.adSetId}`, token, META_GRAPH_V25_FIELDS.adSet);
    pushFieldWarnings(checks, 'ad_set', adSetFetch.skippedFields);

    if (!adSetFetch.result.ok) {
      checks.push(
        check(
          'ad_set',
          false,
          adSetFetch.unsupportedFieldsSkipped
            ? META_GRAPH_UNSUPPORTED_FIELDS_WARNING_CS
            : `Ad Set nelze načíst: ${adSetFetch.result.errorMessage}`,
          adSetFetch.unsupportedFieldsSkipped ? 'warning' : 'error',
        ),
      );
    } else {
      const adSetRes = adSetFetch.result;
      const accountMatch =
        !adSetRes.data.account_id ||
        normalizeActId(adSetRes.data.account_id) === actId;
      const campaignMatch =
        !ctx.campaignId ||
        !adSetRes.data.campaign_id ||
        adSetRes.data.campaign_id === ctx.campaignId;
      const archived =
        adSetRes.data.effective_status === 'ARCHIVED' ||
        adSetRes.data.status === 'ARCHIVED' ||
        adSetRes.data.status === 'DELETED';
      checks.push(
        check(
          'ad_set',
          accountMatch && campaignMatch && !archived,
          archived
            ? `Ad Set ${ctx.adSetId} je archivovaný.`
            : accountMatch && campaignMatch
              ? `Ad Set ${ctx.adSetId} je platný.`
              : !accountMatch
                ? `Ad Set patří jinému reklamnímu účtu.`
                : `Ad Set nepatří k uložené kampani.`,
          accountMatch && campaignMatch && !archived ? 'info' : 'error',
          {
            account_id: adSetRes.data.account_id,
            campaign_id: adSetRes.data.campaign_id,
            effective_status: adSetRes.data.effective_status,
            fields: adSetFetch.requestedFields,
          },
        ),
      );
    }
  } else {
    checks.push(check('ad_set', false, 'Chybí Meta Ad Set ID.'));
  }

  if (ctx.catalogId) {
    const catalogFetch = await graphGetWithV25FieldFallback<{
      id?: string;
      name?: string;
      business?: { id?: string; name?: string };
    }>(
      graph,
      `/${ctx.catalogId}`,
      token,
      META_GRAPH_V25_FIELDS.catalog,
      META_GRAPH_V25_FIELDS.catalogMinimal,
    );
    pushFieldWarnings(checks, 'catalog', catalogFetch.skippedFields);

    const businessOk =
      !ctx.businessId ||
      !catalogFetch.result.ok ||
      !catalogFetch.result.data.business?.id ||
      catalogFetch.result.data.business.id === ctx.businessId;
    checks.push(
      catalogFetch.result.ok
        ? check(
            'catalog',
            businessOk,
            businessOk
              ? `Katalog ${catalogFetch.result.data.name ?? ctx.catalogId} je dostupný.`
              : `Katalog není ve stejném Business Portfoliu.`,
            businessOk ? 'info' : 'warning',
            {
              business_id: catalogFetch.result.data.business?.id ?? null,
              fields: catalogFetch.requestedFields,
            },
          )
        : check(
            'catalog',
            false,
            catalogFetch.unsupportedFieldsSkipped
              ? META_GRAPH_UNSUPPORTED_FIELDS_WARNING_CS
              : `Katalog nelze načíst: ${catalogFetch.result.errorMessage}`,
            'warning',
          ),
    );
  }

  if (ctx.productSetId) {
    const psFetch = await graphGetWithV25FieldFallback<{
      id?: string;
      name?: string;
      product_catalog?: { id?: string; name?: string };
    }>(graph, `/${ctx.productSetId}`, token, META_GRAPH_V25_FIELDS.productSet);
    pushFieldWarnings(checks, 'product_set', psFetch.skippedFields);

    const catalogMatch =
      !ctx.catalogId ||
      !psFetch.result.ok ||
      !psFetch.result.data.product_catalog?.id ||
      psFetch.result.data.product_catalog.id === ctx.catalogId;
    checks.push(
      psFetch.result.ok
        ? check(
            'product_set',
            catalogMatch,
            catalogMatch
              ? `Product Set ${psFetch.result.data.name ?? ctx.productSetId} je dostupný.`
              : `Product Set nepatří ke katalogu kampaně.`,
            catalogMatch ? 'info' : 'error',
            {
              catalog_id: psFetch.result.data.product_catalog?.id ?? null,
              fields: psFetch.requestedFields,
            },
          )
        : check(
            'product_set',
            false,
            psFetch.unsupportedFieldsSkipped
              ? META_GRAPH_UNSUPPORTED_FIELDS_WARNING_CS
              : `Product Set nelze načíst: ${psFetch.result.errorMessage}`,
            psFetch.unsupportedFieldsSkipped ? 'warning' : 'error',
          ),
    );
  }

  return checks;
}
