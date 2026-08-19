import { createHash } from 'crypto';
import type { AresSearchFilter } from './ares.types';
import { sanitizeAresRequestBody } from './ares-import-diagnostics.util';

export function canonicalizeAresRequest(filter: AresSearchFilter): AresSearchFilter {
  const body = sanitizeAresRequestBody(filter);
  const sorted: AresSearchFilter = {
    start: body.start ?? 0,
    pocet: body.pocet ?? 100,
  };
  if (body.ico?.length) sorted.ico = [...body.ico].sort();
  if (body.obchodniJmeno) sorted.obchodniJmeno = body.obchodniJmeno;
  if (body.czNace?.length) sorted.czNace = [...body.czNace].sort();
  if (body.pravniForma?.length) sorted.pravniForma = [...body.pravniForma].sort();
  if (body.sidlo) {
    const sidlo = { ...body.sidlo };
    sorted.sidlo = Object.fromEntries(
      Object.entries(sidlo).sort(([a], [b]) => a.localeCompare(b)),
    ) as AresSearchFilter['sidlo'];
  }
  return sorted;
}

export function aresRequestHash(filter: AresSearchFilter): string {
  const canonical = canonicalizeAresRequest(filter);
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0, 32);
}

export function responseIcoFingerprint(icos: string[]): string {
  const sorted = [...new Set(icos.map((i) => i.replace(/\D/g, '').padStart(8, '0')))].sort();
  return createHash('sha256').update(sorted.join(',')).digest('hex').slice(0, 32);
}

export function fingerprintOverlapRatio(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let overlap = 0;
  for (const ico of setA) {
    if (setB.has(ico)) overlap++;
  }
  return overlap / Math.max(setA.size, setB.size);
}
