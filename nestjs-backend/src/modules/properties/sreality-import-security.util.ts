import { BadRequestException } from '@nestjs/common';
import { assertSafeExternalUrl } from '../link-preview/link-preview-security.util';

/** Povolené hosty pro Sreality listing URL (suffix match). */
const SREALITY_LISTING_HOSTS = ['sreality.cz'] as const;

/** Povolené hosty pro stažení fotografií ze Sreality CDN. */
const SREALITY_IMAGE_HOSTS = ['sreality.cz', 'img.sreality.cz'] as const;

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function hostAllowed(host: string, allowed: readonly string[]): boolean {
  return allowed.some((base) => host === base || host.endsWith(`.${base}`));
}

export function assertSrealityImportListingUrl(raw: string): URL {
  const parsed = assertSafeExternalUrl(raw);
  const host = parsed.hostname.toLowerCase();
  if (!hostAllowed(host, SREALITY_LISTING_HOSTS)) {
    throw new BadRequestException('Import podporuje pouze odkazy ze sreality.cz.');
  }
  if (!/\/detail\//i.test(parsed.pathname)) {
    throw new BadRequestException('URL musí být detail inzerátu ze Sreality.');
  }
  return parsed;
}

export function isAllowedSrealityImageUrl(raw: string): boolean {
  const host = hostnameOf(raw);
  if (!host) return false;
  if (!hostAllowed(host, SREALITY_IMAGE_HOSTS)) return false;
  try {
    assertSafeExternalUrl(raw);
    return true;
  } catch {
    return false;
  }
}

/** @deprecated Prefer isAllowedSrealityImageUrl — zachováno pro kompatibilitu. */
export function isSrealityImageHost(url: string): boolean {
  return isAllowedSrealityImageUrl(url);
}
