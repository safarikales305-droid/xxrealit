import { createHash } from 'node:crypto';
import type { PropertySearchResult } from './ai-property-finder.types';

export function normalizeListingUrl(raw: string): string {
  try {
    const url = new URL(raw.trim());
    url.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm', 'fbclid', 'gclid'].forEach((k) =>
      url.searchParams.delete(k),
    );
    return url.href;
  } catch {
    return raw.trim();
  }
}

export function dedupePropertyResults(rows: PropertySearchResult[]): PropertySearchResult[] {
  const seen = new Map<string, PropertySearchResult>();
  for (const row of rows) {
    const key =
      row.isInternal && row.id
        ? `internal:${row.id}`
        : `url:${normalizeListingUrl(row.canonicalUrl || row.sourceUrl)}`;
    const existing = seen.get(key);
    if (!existing || row.matchScore > existing.matchScore) {
      seen.set(key, row);
    }
  }
  return [...seen.values()].sort((a, b) => b.matchScore - a.matchScore);
}

export function buildSearchCacheKey(criteria: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(criteria)).digest('hex').slice(0, 24);
}

export function filterResultsWithRequiredUrl(rows: PropertySearchResult[]): PropertySearchResult[] {
  return rows.filter((r) => {
    const url = (r.sourceUrl ?? '').trim();
    if (r.isInternal && url.startsWith('/')) return true;
    return url.startsWith('http://') || url.startsWith('https://');
  });
}
