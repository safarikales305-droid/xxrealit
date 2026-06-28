import { upgradeHttpToHttps } from './public-urls';

/** Produkční výchozí doména — musí odpovídat TLS certifikátu (apex, ne www). */
export const PRODUCTION_SITE_ORIGIN_FALLBACK = 'https://xxrealit.cz';

export const XXREALIT_HOSTNAMES = ['xxrealit.cz', 'www.xxrealit.cz'] as const;

const LOCALHOST_FALLBACK = 'http://localhost:3000';
const LOCALHOST_LIKE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

function trimOrigin(url: string): string {
  return upgradeHttpToHttps(url.trim()).replace(/\/+$/, '');
}

function isProductionRuntime(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    Boolean(process.env.RAILWAY_ENVIRONMENT?.trim()) ||
    Boolean(process.env.VERCEL_ENV)
  );
}

/** Načte kanonický origin z env (jedna produkční doména). */
export function readSiteOriginFromEnv(): string | null {
  const candidates = [
    process.env.FRONTEND_URL?.trim(),
    process.env.NEXT_PUBLIC_SITE_URL?.trim(),
    process.env.NEXT_PUBLIC_APP_URL?.trim(),
    process.env.SITE_URL?.trim(),
    process.env.APP_URL?.trim(),
    process.env.NEXTAUTH_URL?.trim(),
    process.env.PUBLIC_URL?.trim(),
    process.env.BASE_URL?.trim(),
  ].filter((x): x is string => Boolean(x && x.length > 0));

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) candidates.push(`https://${vercel.replace(/^https?:\/\//i, '')}`);

  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railway) candidates.push(`https://${railway.replace(/^https?:\/\//i, '')}`);

  const first = candidates[0];
  return first ? trimOrigin(first.split(',')[0]!.trim()) : null;
}

export function resolveSiteOrigin(): string {
  const fromEnv = readSiteOriginFromEnv();
  const onRailway = Boolean(process.env.RAILWAY_ENVIRONMENT?.trim());

  let raw =
    fromEnv ??
    (!isProductionRuntime() && !onRailway
      ? LOCALHOST_FALLBACK
      : PRODUCTION_SITE_ORIGIN_FALLBACK);

  raw = trimOrigin(raw);

  if ((isProductionRuntime() || onRailway) && LOCALHOST_LIKE.test(raw)) {
    raw = PRODUCTION_SITE_ORIGIN_FALLBACK;
  }

  return raw;
}

export function resolveCanonicalHostname(): string {
  try {
    return new URL(resolveSiteOrigin()).hostname.toLowerCase();
  } catch {
    return 'xxrealit.cz';
  }
}

export function hostnameFromHostHeader(host: string | null | undefined): string {
  return (host ?? '').split(':')[0]?.toLowerCase() ?? '';
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
