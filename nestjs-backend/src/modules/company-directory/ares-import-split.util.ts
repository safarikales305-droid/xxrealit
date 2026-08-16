import type { AresSearchFilter } from './ares.types';
import { AresApiException } from './ares.service';
import { CZECH_REGIONS } from './company-directory.constants';
import { OKRES_NAMES_BY_KRAJ_CODE } from './czech-ares-geo.constants';
import { naceCodesForCategory } from './ares-activity.mapper';
import type { CompanyDirectoryCategory } from '@prisma/client';

export const ARES_MAX_RESULTS_PER_QUERY = 1000;
export const MAX_PARTITION_DEPTH = 6;

export type AresImportPhase =
  | 'DISCOVERING'
  | 'PARTITIONING'
  | 'RUNNING'
  | 'PAUSED';

export type AresSearchCheckpoint = {
  mode: 'SEARCH';
  phase: AresImportPhase;
  subQueries: AresSearchFilter[];
  subQueryLabels: string[];
  subQueryIndex: number;
  subQueryStart: number;
  subQueryTotals: number[];
  subQueryDepths: number[];
  aggregateTotal: number | null;
  importLimit: number | null;
  currentCompanyName: string | null;
  currentPartitionLabel: string | null;
  currentBatchFrom: number | null;
  currentBatchTo: number | null;
  regionsCompleted: number;
  regionsTotal: number | null;
  rawResults: number;
  duplicatesSkipped: number;
  stopped: boolean;
  needsResplit: boolean;
};

