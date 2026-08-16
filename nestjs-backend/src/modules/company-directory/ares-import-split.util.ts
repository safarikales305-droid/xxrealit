import type { AresSearchFilter } from './ares.types';
import { AresApiException } from './ares.service';
import { CZECH_REGIONS } from './company-directory.constants';
import { naceCodesForCategory } from './ares-activity.mapper';
import type { CompanyDirectoryCategory } from '@prisma/client';

export const ARES_MAX_RESULTS_PER_QUERY = 1000;

export type AresSearchCheckpoint = {
  mode: 'SEARCH';
  subQueries: AresSearchFilter[];
  subQueryIndex: number;
  subQueryStart: number;
  subQueryTotals: number[];
  aggregateTotal: number | null;
  importLimit: number | null;
  currentCompanyName: string | null;
  currentBatchFrom: number | null;
  currentBatchTo: number | null;
  stopped: boolean;
};

export function isAresTooManyResultsError(err: unknown): boolean {
  if (!(err instanceof AresApiException)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('příliš mnoho') ||
    msg.includes('maximum') ||
    msg.includes('maximálně') ||
    msg.includes('1 000') ||
    msg.includes('1000')
  );
}

export function regionNameToKodKraje(region?: string | null): number | undefined {
  if (!region?.trim()) return undefined;
  const normalized = region.trim().toLowerCase();
  const hit = CZECH_REGIONS.find(
    (r) =>
      r.name.toLowerCase() === normalized ||
      r.name.toLowerCase().includes(normalized) ||
      normalized.includes(r.name.toLowerCase()),
  );
  return hit?.code;
}

export function isPragueLocation(city?: string | null, region?: string | null): boolean {
  const c = (city ?? '').trim().toLowerCase();
  const r = (region ?? '').trim().toLowerCase();
  return (
    c === 'praha' ||
    c.startsWith('praha ') ||
    r.includes('praha') ||
    r.includes('hlavní město praha')
  );
}

export function pragueDistrictFilters(): Array<NonNullable<AresSearchFilter['sidlo']>> {
  const districts = Array.from({ length: 22 }, (_, i) => ({
    nazevObce: `Praha ${i + 1}`,
  }));
  districts.push({ nazevObce: 'Praha' });
  return districts;
}

/**
 * Rozdělí široký ARES dotaz na menší poddotazy podporované API (max 1000 výsledků / dotaz).
 */
export function splitAresSearchFilter(
  base: AresSearchFilter,
  ctx: {
    city?: string | null;
    region?: string | null;
    district?: string | null;
    category?: CompanyDirectoryCategory | null;
  },
): AresSearchFilter[] {
  const naceCodes =
    base.czNace && base.czNace.length > 0
      ? [...base.czNace]
      : ctx.category
        ? naceCodesForCategory(ctx.category)
        : [undefined];

  const locationSlices = expandLocationSlices(ctx);
  const results: AresSearchFilter[] = [];

  for (const nace of naceCodes.length > 0 ? naceCodes : [undefined]) {
    for (const sidlo of locationSlices) {
      const next: AresSearchFilter = {
        ...base,
        start: 0,
        pocet: base.pocet,
      };
      if (nace) next.czNace = [nace];
      else delete next.czNace;

      next.sidlo = {
        ...(base.sidlo ?? {}),
        ...sidlo,
      };
      if (Object.keys(next.sidlo).length === 0) delete next.sidlo;

      results.push(next);
    }
  }

  return dedupeFilters(results);
}

function expandLocationSlices(ctx: {
  city?: string | null;
  region?: string | null;
  district?: string | null;
}): Array<NonNullable<AresSearchFilter['sidlo']>> {
  if (isPragueLocation(ctx.city, ctx.region)) {
    return pragueDistrictFilters();
  }

  const district = ctx.district?.trim();
  if (district) {
    return [{ nazevObce: district }];
  }

  const city = ctx.city?.trim();
  if (city) {
    return [{ nazevObce: city }];
  }

  const kodKraje = regionNameToKodKraje(ctx.region);
  if (kodKraje) {
    return [{ kodKraje }];
  }

  return [{}];
}

function dedupeFilters(filters: AresSearchFilter[]): AresSearchFilter[] {
  const seen = new Set<string>();
  const out: AresSearchFilter[] = [];
  for (const f of filters) {
    const key = JSON.stringify({
      czNace: f.czNace ?? [],
      sidlo: f.sidlo ?? {},
    });
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

export function buildAresSearchFilter(input: {
  category?: CompanyDirectoryCategory | null;
  region?: string | null;
  district?: string | null;
  city?: string | null;
}): AresSearchFilter {
  const kodKraje = regionNameToKodKraje(input.region);
  const czNace = input.category ? naceCodesForCategory(input.category) : undefined;

  const sidlo: NonNullable<AresSearchFilter['sidlo']> = {};

  if (input.district?.trim()) {
    sidlo.nazevObce = input.district.trim();
  } else if (input.city?.trim() && !isPragueLocation(input.city, input.region)) {
    sidlo.nazevObce = input.city.trim();
  } else if (input.city?.trim() && isPragueLocation(input.city, input.region)) {
    // Praha se řeší split logikou; základní filtr použije první district při běhu
    sidlo.nazevObce = 'Praha 1';
  } else if (kodKraje) {
    sidlo.kodKraje = kodKraje;
  } else if (input.region?.trim()) {
    sidlo.textovaAdresa = input.region.trim();
  }

  const filter: AresSearchFilter = {};
  if (czNace && czNace.length > 0) filter.czNace = czNace;
  if (Object.keys(sidlo).length > 0) filter.sidlo = sidlo;
  return filter;
}

export function parseSearchCheckpoint(raw: unknown): AresSearchCheckpoint | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (c.mode !== 'SEARCH' || !Array.isArray(c.subQueries)) return null;
  return {
    mode: 'SEARCH',
    subQueries: c.subQueries as AresSearchFilter[],
    subQueryIndex: Number(c.subQueryIndex ?? 0) || 0,
    subQueryStart: Number(c.subQueryStart ?? 0) || 0,
    subQueryTotals: Array.isArray(c.subQueryTotals)
      ? (c.subQueryTotals as number[])
      : [],
    aggregateTotal: c.aggregateTotal != null ? Number(c.aggregateTotal) : null,
    importLimit: c.importLimit != null ? Number(c.importLimit) : null,
    currentCompanyName:
      typeof c.currentCompanyName === 'string' ? c.currentCompanyName : null,
    currentBatchFrom: c.currentBatchFrom != null ? Number(c.currentBatchFrom) : null,
    currentBatchTo: c.currentBatchTo != null ? Number(c.currentBatchTo) : null,
    stopped: c.stopped === true,
  };
}

export function computeAggregateTotal(
  subQueryTotals: number[],
  importLimit: number | null,
): number | null {
  if (subQueryTotals.length === 0) return null;
  const sum = subQueryTotals.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  if (importLimit != null && importLimit > 0) return Math.min(sum, importLimit);
  return sum;
}
