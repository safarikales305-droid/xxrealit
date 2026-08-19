import type { AresSearchFilter } from './ares.types';
import { subdivideNaceCode } from './ares-import-split.util';

export type NacePartitionSpec = {
  filter: AresSearchFilter;
  label: string;
  depth: number;
  naceCode: string;
};

/** Build national NACE partitions for master sync (no portálová kategorie). */
export function buildNaceMasterPartitions(pageSize = 100): NacePartitionSpec[] {
  const out: NacePartitionSpec[] = [];
  const seen = new Set<string>();

  function add(code: string, depth: number) {
    const key = code;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      filter: { start: 0, pocet: pageSize, czNace: [code] },
      label: `nace=${code}`,
      depth,
      naceCode: code,
    });
  }

  for (let i = 1; i <= 99; i++) {
    add(String(i).padStart(2, '0'), 0);
  }

  for (const base of [...seen]) {
    if (base.length !== 2) continue;
    for (const sub of subdivideNaceCode(base)) {
      add(sub, 1);
    }
  }

  for (const base of [...seen]) {
    if (base.length !== 3) continue;
    for (const sub of subdivideNaceCode(base)) {
      add(sub, 2);
    }
  }

  return out.sort((a, b) => a.naceCode.localeCompare(b.naceCode));
}

/** Municipalities verified via ARES kodObce filter (expand over time). */
export const CZECH_CITY_KOD_OBCE: Record<string, number> = {
  praha: 554782,
  pardubice: 555134,
  lukavice: 571768,
  'hradec králové': 569810,
  'hradec kralove': 569810,
};

export function resolveCityKodObce(city: string): number | null {
  const key = city
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  return CZECH_CITY_KOD_OBCE[key] ?? null;
}
