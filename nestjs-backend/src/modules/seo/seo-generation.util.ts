import { createHash } from 'node:crypto';
import type { SeoLocation, SeoLocationKind } from '@prisma/client';
import {
  PROGRAMMATIC_SEO_INTENT_SLUGS,
  type ProgrammaticSeoIntentSlug,
} from './programmatic-seo-intents';
import {
  SEO_GENERATION_VERSION,
  SEO_LOCATION_KINDS_FOR_PAGES,
  type SeoGenerationFilters,
  type SeoQualityTier,
} from './seo-generation-job.constants';

export function clampBatchSize(size?: number): number {
  const n = size ?? 100;
  return Math.min(200, Math.max(50, n));
}

export function computeContentChecksum(parts: {
  pageKey: string;
  title: string;
  description: string;
  h1: string;
  bodyText: string;
}): string {
  const raw = [parts.pageKey, parts.title, parts.description, parts.h1, parts.bodyText].join('|');
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

export function getLocationQualityTier(loc: Pick<SeoLocation, 'kind' | 'population'>): SeoQualityTier {
  const pop = loc.population ?? 0;
  if (loc.kind === 'MESTO' || pop >= 5_000) return 'HIGH';
  if (loc.kind === 'MESTYS' || pop >= 500) return 'MEDIUM';
  if (loc.kind === 'OBEC' && pop >= 200) return 'MEDIUM';
  if (loc.kind === 'MESTSKA_CAST') return 'MEDIUM';
  return 'LOW';
}

export function resolveIndexability(
  tier: SeoQualityTier,
  copy: { title: string; description: string; bodyText: string; wordCount?: number },
): { noindex: boolean; robots: string } {
  const wordCount = copy.wordCount ?? copy.bodyText.split(/\s+/).filter(Boolean).length;
  if (tier === 'LOW') return { noindex: true, robots: 'noindex,follow' };
  if (!copy.title.trim() || !copy.description.trim() || !copy.bodyText.trim()) {
    return { noindex: true, robots: 'noindex,follow' };
  }
  if (wordCount < 200) return { noindex: true, robots: 'noindex,follow' };
  if (copy.title.length > 70 || copy.description.length > 170) {
    return { noindex: true, robots: 'noindex,follow' };
  }
  return { noindex: false, robots: 'index,follow' };
}

export function filterIntents(filters?: SeoGenerationFilters): ProgrammaticSeoIntentSlug[] {
  if (filters?.intentSlug && PROGRAMMATIC_SEO_INTENT_SLUGS.includes(filters.intentSlug as never)) {
    return [filters.intentSlug as ProgrammaticSeoIntentSlug];
  }
  return [...PROGRAMMATIC_SEO_INTENT_SLUGS];
}

export function buildLocationWhere(filters?: SeoGenerationFilters) {
  const kinds: SeoLocationKind[] = [...SEO_LOCATION_KINDS_FOR_PAGES];
  return {
    isActive: true,
    seoEnabled: true,
    kind: { in: kinds },
    ...(filters?.regionId ? { regionId: filters.regionId } : {}),
    ...(filters?.districtId ? { districtId: filters.districtId } : {}),
    ...(filters?.locationId ? { id: filters.locationId } : {}),
  };
}

export function cursorToPair(
  cursor: number,
  intentSlugs: ProgrammaticSeoIntentSlug[],
): { locationOffset: number; intentIndex: number } {
  const intentCount = Math.max(1, intentSlugs.length);
  return {
    locationOffset: Math.floor(cursor / intentCount),
    intentIndex: cursor % intentCount,
  };
}

export function pairLabel(intentSlug: string, locationSlug: string, locationName?: string): string {
  return `${intentSlug}/${locationSlug}${locationName ? ` (${locationName})` : ''}`;
}

export function seoLocationToCopyInput(loc: SeoLocation) {
  const kindMap: Partial<Record<SeoLocationKind, 'mesto' | 'obec' | 'cast'>> = {
    MESTO: 'mesto',
    MESTYS: 'mesto',
    OBEC: 'obec',
    MESTSKA_CAST: 'cast',
    KRAJ: 'mesto',
    OKRES: 'mesto',
    CAST_OBCE: 'obec',
  };
  return {
    slug: loc.slug,
    name: loc.name,
    locative: loc.locative || loc.name,
    kind: kindMap[loc.kind] ?? 'obec',
    searchTerms: loc.searchTerms,
    population: loc.population ?? undefined,
  };
}

export { SEO_GENERATION_VERSION };
