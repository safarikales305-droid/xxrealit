import { createReadStream } from 'node:fs';
import {
  RUIAN_VFR_ELEMENT_KIND_MAP,
  type RuianVfrConnectorConfig,
} from './ruian-vfr.official.constants';
import { resolveSaxModule } from './ruian-vfr.sax';
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

export type VfrParseDiagnostics = {
  parsedRegions: number;
  parsedDistricts: number;
  parsedOrp: number;
  parsedMunicipalities: number;
  parsedMunicipalityParts: number;
  parsedCadastralAreas: number;
  parsedStreets: number;
  parsedAddressPlaces: number;
  parseErrors: string[];
};

export type VfrStreamStats = NonNullable<RuianVfrConnectorConfig['stats']>;

const NESTED_REF_ONLY_TAGS = new Set(['Okres', 'Pou', 'Vusc', 'Orp']);

function isNestedReferenceTag(tag: string, recordStackDepth: number): boolean {
  return recordStackDepth > 0 && NESTED_REF_ONLY_TAGS.has(tag);
}

const TRACKED_TAGS = new Set(Object.keys(RUIAN_VFR_ELEMENT_KIND_MAP));

const FIELD_TAGS = new Set(['Kod', 'Nazev', 'Name', 'pos']);

function localName(tag: string): string {
  if (tag.startsWith('{')) {
    const close = tag.indexOf('}');
    return close >= 0 ? tag.slice(close + 1) : tag;
  }
  const idx = tag.indexOf(':');
  return idx >= 0 ? tag.slice(idx + 1) : tag;
}

function parseCoordPair(text: string): { lat: number; lon: number } | null {
  const parts = text.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const x = Number.parseFloat(parts[0]!);
  const y = Number.parseFloat(parts[1]!);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  // VFR EPSG:5514 — pro SEO uložíme jako lat/lon aproximaci (s-jtsk); lepší než nic
  return { lat: y / 100000, lon: x / 100000 };
}

function attrValue(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object' && 'value' in v) return String((v as { value: unknown }).value);
  return String(v);
}

