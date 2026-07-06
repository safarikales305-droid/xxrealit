import {
  META_OAUTH_FLOW_ENV_KEYS,
  META_OAUTH_FLOWS,
  normalizeMetaOAuthFlowKey,
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

const LOGIN_DEFAULT_SCOPES = ['public_profile', 'email'] as const;

export type ResolvedOAuthScopes = {
  flow: MetaOAuthFlowKey;
  requestedScopes: string[];
  approvedScopes: string[];
  excludedScopes: string[];
  warnings: string[];
  scope: string;
  envVarKey: string;
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

export function readGlobalMetaApprovedOAuthScopesFromEnv(
  env: Record<string, string | undefined> = process.env,
): Set<string> | null {
  const raw =
    env.META_APPROVED_OAUTH_SCOPES?.trim() ||
    env.FACEBOOK_PAGES_APP_APPROVED_SCOPES?.trim() ||
    env.META_PAGES_APP_APPROVED_SCOPES?.trim() ||
    null;
  return parseApprovedScopesEnv(raw);
}

/** @deprecated Použijte readApprovedScopesForFlow */
export function readMetaApprovedOAuthScopesFromEnv(
  env: Record<string, string | undefined> = process.env,
): Set<string> | null {
  return readGlobalMetaApprovedOAuthScopesFromEnv(env);
}

export function envVarKeyForOAuthFlow(
  flow: MetaOAuthFlowKey,
): string {
  const key = normalizeMetaOAuthFlowKey(flow) ?? 'pages';
  return META_OAUTH_FLOWS[key].envVarKey;
}

export function readApprovedScopesForFlow(
  flow: MetaOAuthFlowKey,
  env: Record<string, string | undefined> = process.env,
): Set<string> | null {
  const key = normalizeMetaOAuthFlowKey(flow);
  if (!key) return null;

  const specific = parseApprovedScopesEnv(env[META_OAUTH_FLOWS[key].envVarKey]);
  if (specific) return specific;

  return readGlobalMetaApprovedOAuthScopesFromEnv(env);
}

/**
 * Vrátí pouze scopes pro daný flow. Nikdy nefallbackuje na „všechny scopes“.
 */
export function resolveScopesForOAuthFlow(
  flow: MetaOAuthFlowKey,
  env: Record<string, string | undefined> = process.env,
): ResolvedOAuthScopes {
  const flowKey = normalizeMetaOAuthFlowKey(flow) ?? 'pages';
  const flowDef = META_OAUTH_FLOWS[flowKey];
  const requestedScopes = [...flowDef.scopes];
  const warnings: string[] = [];
  const excludedScopes: string[] = [];
  const envVarKey = flowDef.envVarKey;
  let approvedScopes: string[];

  if (flowKey === 'pages') {
    approvedScopes = [...META_PAGES_ONLY_SCOPES];
  } else if (flowKey === 'login') {
    const approved = readApprovedScopesForFlow('login', env);
    const allowed = approved ?? new Set(LOGIN_DEFAULT_SCOPES);
    approvedScopes = requestedScopes.filter((scope) => {
      if (!allowed.has(scope)) {
        excludedScopes.push(scope);
        warnings.push(`Scope „${scope}" chybí v ${envVarKey}.`);
        return false;
      }
      return true;
    });
    if (!approved && approvedScopes.length === requestedScopes.length) {
      /* default login scopes */
    }
  } else {
    const approved = readApprovedScopesForFlow(flowKey, env);
    if (approved && approved.size > 0) {
      approvedScopes = [];
      for (const scope of requestedScopes) {
        if (approved.has(scope)) {
          approvedScopes.push(scope);
        } else {
          excludedScopes.push(scope);
          warnings.push(`Scope „${scope}" chybí v ${envVarKey}.`);
        }
      }
    } else {
      approvedScopes = [];
      warnings.push(
        `Flow „${flowDef.label}" vyžaduje schválená oprávnění. ` +
          `Nastavte ${envVarKey} (např. ${requestedScopes.join(',')}).`,
      );
      excludedScopes.push(...requestedScopes);
    }
  }

  if (approvedScopes.length === 0 && flowKey !== 'login') {
    warnings.push(`OAuth URL pro „${flowDef.label}" nemůže být vytvořena — chybí schválené scopes.`);
  }

  const scope = approvedScopes.join(',');
  assertNoForbiddenScopesInPagesFlow(flowKey, scope);

  return {
    flow: flowKey,
    requestedScopes,
    approvedScopes,
    excludedScopes,
    warnings,
    scope,
    envVarKey,
  };
}

export function assertNoForbiddenScopesInPagesFlow(
  flow: MetaOAuthFlowKey,
  scopeString: string,
): void {
  const flowKey = normalizeMetaOAuthFlowKey(flow);
  if (flowKey !== 'pages') return;
  const scopes = scopeString.split(',').map((s) => s.trim()).filter(Boolean);
  for (const forbidden of META_FORBIDDEN_DEFAULT_SCOPES) {
    if (scopes.includes(forbidden)) {
      throw new Error(
        `Pages OAuth nesmí obsahovat scope „${forbidden}". Zkontrolujte meta-oauth-scope-resolver.`,
      );
    }
  }
}

export function assertOAuthUrlScopes(flow: MetaOAuthFlowKey, scopeParam: string): void {
  assertNoForbiddenScopesInPagesFlow(flow, scopeParam);
  const flowKey = normalizeMetaOAuthFlowKey(flow);
  if (flowKey === 'pages') {
    const scopes = new Set(scopeParam.split(',').map((s) => s.trim()).filter(Boolean));
    for (const forbidden of META_FORBIDDEN_DEFAULT_SCOPES) {
      if (scopes.has(forbidden)) {
        throw new Error(`Invalid OAuth URL: pages flow contains forbidden scope ${forbidden}`);
      }
    }
  }
}
