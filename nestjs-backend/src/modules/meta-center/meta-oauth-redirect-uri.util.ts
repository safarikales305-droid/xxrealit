/** Relativní cesta od API báze (`…/api`). */
export const META_OAUTH_CALLBACK_API_PATH = '/social/facebook/meta-connect-callback';

const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const LOCALHOST_IN_TEXT = /https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/i;

export type MetaRedirectUriSource = 'META_REDIRECT_URI' | 'BACKEND_URL' | 'none';

export type ResolvedMetaOAuthRedirectUri = {
  uri: string | null;
  source: MetaRedirectUriSource;
  warnings: string[];
};

const EXPLICIT_REDIRECT_ENV_KEYS = [
  'META_REDIRECT_URI',
  'META_CENTER_OAUTH_REDIRECT_URI',
  'FACEBOOK_OAUTH_CALLBACK_URI',
  'FACEBOOK_LOGIN_OAUTH_REDIRECT_URI',
  'FACEBOOK_OAUTH_REDIRECT_URI',
  'FACEBOOK_CALLBACK_URL',
  'FACEBOOK_PAGE_CONNECT_REDIRECT_URI',
] as const;

export function isProductionEnvironment(): boolean {
  const nodeEnv = (process.env.NODE_ENV ?? '').trim().toLowerCase();
  if (nodeEnv === 'production') return true;
  return Boolean(process.env.RAILWAY_ENVIRONMENT?.trim());
}

export function isLocalhostLikeUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  const trimmed = url.trim();
  if (LOCALHOST_IN_TEXT.test(trimmed)) return true;
  try {
    const host = new URL(trimmed).hostname.toLowerCase();
    return LOCALHOST_HOSTS.has(host);
  } catch {
    return /localhost|127\.0\.0\.1/i.test(trimmed);
  }
}

function buildCallbackFromBackendBase(backend: string): string {
  const base = backend.replace(/\/+$/, '');
  return base.endsWith('/api')
    ? `${base}${META_OAUTH_CALLBACK_API_PATH}`
    : `${base}/api${META_OAUTH_CALLBACK_API_PATH}`;
}

/**
 * Kanonická Meta OAuth callback URL:
 * 1) META_REDIRECT_URI (a legacy aliasy)
 * 2) BACKEND_URL / API_URL
 * Nikdy localhost v produkci.
 */
export function resolveMetaOAuthRedirectUri(
  readEnv: (name: string) => string | null,
): ResolvedMetaOAuthRedirectUri {
  const warnings: string[] = [];
  const production = isProductionEnvironment();

  for (const key of EXPLICIT_REDIRECT_ENV_KEYS) {
    const raw = readEnv(key);
    if (!raw?.trim()) continue;
    const uri = raw.trim().replace(/\/+$/, '');
    if (production && isLocalhostLikeUrl(uri)) {
      warnings.push(`${key} obsahuje localhost — v produkci se nepoužije.`);
      continue;
    }
    return { uri, source: 'META_REDIRECT_URI', warnings };
  }

  const backend =
    readEnv('BACKEND_URL')?.replace(/\/+$/, '') ||
    readEnv('API_URL')?.replace(/\/+$/, '') ||
    null;

  if (backend) {
    const uri = buildCallbackFromBackendBase(backend);
    if (production && isLocalhostLikeUrl(uri)) {
      warnings.push('BACKEND_URL obsahuje localhost — v produkci se nepoužije.');
      return { uri: null, source: 'none', warnings };
    }
    return { uri, source: 'BACKEND_URL', warnings };
  }

  if (production) {
    warnings.push('Nastavte META_REDIRECT_URI nebo BACKEND_URL (localhost není povolen).');
  } else {
    warnings.push('Nastavte META_REDIRECT_URI nebo BACKEND_URL.');
  }
  return { uri: null, source: 'none', warnings };
}

/** Najde localhost URL v libovolném JSON stromu (pro diagnostiku logů). */
export function findLocalhostInJson(
  value: unknown,
  hits: string[] = [],
  path = '',
): string[] {
  if (typeof value === 'string') {
    if (isLocalhostLikeUrl(value) || /localhost:\d+/i.test(value)) {
      hits.push(path ? `${path}: ${value}` : value);
    }
    return hits;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => findLocalhostInJson(item, hits, `${path}[${index}]`));
    return hits;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      findLocalhostInJson(nested, hits, path ? `${path}.${key}` : key);
    }
  }
  return hits;
}