function bumpDiag(diag: VfrParseDiagnostics, elementType: string): void {
  switch (elementType) {
    case 'Vusc':
    case 'Kraj':
      diag.parsedRegions += 1;
      break;
    case 'Okres':
      diag.parsedDistricts += 1;
      break;
    case 'Orp':
    case 'POU':
      diag.parsedOrp += 1;
      break;
    case 'Obec':
      diag.parsedMunicipalities += 1;
      break;
    case 'CastObce':
    case 'Momc':
    case 'MestskaCast':
      diag.parsedMunicipalityParts += 1;
      break;
    case 'KatastralniUzemi':
      diag.parsedCadastralAreas += 1;
      break;
    case 'Ulice':
      diag.parsedStreets += 1;
      break;
    case 'AdresniMisto':
      diag.parsedAddressPlaces += 1;
      break;
    default:
      break;
  }
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

export function vfrRecordToImportRow(rec: VfrStreamRecord): SeoLocationImportRow | null {
  const kind = RUIAN_VFR_ELEMENT_KIND_MAP[rec.elementType];
  if (!kind || !rec.officialCode?.trim()) return null;
  const name = rec.name?.trim() || rec.officialCode;
  return {
    officialCode: rec.officialCode.trim(),
    name,
    slug: buildSeoLocationSlug(name, rec.officialCode),
    kind,
    parentOfficialCode: rec.parentOfficialCode ?? null,
    regionOfficialCode: rec.regionOfficialCode ?? null,
    districtOfficialCode: rec.districtOfficialCode ?? null,
    latitude: rec.latitude ?? null,
    longitude: rec.longitude ?? null,
  };
}

type PartialRec = Partial<VfrStreamRecord> & { elementType: string };

/**
 * Streamované parsování VFR XML/GML (SAX).
 * Podporuje child elementy s namespace prefixy (obi:Kod, vf:Obec, gml:pos).
 */
export async function streamParseVfrXmlFile(
  xmlPath: string,
  onBatch: (rows: SeoLocationImportRow[], stats: VfrStreamStats, diag: VfrParseDiagnostics) => Promise<void>,
  opts?: {
    batchSize?: number;
    skipUntil?: number;
    maxRecords?: number;
    filterElementType?: string;
    onElement?: (elementType: string) => void;
  },
): Promise<{ total: number; stats: VfrStreamStats; diagnostics: VfrParseDiagnostics }> {
  const batchSize = opts?.batchSize ?? 500;
  const stats: VfrStreamStats = {};
  const diagnostics: VfrParseDiagnostics = {
    parsedRegions: 0,
    parsedDistricts: 0,
    parsedOrp: 0,
    parsedMunicipalities: 0,
    parsedMunicipalityParts: 0,
    parsedCadastralAreas: 0,
    parsedStreets: 0,
    parsedAddressPlaces: 0,
    parseErrors: [],
  };
  let total = 0;
  let skipped = 0;
  let batch: SeoLocationImportRow[] = [];

  await new Promise<void>((resolve, reject) => {
    const sax = resolveSaxModule();
    const parser = sax.createStream(true, { lowercase: false, xmlns: true });
    const readStream = createReadStream(xmlPath, { encoding: 'utf8', highWaterMark: 128 * 1024 });
    let stopped = false;

    const recordStack: PartialRec[] = [];
    const elementStack: string[] = [];
    let textBuffer = '';
    let captureTarget: { kind: 'field'; key: 'officialCode' | 'name' } | { kind: 'nestedKod'; ref: string } | { kind: 'pos' } | null =
      null;
    let inGeometry = false;

    const flush = async () => {
      if (!batch.length) return;
      const copy = batch;
      batch = [];
      await onBatch(copy, stats, diagnostics);
    };

    const finalizeRecord = async (rec: PartialRec) => {
      if (opts?.filterElementType && rec.elementType !== opts.filterElementType) {
        return;
      }
      if (!rec.officialCode?.trim()) {
        diagnostics.parseErrors.push(`Chybí kód u prvku ${rec.elementType}`);
        return;
      }
      if (!rec.name?.trim()) {
        rec.name = rec.officialCode;
      }
      const row = vfrRecordToImportRow(rec as VfrStreamRecord);
      if (!row) return;

      if (skipped < (opts?.skipUntil ?? 0)) {
        skipped += 1;
        return;
      }
      if (opts?.maxRecords != null && total >= opts.maxRecords) return;

      batch.push(row);
      total += 1;
      bumpStat(stats, rec.elementType);
      bumpDiag(diagnostics, rec.elementType);
      opts?.onElement?.(rec.elementType);

      if (batch.length >= batchSize) {
        parser.pause();
        void flush()
          .then(() => parser.resume())
          .catch(reject);
      }
    };

    parser.on('opentag', (node: { name: string; attributes: Record<string, unknown> }) => {
      const tag = localName(node.name);
      elementStack.push(tag);
      textBuffer = '';

      if (TRACKED_TAGS.has(tag) && !isNestedReferenceTag(tag, recordStack.length)) {
        const attrs: Record<string, string> = {};
        for (const [k, v] of Object.entries(node.attributes ?? {})) {
          attrs[localName(k)] = attrValue(v);
        }
        const fromAttr: PartialRec = {
          elementType: tag,
          officialCode: attrs.Kod || attrs.kod || attrs.Id || '',
          name: attrs.Nazev || attrs.nazev || attrs.Name || '',
          parentOfficialCode: attrs.KodNadrazenehoPrvku ?? null,
          districtOfficialCode: attrs.KodOkresu ?? null,
          regionOfficialCode: attrs.KodVusc ?? attrs.KodKraje ?? null,
        };
        recordStack.push(fromAttr);
        captureTarget = null;
        return;
      }

      if (!recordStack.length) return;

      if (tag === 'Geometrie' || tag === 'DefinicniBod' || tag === 'MultiPoint' || tag === 'Point') {
        inGeometry = true;
      }

      if (tag === 'Kod') {
        const parentTag = elementStack.length >= 2 ? elementStack[elementStack.length - 2]! : '';
        const current = recordStack[recordStack.length - 1];
        if (['Okres', 'Pou', 'Vusc', 'Orp'].includes(parentTag)) {
          captureTarget = { kind: 'nestedKod', ref: parentTag };
        } else if (parentTag === 'Obec' && current?.elementType !== 'Obec') {
          captureTarget = { kind: 'nestedKod', ref: 'Obec' };
        } else {
          captureTarget = { kind: 'field', key: 'officialCode' };
        }
      } else if (tag === 'Nazev' || tag === 'Name') {
        captureTarget = { kind: 'field', key: 'name' };
      } else if (tag === 'pos' && inGeometry) {
        captureTarget = { kind: 'pos' };
      }
    });

    parser.on('text', (text: string) => {
      if (captureTarget) textBuffer += text;
    });

    parser.on('closetag', async (name: string) => {
      const tag = localName(name);

      if (captureTarget && (tag === 'Kod' || tag === 'Nazev' || tag === 'Name' || tag === 'pos')) {
        const value = textBuffer.trim();
        const current = recordStack[recordStack.length - 1];
        if (current && value) {
          if (captureTarget.kind === 'pos' && tag === 'pos') {
            const coord = parseCoordPair(value);
            if (coord) {
              current.latitude = coord.lat;
              current.longitude = coord.lon;
            }
          } else if (captureTarget.kind === 'field') {
            current[captureTarget.key] = value;
          } else if (captureTarget.kind === 'nestedKod') {
            if (captureTarget.ref === 'Okres') current.districtOfficialCode = value;
            else if (captureTarget.ref === 'Vusc') current.regionOfficialCode = value;
            else if (captureTarget.ref === 'Pou' || captureTarget.ref === 'Orp')
              current.parentOfficialCode = value;
            else if (captureTarget.ref === 'Obec') current.parentOfficialCode = value;
          }
        }
        textBuffer = '';
        captureTarget = null;
      }

      if (tag === 'pos' || tag === 'Point' || tag === 'MultiPoint' || tag === 'DefinicniBod' || tag === 'Geometrie') {
        inGeometry = false;
      }

      if (TRACKED_TAGS.has(tag) && !isNestedReferenceTag(tag, recordStack.length)) {
        const rec = recordStack.pop();
        if (rec && rec.elementType === tag) {
          if (opts?.maxRecords != null && total >= opts.maxRecords) {
            if (!stopped) {
              stopped = true;
              readStream.destroy();
              void flush().then(() => resolve()).catch(reject);
            }
            return;
          }
          await finalizeRecord(rec);
        }
      }

      elementStack.pop();
    });

    parser.on('error', (err: Error) => reject(err));
    parser.on('end', () => {
      void flush().then(() => resolve()).catch(reject);
    });

    readStream.pipe(parser);
  });

  return { total, stats, diagnostics };
}
