import type { PublicPropertyListFilters } from '../properties/properties.service';

export function parsePublicPropertyListFiltersQuery(query: {
  city?: string;
  cities?: string;
  location?: string;
  propertyTypeKey?: string;
  importCategoryKey?: string;
  sourcePortalKey?: string;
  priceMinRaw?: string;
  priceMaxRaw?: string;
  tipsOnlyRaw?: string;
}): PublicPropertyListFilters {
  const parsePrice = (raw?: string): number | undefined => {
    if (raw == null || !String(raw).trim()) return undefined;
    const n = Math.trunc(Number(String(raw).replace(/\s/g, '')));
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  return {
    city: query.city?.trim() || undefined,
    cities: query.cities?.trim() || undefined,
    location: query.location?.trim() || undefined,
    propertyTypeKey: query.propertyTypeKey?.trim() || undefined,
    importCategoryKey: query.importCategoryKey?.trim() || undefined,
    sourcePortalKey: query.sourcePortalKey?.trim() || undefined,
    priceMin: parsePrice(query.priceMinRaw),
    priceMax: parsePrice(query.priceMaxRaw),
    tipsOnly: query.tipsOnlyRaw === '1' || query.tipsOnlyRaw === 'true',
  };
}
