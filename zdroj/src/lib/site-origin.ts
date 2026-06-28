import { upgradeHttpToHttps } from './public-urls';

/** Kanonická produkční doména — vždy www. */
export const CANONICAL_WWW_ORIGIN = 'https://www.xxrealit.cz';
export const CANONICAL_WWW_HOST = 'www.xxrealit.cz';
export const APEX_HOST = 'xxrealit.cz';

/** @alias CANONICAL_WWW_ORIGIN */
export const PRODUCTION_SITE_ORIGIN_FALLBACK = CANONICAL_WWW_ORIGIN;

export const XXREALIT_HOSTNAMES = [APEX_HOST, CANONICAL_WWW_HOST] as const;

const LOCALHOST_FALLBACK = 'http://localhost:3000';
const LOCALHOST_LIKE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

function trimOrigin(url: string): string {
  return upgradeHttpToHttps(url.trim()).replace(/\/+$/, '');
}

/** Apex nebo chybějící www → vždy https://www.xxrealit.cz */
export function normalizeXxrealitOrigin(origin: string): string {
  try {
    const u = new URL(origin);
    const host = u.hostname.toLowerCase();
    if (host === APEX_HOST || host === CANONICAL_WWW_HOST) {
      u.hostname = CANONICAL_WWW_HOST;
      u.protocol = 'https:';
      return trimOrigin(u.toString());
    }
  } catch {
    /* ignore */
  }
  return origin;
}

function isProductionRuntime(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    Boolean(process.env.RAILWAY_ENVIRONMENT?.trim()) ||
    Boolean(process.env.VERCEL_ENV)
  );
}

function isHostingRuntime(): boolean {
  return isProductionRuntime() || Boolean(process.env.RAILWAY_ENVIRONMENT?.trim());
}

/** Načte kanonický origin z env (jedna produkční doména — www). */
export function readSiteOriginFromEnv(): string | null {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL?.trim(),
    process.env.NEXT_PUBLIC_APP_URL?.trim(),
    process.env.FRONTEND_URL?.trim(),
    process.env.SITE_URL?.trim(),
    process.env.APP_URL?.trim(),
    process.env.NEXTAUTH_URL?.trim(),
    process.env.PUBLIC_URL?.trim(),
    process.env.BASE_URL?.trim(),
  ].filter((x): x is string => Boolean(x && x.length > 0));

  const first = candidates[0];
  if (!first) return null;

  let origin = trimOrigin(first.split(',')[0]!.trim());
  if (isHostingRuntime()) {
    origin = normalizeXxrealitOrigin(origin);
  }
  return origin;
}

export function resolveSiteOrigin(): string {
  const onRailway = Boolean(process.env.RAILWAY_ENVIRONMENT?.trim());

  if (isHostingRuntime()) {
    const fromEnv = readSiteOriginFromEnv();
    if (fromEnv) return normalizeXxrealitOrigin(fromEnv);
    return CANONICAL_WWW_ORIGIN;
  }

  const fromEnv = readSiteOriginFromEnv();
  let raw = fromEnv ?? LOCALHOST_FALLBACK;
  raw = trimOrigin(raw);

  if (LOCALHOST_LIKE.test(raw)) {
    return raw;
  }

  return normalizeXxrealitOrigin(raw);
}

export function resolveCanonicalHostname(): string {
  if (isHostingRuntime()) {
    return CANONICAL_WWW_HOST;
  }
  try {
    const host = new URL(resolveSiteOrigin()).hostname.toLowerCase();
    return host === APEX_HOST ? CANONICAL_WWW_HOST : host;
  } catch {
    return CANONICAL_WWW_HOST;
  }
}

export function hostnameFromHostHeader(host: string | null | undefined): string {
  return (host ?? '').split(',')[0]?.trim().split(':')[0]?.toLowerCase() ?? '';
}

export function resolveRequestHostname(
  host: string | null | undefined,
  forwardedHost: string | null | undefined,
): string {
  const forwarded = hostnameFromHostHeader(forwardedHost);
  if (forwarded) return forwarded;
  return hostnameFromHostHeader(host);
}

export function isKnownXxrealitHostname(host: string): boolean {
  const h = hostnameFromHostHeader(host);
  return (XXREALIT_HOSTNAMES as readonly string[]).includes(h);
}

export function buildAbsoluteSiteUrl(path: string): string {
  const base = resolveSiteOrigin();
  if (!path) return base;
  return path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
}
