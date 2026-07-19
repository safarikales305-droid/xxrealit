import { createReadStream } from 'node:fs';
import sax from 'sax';
import {
  RUIAN_VFR_ELEMENT_KIND_MAP,
  type RuianVfrConnectorConfig,
} from './ruian-vfr.official.constants';
import type { SeoLocationImportRow } from './seo-location.util';
import { buildSeoLocationSlug } from './seo-location.util';

export type VfrStreamRecord = {
  elementType: string;
  officialCode: string;
  name: string;
  parentOfficialCode?: string | null;
  regionOfficialCode?: string | null;
  districtOfficialCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type VfrStreamStats = NonNullable<RuianVfrConnectorConfig['stats']>;

const TRACKED_TAGS = new Set(Object.keys(RUIAN_VFR_ELEMENT_KIND_MAP));

function localName(tag: string): string {
  const idx = tag.indexOf(':');
  return idx >= 0 ? tag.slice(idx + 1) : tag;
}

function parseCoordPair(text: string): { lat: number; lon: number } | null {
  const parts = text.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const lon = Number.parseFloat(parts[0]!);
  const lat = Number.parseFloat(parts[1]!);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

export function vfrRecordToImportRow(rec: VfrStreamRecord): SeoLocationImportRow | null {
  const kind = RUIAN_VFR_ELEMENT_KIND_MAP[rec.elementType];
  if (!kind || !rec.officialCode || !rec.name) return null;
  return {
    officialCode: rec.officialCode,
    name: rec.name,
    slug: buildSeoLocationSlug(rec.name, rec.officialCode),
    kind,
    parentOfficialCode: rec.parentOfficialCode ?? null,
    regionOfficialCode: rec.regionOfficialCode ?? null,
    districtOfficialCode: rec.districtOfficialCode ?? null,
    latitude: rec.latitude ?? null,
    longitude: rec.longitude ?? null,
  };
}

function bumpStat(stats: VfrStreamStats, elementType: string): void {
  switch (elementType) {
    case 'Vusc':
    case 'Kraj':
      stats.kraje = (stats.kraje ?? 0) + 1;
      break;
    case 'Okres':
      stats.okresy = (stats.okresy ?? 0) + 1;
      break;
    case 'Orp':
    case 'POU':
      stats.orp = (stats.orp ?? 0) + 1;
      break;
    case 'Obec':
      stats.obce = (stats.obce ?? 0) + 1;
      break;
    case 'CastObce':
      stats.castiObci = (stats.castiObci ?? 0) + 1;
      break;
    case 'Momc':
    case 'MestskaCast':
      stats.mestskeCasti = (stats.mestskeCasti ?? 0) + 1;
      break;
    case 'KatastralniUzemi':
      stats.katastry = (stats.katastry ?? 0) + 1;
      break;
    case 'Ulice':
      stats.ulice = (stats.ulice ?? 0) + 1;
      break;
    case 'AdresniMisto':
      stats.adresniMista = (stats.adresniMista ?? 0) + 1;
      break;
    default:
      break;
  }
}

/**
 * Streamované parsování VFR XML (SAX) — bez načtení celého souboru do RAM.
 */
function attrValue(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object' && 'value' in v) return String((v as { value: unknown }).value);
  return String(v);
}

export async function streamParseVfrXmlFile(
  xmlPath: string,
  onBatch: (rows: SeoLocationImportRow[], stats: VfrStreamStats) => Promise<void>,
  opts?: { batchSize?: number; skipUntil?: number; onElement?: (elementType: string) => void },
): Promise<{ total: number; stats: VfrStreamStats }> {
  const batchSize = opts?.batchSize ?? 500;
  const stats: VfrStreamStats = {};
  let total = 0;
  let skipped = 0;
  let batch: SeoLocationImportRow[] = [];

  await new Promise<void>((resolve, reject) => {
    const parser = sax.createStream(true, { lowercase: false, xmlns: true });
    const stack: Array<{ tag: string; attrs: Record<string, string>; text: string }> = [];
    let current: { tag: string; attrs: Record<string, string>; text: string } | null = null;

    const flush = async () => {
      if (!batch.length) return;
      const copy = batch;
      batch = [];
      await onBatch(copy, stats);
    };

    parser.on('opentag', (node: sax.Tag) => {
      const tag = localName(node.name);
      const attrs: Record<string, string> = {};
      for (const [k, v] of Object.entries(node.attributes)) {
        attrs[localName(k)] = attrValue(v);
      }
      if (TRACKED_TAGS.has(tag)) {
        current = { tag, attrs, text: '' };
      } else if (current) {
        stack.push(current);
        current = { tag, attrs, text: '' };
      }
    });

    parser.on('text', (text: string) => {
      if (current) current.text += text;
    });

    parser.on('closetag', async (name: string) => {
      const tag = localName(name);
      if (!current) return;

      if (tag === current.tag) {
        const attrs = current.attrs;
        const rawCode =
          attrs.Kod ??
          attrs.kod ??
          attrs['Kód'] ??
          attrs.Id ??
          current.text.trim();
        const code = rawCode != null ? String(rawCode).trim() : '';
        const rawNazev =
          attrs.Nazev ??
          attrs.nazev ??
          attrs.Name ??
          (tag === 'Nazev' || tag === 'Name' ? current.text.trim() : '');
        const nazev = rawNazev != null ? String(rawNazev).trim() : '';

        if (TRACKED_TAGS.has(tag) && code) {
          const rec: VfrStreamRecord = {
            elementType: tag,
            officialCode: code,
            name: nazev || code,
            parentOfficialCode: attrs.KodNadrazenehoPrvku
              ? String(attrs.KodNadrazenehoPrvku)
              : attrs.KodObce
                ? String(attrs.KodObce)
                : attrs.KodVusc
                  ? String(attrs.KodVusc)
                  : null,
            regionOfficialCode: attrs.KodVusc
              ? String(attrs.KodVusc)
              : attrs.KodKraje
                ? String(attrs.KodKraje)
                : null,
            districtOfficialCode: attrs.KodOkresu ? String(attrs.KodOkresu) : null,
          };
          const coord = attrs.Souradnice ?? current.text;
          if (coord) {
            const parsed = parseCoordPair(coord);
            if (parsed) {
              rec.latitude = parsed.lat;
              rec.longitude = parsed.lon;
            }
          }
          const row = vfrRecordToImportRow(rec);
          if (row) {
            if (skipped < (opts?.skipUntil ?? 0)) {
              skipped += 1;
            } else {
              batch.push(row);
              total += 1;
              bumpStat(stats, tag);
              opts?.onElement?.(tag);
              if (batch.length >= batchSize) {
                parser.pause();
                void flush()
                  .then(() => parser.resume())
                  .catch(reject);
              }
            }
          }
        }
        current = stack.pop() ?? null;
      }
    });

    parser.on('error', (err: Error) => reject(err));
    parser.on('end', () => {
      void flush().then(() => resolve()).catch(reject);
    });

    createReadStream(xmlPath, { encoding: 'utf8', highWaterMark: 64 * 1024 }).pipe(parser);
  });

  return { total, stats };
}
