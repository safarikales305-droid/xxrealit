import { buildAbsoluteSiteUrl, resolveSiteOrigin } from './site-origin';

export { buildAbsoluteSiteUrl, resolveSiteOrigin };

/** @alias resolveSiteOrigin */
export function getAppOrigin(): string {
  return resolveSiteOrigin();
}

/** Pro `metadataBase` v root layoutu (og:image, absolutní metadata). */
export function getSiteMetadataBase(): URL {
  return new URL(`${resolveSiteOrigin()}/`);
}
