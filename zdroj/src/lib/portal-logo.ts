/** Grafické logo portálu — stejné zdroje jako backend shorts overlay. */
export const PORTAL_LOGO_PNG = '/logo.png';
export const PORTAL_LOGO_ALT_PNG = '/xxrealit-logo.png';
export const PORTAL_LOGO_SVG = '/favicon.svg';

export const PORTAL_LOGO_SOURCES = [
  PORTAL_LOGO_PNG,
  PORTAL_LOGO_ALT_PNG,
  PORTAL_LOGO_SVG,
] as const;

export function primaryPortalLogoSrc(): string {
  return PORTAL_LOGO_PNG;
}
