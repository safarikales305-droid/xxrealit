import { isNodeProduction, upgradeHttpToHttps } from './public-urls';

/**
 * Veřejná canonical URL webu (odkazy v e-mailech, reset hesla, `metadataBase`).
 *
 * Priorita env: `FRONTEND_URL` → `NEXT_PUBLIC_SITE_URL` → `NEXT_PUBLIC_APP_URL` →
 * `VERCEL_URL` → `RAILWAY_PUBLIC_DOMAIN` → vývoj `http://localhost:3000` / produkce výchozí HTTPS doména.
 */
export function getAppOrigin(): string {
  const frontend = process.env.FRONTEND_URL?.trim();
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const app = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const vercel = process.env.VERCEL_URL?.trim();
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();

  const fromVercel = vercel
    ? `https://${vercel.replace(/^https?:\/\//i, '')}`
    : '';
  const fromRailway = railway
    ? `https://${railway.replace(/^https?:\/\//i, '')}`
    : '';

  const candidates = [frontend, site, app, fromVercel, fromRailway].filter(
    (x): x is string => Boolean(x && x.length > 0),
  );

  const productionFallback = 'https://www.xxrealit.cz';
  const localhostLike = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
  const onRailway = Boolean(process.env.RAILWAY_ENVIRONMENT?.trim());

  let raw =
    candidates[0] ??
    (!isNodeProduction() && !onRailway
      ? 'http://localhost:3000'
      : productionFallback);

  raw = upgradeHttpToHttps(raw);
  raw = raw.replace(/\/+$/, '');

  if ((isNodeProduction() || onRailway) && localhostLike.test(raw)) {
    raw = productionFallback;
  }

  return raw;
}

/** Pro `metadataBase` v root layoutu (og:image, absolutní metadata). */
export function getSiteMetadataBase(): URL {
  return new URL(`${getAppOrigin()}/`);
}
