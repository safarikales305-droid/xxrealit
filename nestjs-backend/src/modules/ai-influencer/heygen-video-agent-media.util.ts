import { lookup } from 'node:dns/promises';
import type { VideoAgentMediaFile } from './heygen-video-agent-prompt.util';

export type HeyGenMediaSourceType =
  | 'ARTICLE_IMAGE'
  | 'PROPERTY_IMAGE'
  | 'BROLL'
  | 'OG_IMAGE'
  | 'EXTERNAL'
  | 'UNKNOWN';

export type ExternalMediaValidation = {
  ok: boolean;
  url: string;
  hostname: string;
  protocol: string;
  httpStatus: number | null;
  contentType: string | null;
  contentLength: number | null;
  reason: string | null;
  publiclyAccessible: boolean;
};

export type PreparedHeyGenMediaAsset = {
  sourceUrl: string;
  sourceHost: string;
  publicUrl: string;
  mimeType: string | null;
  sourceType: HeyGenMediaSourceType;
  rehosted: boolean;
  label?: string;
};

export type HeyGenMediaPrepStats = {
  selected: number;
  publicAlready: number;
  rehosted: number;
  skipped: number;
  invalid: number;
};

const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
]);

const BLOCKED_HOST_SUFFIXES = ['.local', '.internal', '.localhost'];

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com']);

const IMAGE_MIME_PREFIXES = ['image/'];
const VIDEO_MIME_PREFIXES = ['video/'];
const MAX_PROBE_BYTES = 8192;
const MAX_REHOST_BYTES = 20 * 1024 * 1024;

export function parseMediaHostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function isYoutubeMediaUrl(url: string): boolean {
  const host = parseMediaHostname(url);
  return YOUTUBE_HOSTS.has(host) || host.endsWith('.youtube.com');
}

export function isBlockedMediaHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().trim();
  if (!host) return true;
  if (BLOCKED_HOSTS.has(host)) return true;
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  if (host.startsWith('169.254.')) return true;
  return false;
}

export function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

export function isAllowedMimeType(contentType: string | null): boolean {
  if (!contentType) return false;
  const mime = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return (
    IMAGE_MIME_PREFIXES.some((p) => mime.startsWith(p)) ||
    VIDEO_MIME_PREFIXES.some((p) => mime.startsWith(p)) ||
    mime === 'application/octet-stream'
  );
}

export function isLikelyPublicCloudinaryUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && /(^|\.)cloudinary\.com$/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

export async function assertPublicResolvableHost(hostname: string): Promise<void> {
  if (isBlockedMediaHostname(hostname)) {
    throw new Error(`Blocked media host: ${hostname}`);
  }
  try {
    const result = await lookup(hostname, { verbatim: true });
    const addresses = Array.isArray(result) ? result.map((r) => r.address) : [result.address];
    for (const address of addresses) {
      if (address.includes(':')) {
        if (address === '::1' || address.startsWith('fc') || address.startsWith('fd')) {
          throw new Error(`Private IPv6 host: ${hostname}`);
        }
      } else if (isPrivateIpv4(address)) {
        throw new Error(`Private IPv4 host: ${hostname}`);
      }
    }
  } catch (err) {
    if (err instanceof Error && /blocked|private/i.test(err.message)) throw err;
    throw new Error(`Media host not resolvable: ${hostname}`);
  }
}

export type FetchExternalMedia = (
  url: string,
  init?: {
    method?: 'GET' | 'HEAD';
    headers?: Record<string, string>;
    range?: string;
    redirect?: RequestRedirect;
  },
) => Promise<Response>;

