/**
 * Import z RapidAPI „Realty in US“ — parsování odpovědi je tolerantní k různým tvarům JSON.
 */

export const RAPID_REALTY_LIST_URL =
  'https://realty-in-us.p.rapidapi.com/properties/v2/list-for-sale';

export const RAPID_REALTY_HOST = 'realty-in-us.p.rapidapi.com';

export type MappedImportRow = {
  title: string;
  price: number | null;
  city: string;
  imageUrl: string | null;
  description: string | null;
};

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown, max = 20_000): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

function record(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

/** Najde pole inzerátů v kořeni odpovědi (různé verze API). */
export function extractPropertyItems(root: unknown): unknown[] {
  if (Array.isArray(root)) return root;
  const o = record(root);
  if (!o) return [];

  const tryPaths: unknown[] = [
    o.properties,
    o.results,
    o.listings,
    o.data,
    record(o.data)?.properties,
    record(o.data)?.results,
    record(o.data)?.listings,
    record(record(o.data)?.home_search)?.properties,
    record(record(o.data)?.home_search)?.results,
    record(o.property_search)?.properties,
    record(o.search_results)?.properties,
  ];

  for (const p of tryPaths) {
    if (Array.isArray(p) && p.length > 0) return p;
    const inner = record(p);
    if (inner) {
      for (const k of ['properties', 'results', 'listings', 'homes']) {
        const arr = inner[k];
        if (Array.isArray(arr) && arr.length > 0) return arr;
      }
    }
  }

  return [];
}

function pickAddress(r: Record<string, unknown>): Record<string, unknown> | null {
  const direct = record(r.address) ?? record(r.location);
  if (direct) return direct;
  const loc = record(r.location);
  return record(loc?.address) ?? loc;
}

function formatLocation(addr: Record<string, unknown> | null): string {
  if (!addr) return '';
  const line = str(addr.line ?? addr.street_address ?? addr.street, 200) ?? '';
  const city = str(addr.city ?? addr.name, 120) ?? '';
  const state = str(addr.state_code ?? addr.state, 20) ?? '';
  const zip = str(addr.postal_code ?? addr.zip ?? addr.zipcode, 20) ?? '';
  const parts = [line, [city, state].filter(Boolean).join(', '), zip].filter(
    (x) => x && String(x).trim().length > 0,
  );
  return parts.join(' · ').trim() || '';
}

function pickPhoto(r: Record<string, unknown>): string | null {
  const primary = record(r.primary_photo) ?? record(r.photo);
  const href =
    str(primary?.href ?? primary?.url, 2048) ??
    str(r.image_url ?? r.thumbnail, 2048);
  if (href) return href;
  const photos = r.photos;
  if (Array.isArray(photos) && photos[0]) {
    const ph = record(photos[0]);
    return str(ph?.href ?? ph?.url, 2048);
  }
  return null;
}

function pickDescription(r: Record<string, unknown>): string | null {
  const d = r.description;
  if (typeof d === 'string') return str(d, 50_000);
  const dr = record(d);
  if (dr) {
    const text = str(dr.text ?? dr.name, 50_000);
    if (text) return text;
    const lines = dr.lines;
    if (Array.isArray(lines)) {
      const joined = lines
        .map((x) => (typeof x === 'string' ? x : ''))
        .filter(Boolean)
        .join('\n');
      return str(joined, 50_000);
    }
  }
  return str(r.marketing_description ?? r.public_remarks, 50_000);
}

function buildTitle(r: Record<string, unknown>, addr: Record<string, unknown> | null): string {
  const line = addr ? str(addr.line ?? addr.street_address, 200) : null;
  const city = addr ? str(addr.city, 120) : null;
  const beds = num(r.beds ?? r.bedrooms);
  const baths = num(r.baths ?? r.baths_full);
  const type = str(r.type ?? r.prop_type ?? r.property_type, 80);
  if (line && city) {
    let t = `${line}, ${city}`;
    if (beds != null) t += ` · ${beds} bd`;
    if (baths != null) t += ` · ${baths} ba`;
    return t.slice(0, 500);
  }
  if (city && type) return `${type} — ${city}`.slice(0, 500);
  const desc = pickDescription(r);
  if (desc) return desc.slice(0, 120) + (desc.length > 120 ? '…' : '');
  return 'Imported listing';
}

export function mapRapidItemToRow(raw: unknown): MappedImportRow | null {
  const r = record(raw);
  if (!r) return null;

  const priceRaw =
    num(r.list_price) ??
    num(r.price) ??
    num(r.listing_price) ??
    num(record(r.listing)?.list_price) ??
    num(record(r.listing)?.price);

  if (priceRaw == null || priceRaw < 1) return null;

  const price = Math.min(Math.max(Math.round(priceRaw), 1), 2_147_483_647);

  const addr = pickAddress(r);
  let city = formatLocation(addr);
  if (!city) {
    city =
      str(r.location, 500) ??
      str(r.formatted_address, 500) ??
      'Unknown';
  }

  const title = buildTitle(r, addr).slice(0, 500) || 'Imported property';
  const imageUrl = pickPhoto(r);
  const description = pickDescription(r);

  return {
    title,
    price,
    city: city.slice(0, 500),
    imageUrl,
    description,
  };
}

export function mapRapidResponseToRows(json: unknown): MappedImportRow[] {
  const items = extractPropertyItems(json);
  const out: MappedImportRow[] = [];
  for (const item of items) {
    const row = mapRapidItemToRow(item);
    if (row) out.push(row);
  }
  return out;
}
