import type { Prisma } from '@prisma/client';

export function foldDiacritics(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function searchVariants(term: string): string[] {
  const raw = term.trim();
  if (!raw) return [];
  const folded = foldDiacritics(raw);
  return [...new Set([raw, folded].filter(Boolean))];
}

/** Shoda v libovolném adresním poli inzerátu (město, okres, kraj, ulice, PSČ v adrese). */
export function buildPropertyLocationMatchWhere(term: string): Prisma.PropertyWhereInput {
  const variants = searchVariants(term);
  if (variants.length === 0) return {};

  const fields = ['city', 'district', 'region', 'address'] as const;
  const OR: Prisma.PropertyWhereInput[] = [];
  for (const field of fields) {
    for (const variant of variants) {
      OR.push({ [field]: { contains: variant, mode: 'insensitive' } });
    }
  }
  return { OR };
}

/** Více vybraných lokalit — OR mezi lokalitami. */
export function buildPropertyLocationsWhere(terms: string[]): Prisma.PropertyWhereInput {
  const cleaned = terms.map((t) => t.trim()).filter(Boolean);
  if (cleaned.length === 0) return {};
  if (cleaned.length === 1) return buildPropertyLocationMatchWhere(cleaned[0]);
  return { OR: cleaned.map((t) => buildPropertyLocationMatchWhere(t)) };
}

export function locationSearchScore(
  row: { city: string; district: string; region: string; label: string },
  query: string,
): number {
  const q = query.trim().toLowerCase();
  const qFold = foldDiacritics(q);
  if (!q) return 0;
  const parts = [row.city, row.district, row.region, row.label]
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  let best = 0;
  for (const part of parts) {
    const partFold = foldDiacritics(part);
    if (part === q || partFold === qFold) best = Math.max(best, 100);
    else if (part.startsWith(q) || partFold.startsWith(qFold)) best = Math.max(best, 80);
    else if (part.includes(q) || partFold.includes(qFold)) best = Math.max(best, 50);
  }
  return best;
}
