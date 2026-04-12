/**
 * Jednotný vstup pro veřejné URL (dokumentace + import z jednoho místa).
 *
 * - **API (Nest):** `API_BASE_URL` z `@/lib/api` — nastavte `NEXT_PUBLIC_API_URL` na `https://…` (bez mixed content).
 * - **Veřejná URL webu:** `getAppOrigin`, `getSiteMetadataBase` z `@/lib/app-url` — `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL`.
 */
export {
  API_BASE_URL,
  getServerSideApiBaseUrl,
  getNestPublicOrigin,
  nestAbsoluteAssetUrl,
} from '@/lib/api';
export { getAppOrigin, getSiteMetadataBase } from '@/lib/app-url';
export { isNodeProduction, upgradeHttpToHttps } from '@/lib/public-urls';
