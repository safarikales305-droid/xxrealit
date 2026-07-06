import {
  META_OAUTH_FLOWS,
  type MetaOAuthFlowKey,
} from './meta-oauth-flows';

/** Scopes zakázané v defaultním pages flow — nikdy je neposílat společně. */
export const META_FORBIDDEN_DEFAULT_SCOPES = [
  'catalog_management',
  'ads_management',
  'ads_read',
  'instagram_basic',
  'instagram_manage_messages',
  'whatsapp_business_management',
  'whatsapp_business_messaging',
] as const;

export const META_PAGES_ONLY_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'pages_manage_metadata',
] as const;

export type ResolvedOAuthScopes = {
  flow: MetaOAuthFlowKey;
  requestedScopes: string[];
  approvedScopes: string[];
  excludedScopes: string[];
  warnings: string[];
  scope: string;
};

function parseApprovedScopesEnv(raw: string | undefined | null): Set<string> | null {
  if (!raw?.trim()) return null;
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function readMetaApprovedOAuthScopesFromEnv(
  env: Record<string, string | undefined> = process.env,
): Set<string> | null {
  const raw =
    env.META_APPROVED_OAUTH_SCOPES?.trim() ||
    env.FACEBOOK_PAGES_APP_APPROVED_SCOPES?.trim() ||
    env.META_PAGES_APP_APPROVED_SCOPES?.trim() ||
    null;
  return parseApprovedScopesEnv(raw);
}

/**
 * Vrátí pouze scopes pro daný flow. Nikdy nefallbackuje na „všechny scopes“.
 * Pages flow = výhradně 4 pages scopes (bez extended permissions).
 */
export function resolveScopesForOAuthFlow(
  flow: MetaOAuthFlowKey,
  approvedEnv?: Set<string> | null,
): ResolvedOAuthScopes {
  const flowDef = META_OAUTH_FLOWS[flow];
  const requestedScopes = [...flowDef.scopes];
  const warnings: string[] = [];
  const excludedScopes: string[] = [];
  let approvedScopes: string[];

  if (flow === 'pages') {
    approvedScopes = [...META_PAGES_ONLY_SCOPES];
  } else if (flow === 'login') {
    approvedScopes = requestedScopes.filter((scope) => {
      if ((META_FORBIDDEN_DEFAULT_SCOPES as readonly string[]).includes(scope)) {
        excludedScopes.push(scope);
        warnings.push(`Scope „${scope}“ není povolen v ${flowDef.label} flow.`);
        return false;
      }
      return true;
    });
  } else if (approvedEnv && approvedEnv.size > 0) {
    approvedScopes = [];
    for (const scope of requestedScopes) {
      if (approvedEnv.has(scope)) {
        approvedScopes.push(scope);
      } else {
        excludedScopes.push(scope);
        warnings.push(
          `Scope „${scope}“ není v META_APPROVED_OAUTH_SCOPES — nepřidáno do OAuth URL.`,
        );
      }
    }
  } else {
    approvedScopes = [];
    warnings.push(
      `Flow „${flowDef.label}“ vyžaduje schválená oprávnění v Meta App. ` +
        `Nastavte META_APPROVED_OAUTH_SCOPES (např. ${requestedScopes.join(',')}) ` +
        `nebo nejdřív použijte „Připojit Facebook stránku“.`,
    );
    excludedScopes.push(...requestedScopes);
  }

  if (approvedScopes.length === 0 && flow !== 'login') {
    warnings.push(`OAuth URL pro „${flowDef.label}“ nemůže být vytvořena — chybí schválené scopes.`);
  }

  const scope = approvedScopes.join(',');
  assertNoForbiddenScopesInPagesFlow(flow, scope);

  return {
    flow,
    requestedScopes,
    approvedScopes,
    excludedScopes,
    warnings,
    scope,
  };
}

export function assertNoForbiddenScopesInPagesFlow(
  flow: MetaOAuthFlowKey,
  scopeString: string,
): void {
  if (flow !== 'pages') return;
  const scopes = scopeString.split(',').map((s) => s.trim()).filter(Boolean);
  for (const forbidden of META_FORBIDDEN_DEFAULT_SCOPES) {
    if (scopes.includes(forbidden)) {
      throw new Error(
        `Pages OAuth nesmí obsahovat scope „${forbidden}“. Zkontrolujte meta-oauth-scope-resolver.`,
      );
    }
  }
}

export function assertOAuthUrlScopes(flow: MetaOAuthFlowKey, scopeParam: string): void {
  assertNoForbiddenScopesInPagesFlow(flow, scopeParam);
  if (flow === 'pages') {
    const scopes = new Set(scopeParam.split(',').map((s) => s.trim()).filter(Boolean));
    for (const forbidden of META_FORBIDDEN_DEFAULT_SCOPES) {
      if (scopes.has(forbidden)) {
        throw new Error(`Invalid OAuth URL: pages flow contains forbidden scope ${forbidden}`);
      }
    }
  }
}
