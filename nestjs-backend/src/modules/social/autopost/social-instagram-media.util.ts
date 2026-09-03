import { getSiteOriginForOg } from '../../properties/property-og-media.util';

const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /\.railway\.app$/i,
  /\.internal$/i,
];

export function isPublicInstagramMediaUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (BLOCKED_HOST_PATTERNS.some((p) => p.test(parsed.hostname))) return false;
  return true;
}

export function assertPublicInstagramMediaUrl(url: string | null | undefined, label: string): string {
  const trimmed = url?.trim();
  if (!trimmed) {
    throw new Error(`${label}: chybí veřejná URL média.`);
  }
  if (!isPublicInstagramMediaUrl(trimmed)) {
    throw new Error(
      `${label}: URL musí být veřejně dostupná přes HTTPS (ne localhost ani interní adresa).`,
    );
  }
  return trimmed;
}

export function resolvePublicPortalUrlForCaption(): string {
  return getSiteOriginForOg().replace(/\/+$/, '');
}
