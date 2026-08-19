import type { AresSearchFilter } from './ares.types';
import { ARES_BASE_URL } from './company-directory.constants';
import type { AresPartitionContext } from './ares-import-split.util';
import { partitionLabel } from './ares-import-split.util';

export const ARES_SEARCH_ENDPOINT = `${ARES_BASE_URL}/ekonomicke-subjekty/vyhledat`;

export type AresRequestDiagnostic = {
  at: string;
  kind: 'COUNT' | 'FETCH';
  partitionIndex: number;
  partitionKey: string;
  partitionLabel: string;
  endpoint: string;
  requestBody: AresSearchFilter;
  httpStatus: number;
  pocetCelkem: number | null;
  returnedCount: number;
  firstIco: string | null;
  lastIco: string | null;
  offset: number;
  durationMs: number;
  createdInBatch: number;
  updatedInBatch: number;
  existingInBatch: number;
  skippedInBatch: number;
  duplicateResultSet: boolean;
  duplicateOfPartitionIndex: number | null;
};

export function sanitizeAresRequestBody(filter: AresSearchFilter): AresSearchFilter {
  return {
    start: filter.start ?? 0,
    pocet: filter.pocet ?? 100,
    ...(filter.ico?.length ? { ico: filter.ico } : {}),
    ...(filter.obchodniJmeno ? { obchodniJmeno: filter.obchodniJmeno } : {}),
    ...(filter.czNace?.length ? { czNace: filter.czNace } : {}),
    ...(filter.pravniForma?.length ? { pravniForma: filter.pravniForma } : {}),
    ...(filter.sidlo && Object.keys(filter.sidlo).length > 0 ? { sidlo: filter.sidlo } : {}),
  };
}

export function extractRegionFromLabel(label: string): string | null {
  const match = label.match(/kraj=([^·]+)/);
  return match ? match[1].trim() : null;
}

export function extractMunicipalityFromLabel(label: string): string | null {
  const match = label.match(/obec=([^·]+)/);
  return match ? match[1].trim() : null;
}

export function extractNaceFromLabel(label: string): string | null {
  const match = label.match(/nace=([^·]+)/);
  return match ? match[1].trim() : null;
}

export function computeRegionProgress(labels: string[], currentIndex: number) {
  const regions = [
    ...new Set(
      labels
        .map(extractRegionFromLabel)
        .filter((r): r is string => Boolean(r)),
    ),
  ];
  const currentRegion = extractRegionFromLabel(labels[currentIndex] ?? '') ?? null;
  const completedRegions = regions.filter((region) => {
    const indices = labels
      .map((label, i) => (extractRegionFromLabel(label) === region ? i : -1))
      .filter((i) => i >= 0);
    return indices.length > 0 && Math.max(...indices) < currentIndex;
  });
  const regionOrder = currentRegion ? regions.indexOf(currentRegion) + 1 : null;
  return {
    currentRegion,
    regionOrder,
    regionsTotal: regions.length > 0 ? regions.length : null,
    regionsCompleted: completedRegions.length,
  };
}

export function resultFingerprint(
  firstIco: string | null,
  lastIco: string | null,
  returnedCount: number,
  pocetCelkem: number | null,
  offset: number,
): string {
  return `${offset}|${returnedCount}|${firstIco ?? ''}|${lastIco ?? ''}|${pocetCelkem ?? ''}`;
}

export function appendDiagnostic(
  diagnostics: AresRequestDiagnostic[],
  entry: AresRequestDiagnostic,
  max = 20,
): AresRequestDiagnostic[] {
  return [...diagnostics, entry].slice(-max);
}

export function labelForFilter(filter: AresSearchFilter, ctx: AresPartitionContext): string {
  return partitionLabel(filter, ctx);
}

export function normalizeIco(ico: string): string {
  return ico.replace(/\D/g, '').padStart(8, '0');
}

export function icosFromSubjects(
  subjects: Array<{ ico: string }>,
): { firstIco: string | null; lastIco: string | null; icos: string[] } {
  if (!subjects.length) {
    return { firstIco: null, lastIco: null, icos: [] };
  }
  const icos = subjects.map((s) => normalizeIco(s.ico));
  return {
    firstIco: icos[0] ?? null,
    lastIco: icos[icos.length - 1] ?? null,
    icos,
  };
}
