import type { MetaGraphResult } from './meta-graph-client.service';

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
  campaignId: string | null;
  adSetId: string | null;
  creativeId: string | null;
  graphApiVersion: string;
};

export type MetaGraphFetcher = {
  get<T>(path: string, token: string, query?: Record<string, string>): Promise<MetaGraphResult<T>>;
};

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

export function summarizePreflightChecks(checks: MetaPreflightCheck[]): {
  ok: boolean;
  errorCount: number;
  warningCount: number;
  message: string;
} {
  const errors = checks.filter((c) => !c.ok && c.severity === 'error');
  const warnings = checks.filter((c) => !c.ok && c.severity === 'warning');
  if (errors.length) {
    return {
      ok: false,
      errorCount: errors.length,
      warningCount: warnings.length,
      message: errors.map((c) => c.message).join(' '),
    };
  }
  if (warnings.length) {
    return {
      ok: true,
      errorCount: 0,
      warningCount: warnings.length,
      message: warnings.map((c) => c.message).join(' '),
    };
  }
  return { ok: true, errorCount: 0, warningCount: 0, message: 'Pre-flight kontrola prošla.' };
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

  const adAccountRes = await graph.get<{
    id?: string;
    name?: string;
    account_status?: number;
    disable_reason?: number;
    currency?: string;
    timezone_name?: string;
    business?: { id?: string; name?: string };
    owner_business?: { id?: string; name?: string };
    amount_spent?: string;
    balance?: string;
    spend_cap?: string;
  }>(actPath(ctx.adAccountId), token, {
    fields:
      'id,name,account_status,disable_reason,currency,timezone_name,business,owner_business,amount_spent,balance,spend_cap',
  });

  if (!adAccountRes.ok) {
    checks.push(
      check('ad_account', false, `Reklamní účet nelze načíst: ${adAccountRes.errorMessage}`),
    );
  } else {
    const status = adAccountRes.data.account_status;
    const active = status === 1 || status === 9;
    checks.push(
      check(
        'ad_account',
        active,
        active
          ? `Reklamní účet ${adAccountRes.data.name ?? actId} je aktivní.`
          : `Reklamní účet není aktivní (account_status=${status ?? '—'}).`,
        active ? 'info' : 'error',
        {
          id: adAccountRes.data.id,
          account_status: status,
          disable_reason: adAccountRes.data.disable_reason ?? null,
          currency: adAccountRes.data.currency ?? null,
        },
      ),
    );
  }

  const meRes = await graph.get<{ id?: string; name?: string }>(`/me`, token, {
    fields: 'id,name',
  });
  checks.push(
    meRes.ok
      ? check('me', true, `Token patří uživateli ${meRes.data.name ?? meRes.data.id ?? '—'}.`, 'info', {
          id: meRes.data.id,
          name: meRes.data.name,
        })
      : check('me', false, `Nelze ověřit uživatele tokenu: ${meRes.errorMessage}`),
  );

  const permsRes = await graph.get<{ data?: Array<{ permission?: string; status?: string }> }>(
    `/me/permissions`,
    token,
    { fields: 'permission,status' },
  );
  const granted = new Set(
    (permsRes.ok ? permsRes.data.data ?? [] : [])
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
    const pageRes = await graph.get<{ id?: string; name?: string; link?: string; tasks?: string[] }>(
      `/${ctx.pageId}`,
      token,
      { fields: 'id,name,link,tasks' },
    );
    checks.push(
      pageRes.ok
        ? check('page', true, `Stránka ${pageRes.data.name ?? ctx.pageId} je dostupná.`, 'info', {
            id: pageRes.data.id,
            link: pageRes.data.link,
            tasks: pageRes.data.tasks ?? [],
          })
        : check('page', false, `Stránku nelze načíst: ${pageRes.errorMessage}`),
    );
  } else {
    checks.push(check('page', false, 'Chybí Page ID v nastavení Meta Centra.'));
  }

  if (ctx.creativeId) {
    const creativeRes = await graph.get<{
      id?: string;
      name?: string;
      account_id?: string;
      object_story_spec?: unknown;
      product_set_id?: string;
      effective_object_story_id?: string;
      status?: string;
    }>(`/${ctx.creativeId}`, token, {
      fields:
        'id,name,account_id,object_story_spec,product_set_id,effective_object_story_id,status',
    });
    if (!creativeRes.ok) {
      checks.push(
        check('creative', false, `Creative nelze načíst: ${creativeRes.errorMessage}`),
      );
    } else {
      const accountMatch =
        !creativeRes.data.account_id ||
        normalizeActId(creativeRes.data.account_id) === actId;
      const archived =
        creativeRes.data.status === 'DELETED' || creativeRes.data.status === 'ARCHIVED';
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
          },
        ),
      );
      if (ctx.productSetId && creativeRes.data.product_set_id && !productSetOk) {
        checks.push(
          check(
            'creative_product_set',
            false,
            `Creative používá jiný product set (${creativeRes.data.product_set_id}) než kampaň (${ctx.productSetId}).`,
          ),
        );
      }
    }
  } else {
    checks.push(check('creative', false, 'Chybí Meta Creative ID.'));
  }

  if (ctx.adSetId) {
    const adSetRes = await graph.get<{
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
    }>(`/${ctx.adSetId}`, token, {
      fields:
        'id,name,account_id,campaign_id,status,effective_status,promoted_object,targeting,billing_event,optimization_goal',
    });
    if (!adSetRes.ok) {
      checks.push(check('ad_set', false, `Ad Set nelze načíst: ${adSetRes.errorMessage}`));
    } else {
      const accountMatch =
        !adSetRes.data.account_id || normalizeActId(adSetRes.data.account_id) === actId;
      const campaignMatch =
        !ctx.campaignId || !adSetRes.data.campaign_id || adSetRes.data.campaign_id === ctx.campaignId;
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
          },
        ),
      );
    }
  } else {
    checks.push(check('ad_set', false, 'Chybí Meta Ad Set ID.'));
  }

  if (ctx.catalogId) {
    const catalogRes = await graph.get<{ id?: string; name?: string; business?: { id?: string } }>(
      `/${ctx.catalogId}`,
      token,
      { fields: 'id,name,business' },
    );
    const businessOk =
      !ctx.businessId ||
      !catalogRes.ok ||
      !catalogRes.data.business?.id ||
      catalogRes.data.business.id === ctx.businessId;
    checks.push(
      catalogRes.ok
        ? check(
            'catalog',
            businessOk,
            businessOk
              ? `Katalog ${catalogRes.data.name ?? ctx.catalogId} je dostupný.`
              : `Katalog není ve stejném Business Portfoliu.`,
            businessOk ? 'info' : 'warning',
            { business_id: catalogRes.data.business?.id ?? null },
          )
        : check('catalog', false, `Katalog nelze načíst: ${catalogRes.errorMessage}`, 'warning'),
    );
  }

  if (ctx.productSetId) {
    const psRes = await graph.get<{ id?: string; name?: string; product_catalog?: { id?: string } }>(
      `/${ctx.productSetId}`,
      token,
      { fields: 'id,name,product_catalog' },
    );
    const catalogMatch =
      !ctx.catalogId ||
      !psRes.ok ||
      !psRes.data.product_catalog?.id ||
      psRes.data.product_catalog.id === ctx.catalogId;
    checks.push(
      psRes.ok
        ? check(
            'product_set',
            catalogMatch,
            catalogMatch
              ? `Product Set ${psRes.data.name ?? ctx.productSetId} je dostupný.`
              : `Product Set nepatří ke katalogu kampaně.`,
            catalogMatch ? 'info' : 'error',
            { catalog_id: psRes.data.product_catalog?.id ?? null },
          )
        : check('product_set', false, `Product Set nelze načíst: ${psRes.errorMessage}`),
    );
  }

  return checks;
}