export type AresPartitionContext = {
  category?: CompanyDirectoryCategory | null;
  region?: string | null;
  district?: string | null;
  city?: string | null;
  wholeCountry?: boolean;
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

const WHOLE_COUNTRY_PATTERNS = [
  'celá čr',
  'cela cr',
  'celá cr',
  'celé čr',
  'celé cr',
  'čr',
  'cr',
  'česká republika',
  'ceska republika',
  'celá republika',
  'whole country',
  'czech republic',
];

export function isWholeCountryRegion(region?: string | null): boolean {
  if (!region?.trim()) return false;
  const n = region.trim().toLowerCase();
  return WHOLE_COUNTRY_PATTERNS.some((p) => n === p || n.includes(p));
}

export function regionNameToKodKraje(region?: string | null): number | undefined {
  if (!region?.trim() || isWholeCountryRegion(region)) return undefined;
  const normalized = region.trim().toLowerCase();
  const hit = CZECH_REGIONS.find(
    (r) =>
      r.name.toLowerCase() === normalized ||
      r.name.toLowerCase().includes(normalized) ||
      normalized.includes(r.name.toLowerCase()),
  );
  return hit?.code;
}

export function regionCodeToName(code?: number | null): string | null {
  if (code == null) return null;
  return CZECH_REGIONS.find((r) => r.code === code)?.name ?? null;
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

export function isPragueFilter(sidlo?: AresSearchFilter['sidlo']): boolean {
  if (!sidlo) return false;
  if (sidlo.kodKraje === 19) return true;
  const obec = (sidlo.nazevObce ?? '').toLowerCase();
  return obec === 'praha' || obec.startsWith('praha ');
}

export function pragueDistrictFilters(): Array<NonNullable<AresSearchFilter['sidlo']>> {
  const districts = Array.from({ length: 22 }, (_, i) => ({
    nazevObce: `Praha ${i + 1}`,
  }));
  districts.push({ nazevObce: 'Praha' });
  return districts;
}

function singleNaceCodes(base: AresSearchFilter, ctx: AresPartitionContext): Array<string | undefined> {
  if (base.czNace && base.czNace.length === 1) return [base.czNace[0]];
  const codes =
    base.czNace && base.czNace.length > 0
      ? [...base.czNace]
      : ctx.category
        ? naceCodesForCategory(ctx.category)
        : [];
  return codes.length > 0 ? codes : [undefined];
}

function mergeSidlo(
  base: AresSearchFilter['sidlo'],
  patch: NonNullable<AresSearchFilter['sidlo']>,
): NonNullable<AresSearchFilter['sidlo']> {
  const merged = { ...(base ?? {}), ...patch };
  delete merged.textovaAdresa;
  return merged;
}

function buildPartition(
  base: AresSearchFilter,
  nace: string | undefined,
  sidlo: NonNullable<AresSearchFilter['sidlo']>,
): AresSearchFilter {
  const next: AresSearchFilter = { start: 0, pocet: base.pocet };
  if (nace) next.czNace = [nace];
  const merged = mergeSidlo(base.sidlo, sidlo);
  if (Object.keys(merged).length > 0) next.sidlo = merged;
  return next;
}

export function partitionLabel(filter: AresSearchFilter, ctx: AresPartitionContext): string {
  const nace = filter.czNace?.join(',') ?? ctx.category ?? '—';
  const sidlo = filter.sidlo ?? {};
  const parts = [
    ctx.category ? `cat=${ctx.category}` : null,
    nace !== ctx.category ? `nace=${nace}` : null,
    sidlo.kodKraje != null ? `kraj=${regionCodeToName(sidlo.kodKraje) ?? sidlo.kodKraje}` : null,
    sidlo.nazevOkresu ? `okres=${sidlo.nazevOkresu}` : null,
    sidlo.nazevObce ? `obec=${sidlo.nazevObce}` : null,
    sidlo.textovaAdresa ? `addr=${sidlo.textovaAdresa}` : null,
  ].filter(Boolean);
  return parts.join(' · ') || 'root';
}

export function buildInitialPartitions(
  base: AresSearchFilter,
  ctx: AresPartitionContext,
): Array<{ filter: AresSearchFilter; label: string; depth: number }> {
  const naceList = singleNaceCodes(base, ctx);

  if (ctx.wholeCountry || isWholeCountryRegion(ctx.region)) {
    const out: Array<{ filter: AresSearchFilter; label: string; depth: number }> = [];
    for (const region of CZECH_REGIONS) {
      if (region.code === 19) {
        for (const district of pragueDistrictFilters()) {
          for (const nace of naceList) {
            const filter = buildPartition(base, nace, { kodKraje: 19, ...district });
            out.push({
              filter,
              label: partitionLabel(filter, { ...ctx, region: region.name }),
              depth: 1,
            });
          }
        }
      } else {
        for (const nace of naceList) {
          const filter = buildPartition(base, nace, { kodKraje: region.code });
          out.push({
            filter,
            label: partitionLabel(filter, { ...ctx, region: region.name }),
            depth: 1,
          });
        }
      }
    }
    return dedupePartitionSpecs(out);
  }

  if (isPragueLocation(ctx.city, ctx.region)) {
    const out: Array<{ filter: AresSearchFilter; label: string; depth: number }> = [];
    for (const district of pragueDistrictFilters()) {
      for (const nace of naceList) {
        const filter = buildPartition(base, nace, { kodKraje: 19, ...district });
        out.push({
          filter,
          label: partitionLabel(filter, ctx),
          depth: 1,
        });
      }
    }
    return dedupePartitionSpecs(out);
  }

  return splitAresSearchFilter(base, ctx).map((filter, i) => ({
    filter,
    label: partitionLabel(filter, ctx),
    depth: 0,
  }));
}

/**
 * Rozdělí široký ARES dotaz na menší poddotazy (max 1000 výsledků / dotaz).
 */
export function splitAresSearchFilter(
  base: AresSearchFilter,
  ctx: AresPartitionContext,
): AresSearchFilter[] {
  return buildInitialPartitions(base, ctx).map((p) => p.filter);
}

/** Rekurzivní dělení jednoho partitionu, který stále vrací >1000 výsledků. */
export function splitPartitionFurther(
  filter: AresSearchFilter,
  ctx: AresPartitionContext,
  depth: number,
): Array<{ filter: AresSearchFilter; label: string; depth: number }> {
  if (depth >= MAX_PARTITION_DEPTH) return [];

  const naceList = singleNaceCodes(filter, ctx);
  const sidlo = filter.sidlo ?? {};

  if (isPragueFilter(sidlo) && !sidlo.nazevObce?.match(/Praha \d+/)) {
    const out: Array<{ filter: AresSearchFilter; label: string; depth: number }> = [];
    for (const district of pragueDistrictFilters()) {
      for (const nace of naceList) {
        const child = buildPartition(filter, nace, { kodKraje: 19, ...district });
        out.push({ filter: child, label: partitionLabel(child, ctx), depth: depth + 1 });
      }
    }
    return dedupePartitionSpecs(out);
  }

  if (sidlo.kodKraje && !sidlo.nazevOkresu && !sidlo.nazevObce) {
    const okresy = OKRES_NAMES_BY_KRAJ_CODE[sidlo.kodKraje] ?? [];
    if (okresy.length > 0) {
      const out: Array<{ filter: AresSearchFilter; label: string; depth: number }> = [];
      for (const nazevOkresu of okresy) {
        for (const nace of naceList) {
          const child = buildPartition(filter, nace, {
            kodKraje: sidlo.kodKraje,
            nazevOkresu,
          });
          out.push({ filter: child, label: partitionLabel(child, ctx), depth: depth + 1 });
        }
      }
      return dedupePartitionSpecs(out);
    }
  }

  if (!sidlo.kodKraje && !sidlo.nazevObce && !sidlo.nazevOkresu) {
    return buildInitialPartitions(filter, { ...ctx, wholeCountry: true });
  }

  if (naceList.length > 1 || (filter.czNace?.length ?? 0) > 1) {
    const out: Array<{ filter: AresSearchFilter; label: string; depth: number }> = [];
    for (const nace of naceList) {
      const child = buildPartition(filter, nace, sidlo);
      out.push({ filter: child, label: partitionLabel(child, ctx), depth: depth + 1 });
    }
    return dedupePartitionSpecs(out);
  }

  return [];
}

function dedupePartitionSpecs(
  specs: Array<{ filter: AresSearchFilter; label: string; depth: number }>,
): Array<{ filter: AresSearchFilter; label: string; depth: number }> {
  const seen = new Set<string>();
  const out: typeof specs = [];
  for (const spec of specs) {
    const key = JSON.stringify({
      czNace: spec.filter.czNace ?? [],
      sidlo: spec.filter.sidlo ?? {},
    });
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(spec);
  }
  return out;
}

export function buildAresSearchFilter(input: {
  category?: CompanyDirectoryCategory | null;
  region?: string | null;
  district?: string | null;
  city?: string | null;
}): AresSearchFilter {
  const wholeCountry = isWholeCountryRegion(input.region);
  const kodKraje = wholeCountry ? undefined : regionNameToKodKraje(input.region);
  const czNace = input.category ? naceCodesForCategory(input.category) : undefined;

  const sidlo: NonNullable<AresSearchFilter['sidlo']> = {};

  if (input.district?.trim()) {
    sidlo.nazevObce = input.district.trim();
  } else if (input.city?.trim() && !isPragueLocation(input.city, input.region)) {
    sidlo.nazevObce = input.city.trim();
  } else if (input.city?.trim() && isPragueLocation(input.city, input.region)) {
    sidlo.kodKraje = 19;
    sidlo.nazevObce = 'Praha 1';
  } else if (kodKraje) {
    sidlo.kodKraje = kodKraje;
  }

  const filter: AresSearchFilter = {};
  if (czNace && czNace.length > 0) filter.czNace = czNace;
  if (Object.keys(sidlo).length > 0) filter.sidlo = sidlo;
  return filter;
}

export function createEmptySearchCheckpoint(importLimit: number | null): AresSearchCheckpoint {
  return {
    mode: 'SEARCH',
    phase: 'DISCOVERING',
    subQueries: [],
    subQueryLabels: [],
    subQueryIndex: 0,
    subQueryStart: 0,
    subQueryTotals: [],
    subQueryDepths: [],
    aggregateTotal: null,
    importLimit,
    currentCompanyName: null,
    currentPartitionLabel: null,
    currentBatchFrom: null,
    currentBatchTo: null,
    regionsCompleted: 0,
    regionsTotal: null,
    rawResults: 0,
    duplicatesSkipped: 0,
    stopped: false,
    needsResplit: false,
  };
}

export function parseSearchCheckpoint(raw: unknown): AresSearchCheckpoint | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (c.mode !== 'SEARCH' || !Array.isArray(c.subQueries)) return null;
  return {
    mode: 'SEARCH',
    phase: (c.phase as AresImportPhase) ?? 'RUNNING',
    subQueries: c.subQueries as AresSearchFilter[],
    subQueryLabels: Array.isArray(c.subQueryLabels)
      ? (c.subQueryLabels as string[])
      : (c.subQueries as AresSearchFilter[]).map((_, i) => `partition-${i + 1}`),
    subQueryIndex: Number(c.subQueryIndex ?? 0) || 0,
    subQueryStart: Number(c.subQueryStart ?? 0) || 0,
    subQueryTotals: Array.isArray(c.subQueryTotals) ? (c.subQueryTotals as number[]) : [],
    subQueryDepths: Array.isArray(c.subQueryDepths) ? (c.subQueryDepths as number[]) : [],
    aggregateTotal: c.aggregateTotal != null ? Number(c.aggregateTotal) : null,
    importLimit: c.importLimit != null ? Number(c.importLimit) : null,
    currentCompanyName:
      typeof c.currentCompanyName === 'string' ? c.currentCompanyName : null,
    currentPartitionLabel:
      typeof c.currentPartitionLabel === 'string' ? c.currentPartitionLabel : null,
    currentBatchFrom: c.currentBatchFrom != null ? Number(c.currentBatchFrom) : null,
    currentBatchTo: c.currentBatchTo != null ? Number(c.currentBatchTo) : null,
    regionsCompleted: Number(c.regionsCompleted ?? 0) || 0,
    regionsTotal: c.regionsTotal != null ? Number(c.regionsTotal) : null,
    rawResults: Number(c.rawResults ?? 0) || 0,
    duplicatesSkipped: Number(c.duplicatesSkipped ?? 0) || 0,
    stopped: c.stopped === true,
    needsResplit: c.needsResplit === true,
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

export function countDistinctRegionsInPartitions(labels: string[]): number {
  const regions = new Set<string>();
  for (const label of labels) {
    const match = label.match(/kraj=([^·]+)/);
    if (match) regions.add(match[1].trim());
  }
  return regions.size;
}
