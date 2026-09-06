import { BadRequestException } from '@nestjs/common';
import { assertSafeExternalUrl } from '../link-preview/link-preview-security.util';

/** Povolené hosty pro Sreality listing URL (suffix match). */
export const SREALITY_SOURCE_HOSTS = ['sreality.cz'] as const;

/**
 * Povolené hosty pro stažení fotografií ze Sreality CDN.
 * Listing běží na www.sreality.cz, fotky jsou na img.sreality.cz / *.sdn.cz.
 */
export const SREALITY_MEDIA_HOSTS = ['sreality.cz', 'img.sreality.cz', 'sdn.cz'] as const;

/** Bezpečný technický limit fotografií na jeden import preview. */
export const SREALITY_IMPORT_MAX_IMAGES = 30;

export type SrealityHostValidation = 'PASS' | 'FAIL';

export type SrealityMediaUrlValidation = {
  allowed: boolean;
  host: string | null;
  hostValidation: SrealityHostValidation;
  reason: string | null;
};

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function normalizeHostname(host: string): string {
  return host.toLowerCase().replace(/\.$/, '');
}

/** Bezpečný suffix match — nepoužívá includes(). */
export function isTrustedHost(host: string, allowed: readonly string[]): boolean {
  const h = normalizeHostname(host);
  return allowed.some((base) => {
    const b = normalizeHostname(base);
    return h === b || h.endsWith(`.${b}`);
  });
}

export function assertSrealityImportListingUrl(raw: string): URL {
  const parsed = assertSafeExternalUrl(raw);
  const host = parsed.hostname.toLowerCase();
  if (!isTrustedHost(host, SREALITY_SOURCE_HOSTS)) {
    throw new BadRequestException('Import podporuje pouze odkazy ze sreality.cz.');
  }
  if (!/\/detail\//i.test(parsed.pathname)) {
    throw new BadRequestException('URL musí být detail inzerátu ze Sreality.');
  }
  return parsed;
}

export function validateSrealityMediaUrl(raw: string): SrealityMediaUrlValidation {
  const host = hostnameOf(raw);
  if (!host) {
    return {
      allowed: false,
      host: null,
      hostValidation: 'FAIL',
      reason: 'Neplatná URL',
    };
  }
  if (!isTrustedHost(host, SREALITY_MEDIA_HOSTS)) {
    return {
      allowed: false,
      host,
      hostValidation: 'FAIL',
      reason: 'Neplatný hostitel',
    };
  }
  try {
    assertSafeExternalUrl(raw);
    return { allowed: true, host, hostValidation: 'PASS', reason: null };
  } catch (err) {
    const reason = err instanceof BadRequestException ? String(err.message) : 'SSRF ochrana';
    return {
      allowed: false,
      host,
      hostValidation: 'FAIL',
      reason,
    };
  }
}

export function isAllowedSrealityImageUrl(raw: string): boolean {
  return validateSrealityMediaUrl(raw).allowed;
}

/** Ověří finální URL po redirectu — stejná pravidla jako u původní URL. */
export function isAllowedSrealityImageRedirectUrl(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return true;
  return isAllowedSrealityImageUrl(raw);
}

/** @deprecated Prefer isAllowedSrealityImageUrl — zachováno pro kompatibilitu. */
export function isSrealityImageHost(url: string): boolean {
  return isAllowedSrealityImageUrl(url);
}
