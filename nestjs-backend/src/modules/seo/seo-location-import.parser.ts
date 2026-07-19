import { BadRequestException } from '@nestjs/common';
import { parseStringPromise } from 'xml2js';
import { gunzipSync } from 'node:zlib';
import {
  SEO_LOCATION_ZIP_MAX_UNCOMPRESSED,
  sanitizeXmlInput,
} from './seo-location-import.util';

export type ParsedLocationDataset = {
  format: string;
  headers: string[];
  rows: Array<Record<string, string>>;
};

function parseCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function parseCsvBuffer(
  buffer: Buffer,
  encoding = 'utf-8',
  delimiter = ';',
): ParsedLocationDataset {
  const text = buffer.toString(encoding as BufferEncoding);
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) throw new BadRequestException('CSV soubor je prázdný.');
  const headers = parseCsvLine(lines[0]!, delimiter);
  const rows = lines.slice(1).map((line) => {
    const cols = parseCsvLine(line, delimiter);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? '';
    });
    return row;
  });
  return { format: 'csv', headers, rows };
}

export function parseJsonBuffer(buffer: Buffer): ParsedLocationDataset {
  const parsed = JSON.parse(buffer.toString('utf-8')) as unknown;
  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { rows?: unknown }).rows)
      ? (parsed as { rows: unknown[] }).rows
      : Array.isArray((parsed as { data?: unknown }).data)
        ? (parsed as { data: unknown[] }).data
        : null;
  if (!arr?.length) throw new BadRequestException('JSON neobsahuje pole záznamů.');
  const rows = arr.map((item) => flattenRecord(item as Record<string, unknown>));
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return { format: 'json', headers, rows };
}

function flattenRecord(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flattenRecord(v as Record<string, unknown>, key));
    } else {
      out[key] = v == null ? '' : String(v);
    }
  }
  return out;
}

export async function parseXmlBuffer(buffer: Buffer): Promise<ParsedLocationDataset> {
  const safe = sanitizeXmlInput(buffer.toString('utf-8'));
  const parsed = await parseStringPromise(safe, {
    explicitArray: false,
    trim: true,
    mergeAttrs: true,
  });
  const items = findXmlItems(parsed);
  if (!items.length) throw new BadRequestException('XML neobsahuje žádné záznamy.');
  const rows = items.map((item) => flattenRecord(item));
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return { format: 'xml', headers, rows };
}

function findXmlItems(node: unknown): Array<Record<string, unknown>> {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) {
    return node.flatMap((n) => findXmlItems(n));
  }
  const obj = node as Record<string, unknown>;
  for (const value of Object.values(obj)) {
    if (Array.isArray(value) && value.length && typeof value[0] === 'object') {
      return value as Array<Record<string, unknown>>;
    }
  }
  for (const value of Object.values(obj)) {
    const nested = findXmlItems(value);
    if (nested.length) return nested;
  }
  return [obj];
}

export function parseGzipBuffer(buffer: Buffer, innerFormat: string, opts?: { delimiter?: string }): ParsedLocationDataset {
  const inflated = gunzipSync(buffer, { maxOutputLength: SEO_LOCATION_ZIP_MAX_UNCOMPRESSED });
  return parseBufferByFormat(inflated, innerFormat, opts);
}

/** Minimal ZIP reader — first matching data file only, ZIP bomb protected. */
export function parseZipBuffer(buffer: Buffer, opts?: { delimiter?: string }): ParsedLocationDataset {
  let offset = 0;
  let totalUncompressed = 0;
  while (offset + 30 <= buffer.length) {
    const sig = buffer.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;
    const compMethod = buffer.readUInt16LE(offset + 8);
    const compSize = buffer.readUInt32LE(offset + 18);
    const nameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLen).toString('utf-8');
    const dataStart = offset + 30 + nameLen + extraLen;
    const dataEnd = dataStart + compSize;
    if (dataEnd > buffer.length) break;
    const payload = buffer.subarray(dataStart, dataEnd);
    offset = dataEnd;
    if (name.startsWith('__MACOSX/') || name.endsWith('/')) continue;
    const lower = name.toLowerCase();
    if (!/\.(csv|json|xml|gml)$/.test(lower)) continue;
    let fileBuf: Buffer;
    if (compMethod === 0) fileBuf = payload;
    else if (compMethod === 8) {
      totalUncompressed += compSize * 4;
      if (totalUncompressed > SEO_LOCATION_ZIP_MAX_UNCOMPRESSED) {
        throw new BadRequestException('ZIP překračuje bezpečnostní limit (ZIP bomb ochrana).');
      }
      fileBuf = gunzipSync(payload, { maxOutputLength: SEO_LOCATION_ZIP_MAX_UNCOMPRESSED });
    } else continue;
    const fmt = lower.endsWith('.json') ? 'json' : lower.endsWith('.xml') || lower.endsWith('.gml') ? 'xml' : 'csv';
    return parseBufferByFormat(fileBuf, fmt, opts);
  }
  throw new BadRequestException('ZIP neobsahuje podporovaný CSV/JSON/XML soubor.');
}

export function parseBufferByFormat(
  buffer: Buffer,
  format: string,
  opts?: { delimiter?: string; encoding?: string },
): ParsedLocationDataset {
  const fmt = format.toLowerCase();
  if (fmt === 'csv') return parseCsvBuffer(buffer, opts?.encoding ?? 'utf-8', opts?.delimiter ?? ';');
  if (fmt === 'json') return parseJsonBuffer(buffer);
  if (fmt === 'xml' || fmt === 'gml') {
    return parseXmlBuffer(buffer) as unknown as ParsedLocationDataset;
  }
  if (fmt === 'gz') return parseGzipBuffer(buffer, 'csv', opts);
  if (fmt === 'zip') return parseZipBuffer(buffer, opts);
  throw new BadRequestException(`Nepodporovaný formát: ${format}`);
}

export async function parseUploadBuffer(
  buffer: Buffer,
  format: string,
  opts?: { delimiter?: string; encoding?: string },
): Promise<ParsedLocationDataset> {
  const fmt = format.toLowerCase();
  if (fmt === 'xml' || fmt === 'gml') {
    const result = await parseXmlBuffer(buffer);
    return result;
  }
  return parseBufferByFormat(buffer, fmt, opts);
}
