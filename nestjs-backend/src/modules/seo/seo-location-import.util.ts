import { BadRequestException } from '@nestjs/common';

const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
  'metadata.goog',
]);

const PRIVATE_IPV4 =
  /^(10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.)/;

export const SEO_LOCATION_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
export const SEO_LOCATION_ZIP_MAX_UNCOMPRESSED = 200 * 1024 * 1024;

export const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  '.csv',
  '.json',
  '.xml',
  '.zip',
  '.gz',
  '.gml',
]);

export const ALLOWED_UPLOAD_MIMES = new Set([
  'text/csv',
  'application/json',
  'text/xml',
  'application/xml',
  'application/zip',
  'application/x-zip-compressed',
  'application/gzip',
  'application/x-gzip',
  'text/plain',
  'application/octet-stream',
]);

export const TARGET_FIELDS = [
  'officialCode',
  'name',
  'slug',
  'locative',
  'kind',
  'parentOfficialCode',
  'regionOfficialCode',
  'districtOfficialCode',
  'latitude',
  'longitude',
  'population',
  'psc',
  'cadastreCode',
] as const;

export type SeoLocationTargetField = (typeof TARGET_FIELDS)[number];

export const FIELD_ALIASES: Record<SeoLocationTargetField, string[]> = {
  officialCode: ['officialcode', 'kod_obce', 'kodobce', 'obec_kod', 'code', 'kod', 'id'],
  name: ['name', 'nazev', 'nazev_obce', 'nazevobce', 'obec', 'nazev_území'],
  slug: ['slug', 'url_slug'],
  locative: ['locative', '6pad', 'pad6', 'lokativ'],
  kind: ['kind', 'typ', 'type', 'druh'],
  parentOfficialCode: ['parent', 'parentcode', 'nadrizeny_kod', 'parent_official_code'],
  regionOfficialCode: ['regioncode', 'kod_kraje', 'kraj_kod', 'kodkraje'],
  districtOfficialCode: ['districtcode', 'kod_okresu', 'okres_kod', 'kodokresu'],
  latitude: ['lat', 'latitude', 'y', 'souradnice_y'],
  longitude: ['lon', 'lng', 'longitude', 'x', 'souradnice_x'],
  population: ['population', 'pocet_obyvatel', 'obyvatel', 'pocetobyvatel'],
  psc: ['psc', 'postcode', 'zip'],
  cadastreCode: ['cadastre', 'katastr', 'kod_katastru', 'katastralni_uzemi'],
};

export function assertSafeRemoteUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new BadRequestException('Neplatná URL zdroje.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new BadRequestException('Povoleny jsou pouze HTTP/HTTPS URL.');
  }
  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host) || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new BadRequestException('URL směřuje na zakázaný hostitel.');
  }
  if (PRIVATE_IPV4.test(host)) {
    throw new BadRequestException('Privátní IP adresy nejsou povoleny (SSRF ochrana).');
  }
  if (host === '169.254.169.254') {
    throw new BadRequestException('Metadata endpoint není povolen.');
  }
  return parsed;
}

export function detectFieldMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const normalized = headers.map((h) => ({
    raw: h,
    key: h.trim().toLowerCase().replace(/[\s-]+/g, '_'),
  }));

  for (const target of TARGET_FIELDS) {
    const aliases = FIELD_ALIASES[target];
    const hit = normalized.find((h) => aliases.includes(h.key) || h.key === target.toLowerCase());
    if (hit) mapping[hit.raw] = target;
  }
  return mapping;
}

export function assertAllowedUpload(filename: string, mimeType?: string, size?: number): void {
  const ext = filename.includes('.') ? `.${filename.split('.').pop()!.toLowerCase()}` : '';
  if (!ALLOWED_UPLOAD_EXTENSIONS.has(ext)) {
    throw new BadRequestException(`Nepodporovaná přípona souboru: ${ext || '(žádná)'}`);
  }
  if (mimeType && !ALLOWED_UPLOAD_MIMES.has(mimeType.split(';')[0]!.trim().toLowerCase())) {
    throw new BadRequestException(`Nepodporovaný MIME typ: ${mimeType}`);
  }
  if (size != null && size > SEO_LOCATION_UPLOAD_MAX_BYTES) {
    throw new BadRequestException('Soubor překračuje maximální velikost 50 MB.');
  }
}

export function sanitizeXmlInput(xml: string): string {
  return xml
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<!ENTITY[^>]*>/gi, '')
    .replace(/<\?xml-stylesheet[^?]*\?>/gi, '');
}

export function detectFormatFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'gz' && filename.toLowerCase().endsWith('.csv.gz')) return 'csv';
  const map: Record<string, string> = {
    csv: 'csv',
    json: 'json',
    xml: 'xml',
    gml: 'xml',
    zip: 'zip',
    gz: 'gz',
  };
  return map[ext] ?? 'csv';
}