export async function validateExternalMediaUrl(
  url: string,
  fetchImpl: FetchExternalMedia = fetch,
): Promise<ExternalMediaValidation> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return {
      ok: false,
      url,
      hostname: '',
      protocol: '',
      httpStatus: null,
      contentType: null,
      contentLength: null,
      reason: 'invalid_url',
      publiclyAccessible: false,
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  const protocol = parsed.protocol;
  if (protocol !== 'https:') {
    return {
      ok: false,
      url,
      hostname,
      protocol,
      httpStatus: null,
      contentType: null,
      contentLength: null,
      reason: 'requires_https',
      publiclyAccessible: false,
    };
  }

  if (isYoutubeMediaUrl(url)) {
    return {
      ok: false,
      url,
      hostname,
      protocol,
      httpStatus: null,
      contentType: null,
      contentLength: null,
      reason: 'youtube_not_supported',
      publiclyAccessible: false,
    };
  }

  if (isBlockedMediaHostname(hostname)) {
    return {
      ok: false,
      url,
      hostname,
      protocol,
      httpStatus: null,
      contentType: null,
      contentLength: null,
      reason: 'blocked_host',
      publiclyAccessible: false,
    };
  }

  try {
    await assertPublicResolvableHost(hostname);
  } catch (err) {
    return {
      ok: false,
      url,
      hostname,
      protocol,
      httpStatus: null,
      contentType: null,
      contentLength: null,
      reason: err instanceof Error ? err.message : 'host_resolution_failed',
      publiclyAccessible: false,
    };
  }

  if (isLikelyPublicCloudinaryUrl(url)) {
    return {
      ok: true,
      url,
      hostname,
      protocol,
      httpStatus: 200,
      contentType: 'image/*',
      contentLength: null,
      reason: null,
      publiclyAccessible: true,
    };
  }

  const probe = async (method: 'HEAD' | 'GET') => {
    const headers: Record<string, string> = {};
    if (method === 'GET') headers.Range = `bytes=0-${MAX_PROBE_BYTES - 1}`;
    const res = await fetchImpl(url, { method, headers, redirect: 'follow' });
    const finalUrl = res.url || url;
    const finalHost = parseMediaHostname(finalUrl);
    if (finalHost && finalHost !== hostname) {
      await assertPublicResolvableHost(finalHost);
      if (isBlockedMediaHostname(finalHost)) {
        throw new Error(`Redirected to blocked host: ${finalHost}`);
      }
    }
    return res;
  };

  let res: Response;
  try {
    res = await probe('HEAD');
    if (res.status === 405 || res.status === 403 || res.status === 501) {
      res = await probe('GET');
    }
  } catch (err) {
    return {
      ok: false,
      url,
      hostname,
      protocol,
      httpStatus: null,
      contentType: null,
      contentLength: null,
      reason: err instanceof Error ? err.message : 'fetch_failed',
      publiclyAccessible: false,
    };
  }

  const contentType = res.headers.get('content-type');
  const contentLengthRaw = res.headers.get('content-length');
  const contentLength = contentLengthRaw ? Number.parseInt(contentLengthRaw, 10) : null;
  const ok = res.ok && isAllowedMimeType(contentType);

  return {
    ok,
    url: res.url || url,
    hostname: parseMediaHostname(res.url || url) || hostname,
    protocol,
    httpStatus: res.status,
    contentType,
    contentLength: Number.isFinite(contentLength ?? NaN) ? contentLength : null,
    reason: ok ? null : `http_${res.status}`,
    publiclyAccessible: ok,
  };
}

export function inferMediaSourceType(label: string | undefined, url: string): HeyGenMediaSourceType {
  const l = (label ?? '').toUpperCase();
  if (l.includes('ARTICLE')) return 'ARTICLE_IMAGE';
  if (l.includes('BROLL')) return 'BROLL';
  if (l.includes('PROPERTY')) return 'PROPERTY_IMAGE';
  if (/\/og|social/i.test(url)) return 'OG_IMAGE';
  return 'UNKNOWN';
}

export function normalizeHeyGenMediaSourceType(
  value: string | HeyGenMediaSourceType | undefined,
  fallback: HeyGenMediaSourceType,
): HeyGenMediaSourceType {
  if (
    value === 'ARTICLE_IMAGE' ||
    value === 'PROPERTY_IMAGE' ||
    value === 'BROLL' ||
    value === 'OG_IMAGE' ||
    value === 'EXTERNAL' ||
    value === 'UNKNOWN'
  ) {
    return value;
  }
  return fallback;
}

export function toHeyGenMediaFiles(assets: PreparedHeyGenMediaAsset[]): VideoAgentMediaFile[] {
  return assets.map((asset) => ({
    type: 'url' as const,
    url: asset.publicUrl,
    label: asset.label,
  }));
}

export function buildHeyGenMediaPrepStats(input: {
  selected: PreparedHeyGenMediaAsset[];
  skipped: number;
  invalid: number;
}): HeyGenMediaPrepStats {
  return {
    selected: input.selected.length + input.skipped + input.invalid,
    publicAlready: input.selected.filter((a) => !a.rehosted).length,
    rehosted: input.selected.filter((a) => a.rehosted).length,
    skipped: input.skipped,
    invalid: input.invalid,
  };
}

export function sanitizeUrlForLog(url: string): string {
  try {
    const parsed = new URL(url);
    const maskedQuery = parsed.search ? '?…' : '';
    return `${parsed.origin}${parsed.pathname}${maskedQuery}`;
  } catch {
    return url.slice(0, 80);
  }
}

export const HEYGEN_MEDIA_MAX_DOWNLOAD_BYTES = MAX_REHOST_BYTES;
