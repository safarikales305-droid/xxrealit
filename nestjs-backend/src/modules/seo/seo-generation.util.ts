import { createHash } from 'node:crypto';
import { SeoContentStatus } from '@prisma/client';
import type { SeoLocation, SeoLocationKind } from '@prisma/client';
import {
  PROGRAMMATIC_SEO_INTENT_SLUGS,
  type ProgrammaticSeoIntentSlug,
} from './programmatic-seo-intents';
import { computeIndexability, type IndexabilityInput } from './seo-indexability.util';
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

/** @deprecated Použijte computeIndexability — tier už není automatický důvod noindex. */
export function resolveIndexability(
  _tier: SeoQualityTier,
  copy: {
    title: string;
    description: string;
    bodyText: string;
    h1?: string;
    wordCount?: number;
    faq?: unknown;
    internalLinks?: unknown;
    relatedLocations?: unknown;
  },
  opts?: Partial<IndexabilityInput>,
) {
  const result = computeIndexability({
    title: copy.title,
    description: copy.description,
    h1: copy.h1 ?? copy.title,
    bodyText: copy.bodyText,
    faq: copy.faq,
    internalLinks: copy.internalLinks,
    relatedLocations: copy.relatedLocations,
    publicPath: opts?.publicPath ?? '/',
    canonical: opts?.canonical,
    status: opts?.status ?? SeoContentStatus.PUBLISHED,
    locationActive: opts?.locationActive ?? true,
    hasLocalityData: opts?.hasLocalityData ?? true,
    listingCount: opts?.listingCount ?? 0,
    minScore: opts?.minScore,
    reviewScore: opts?.reviewScore,
    ...opts,
  });
  return {
    noindex: result.noindex,
    robots: result.robots,
    indexable: result.indexable,
    indexabilityReason: result.indexabilityReason,
    indexabilityScore: result.indexabilityScore,
    indexabilityChecksJson: result.indexabilityChecksJson,
    inSitemap: result.inSitemap,
  };
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

/** Vrátí true pouze pokud job explicitně filtruje kvalitu a tier do něj nepatří. */
export function shouldFilterByQualityTier(
  tier: SeoQualityTier,
  allowedTiers?: SeoQualityTier[],
): boolean {
  if (!allowedTiers?.length) return false;
  return !allowedTiers.includes(tier);
}

export function intentToOfferProperty(intentSlug: string): { offerType?: string; propertyType?: string } {
  const map: Record<string, { offerType: string; propertyType: string }> = {
    'prodej-bytu': { offerType: 'PRODEJ', propertyType: 'BYT' },
    'pronajem-bytu': { offerType: 'PRONAJEM', propertyType: 'BYT' },
    'prodej-domu': { offerType: 'PRODEJ', propertyType: 'DUM' },
    'prodej-pozemku': { offerType: 'PRODEJ', propertyType: 'POZEMEK' },
    'prodej-chaty': { offerType: 'PRODEJ', propertyType: 'CHATA' },
    'prodej-garaze': { offerType: 'PRODEJ', propertyType: 'GARAZ' },
    'prodej-komercnich-prostor': { offerType: 'PRODEJ', propertyType: 'KOMERCNI' },
    'developerske-projekty': { offerType: 'PRODEJ', propertyType: 'PROJEKT' },
    'realitni-kancelar': { offerType: 'PRODEJ', propertyType: 'KANCELAR' },
  };
  return map[intentSlug] ?? {};
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
