import type { NormalizedAccommodation } from './hotelbeds-normalized.types';
import type { HotelbedsSearchQuery } from './hotelbeds-normalized.types';
import { categoryMatchesFilter } from './hotelbeds-category.mapper';

export type PublicCatalogFilterStage =
  | 'provider'
  | 'published'
  | 'active'
  | 'available'
  | 'catalogOnly'
  | 'category'
  | 'destination'
  | 'price'
  | 'image'
  | 'bookingAvailability'
  | 'facilities'
  | 'rating'
  | 'stars';

export type PublicCatalogFilterTrace = {
  stage: PublicCatalogFilterStage;
  before: number;
  after: number;
  removed: number;
  note?: string;
};

export function isAvailabilitySearchQuery(query: HotelbedsSearchQuery): boolean {
  if (query.catalog === false) return true;
  return Boolean(query.availabilitySearch);
}

export function shouldApplyDestinationFilter(query: HotelbedsSearchQuery): boolean {
  if (!query.destination?.trim()) return false;
  if (isAvailabilitySearchQuery(query)) return true;
  return Boolean(query.filterDestination);
}

export function tracePublicCatalogFilters(
  items: NormalizedAccommodation[],
  query: HotelbedsSearchQuery,
): { items: NormalizedAccommodation[]; trace: PublicCatalogFilterTrace[] } {
  const trace: PublicCatalogFilterTrace[] = [];
  let current = [...items];

  const step = (stage: PublicCatalogFilterStage, next: NormalizedAccommodation[], note?: string) => {
    trace.push({
      stage,
      before: current.length,
      after: next.length,
      removed: current.length - next.length,
      note,
    });
    current = next;
  };

  step('provider', current.filter((h) => h.provider === 'HOTELBEDS'), 'provider=HOTELBEDS');
  step('published', current, 'DB query already requires published=true');
  step('active', current, 'DB query already requires status=PUBLISHED');
  step('available', current, 'available is never used as a catalog filter');
  step('catalogOnly', current, 'catalogOnly=true is a valid public listing');

  if (query.category) {
    step(
      'category',
      current.filter((h) => categoryMatchesFilter(h.xxrealitCategory as never, query.category!)),
      `category=${query.category}`,
    );
  }

  if (shouldApplyDestinationFilter(query)) {
    const needle = query.destination!.trim().toLowerCase();
    step(
      'destination',
      current.filter(
        (h) =>
          h.city.toLowerCase().includes(needle) ||
          (h.region?.toLowerCase().includes(needle) ?? false),
      ),
      `destination=${query.destination}`,
    );
  }

  if (query.starsMin) {
    step(
      'stars',
      current.filter((h) => (h.stars ?? 0) >= query.starsMin!),
      `starsMin=${query.starsMin}`,
    );
  }

  if (query.priceMax) {
    step(
      'price',
      current.filter((h) => {
        if (h.catalogOnly || h.availabilityStatus === 'unknown') return true;
        if (h.priceFrom == null) return true;
        return h.priceFrom <= query.priceMax!;
      }),
      `priceMax=${query.priceMax} (catalog/unknown price skipped)`,
    );
  }

  if (query.ratingMin) {
    step(
      'rating',
      current.filter((h) => (h.rating ?? 0) >= query.ratingMin!),
      `ratingMin=${query.ratingMin}`,
    );
  }

  const hasFacilityFilter = Boolean(
    query.wifi ||
      query.parking ||
      query.breakfast ||
      query.wellness ||
      query.pool ||
      query.pets ||
      query.accessible,
  );
  if (hasFacilityFilter) {
    step(
      'facilities',
      current.filter((h) => {
        if (!h.contentEnriched) return true;
        if (query.wifi && !h.wifi) return false;
        if (query.parking && !h.parking) return false;
        if (query.breakfast && !h.breakfast) return false;
        if (query.wellness && !h.wellness) return false;
        if (query.pool && !h.pool) return false;
        if (query.pets && !h.petsAllowed) return false;
        if (query.accessible && !h.accessible) return false;
        return true;
      }),
      'facility flags',
    );
  }

  step('image', current, 'missing images do not remove hotels from catalog');
  step('bookingAvailability', current, 'booking availability is not required for catalog browse');

  return { items: current, trace };
}

export function applyPublicCatalogFilters(
  items: NormalizedAccommodation[],
  query: HotelbedsSearchQuery,
): NormalizedAccommodation[] {
  return tracePublicCatalogFilters(items, query).items;
}

export function detectHotelFilterReason(
  hotelCode: number,
  allItems: NormalizedAccommodation[],
  filteredItems: NormalizedAccommodation[],
  trace: PublicCatalogFilterTrace[],
): string | null {
  const id = String(hotelCode);
  if (filteredItems.some((h) => h.providerId === id)) return null;
  const hotel = allItems.find((h) => h.providerId === id);
  if (!hotel) {
    if (trace.some((t) => t.stage === 'destination' && t.removed > 0)) {
      return 'FILTERED_BY_DESTINATION';
    }
    if (trace.some((t) => t.stage === 'category' && t.removed > 0)) {
      return 'FILTERED_BY_CATEGORY';
    }
    return 'NOT_IN_DB_RESULT';
  }
  for (const stage of trace) {
    if (stage.removed <= 0) continue;
    if (stage.stage === 'destination') return 'FILTERED_BY_DESTINATION';
    if (stage.stage === 'category') return 'FILTERED_BY_CATEGORY';
    if (stage.stage === 'price') return 'FILTERED_BY_PRICE';
    if (stage.stage === 'stars') return 'FILTERED_BY_STARS';
    if (stage.stage === 'rating') return 'FILTERED_BY_RATING';
    if (stage.stage === 'facilities') return 'FILTERED_BY_FACILITIES';
  }
  return 'FILTERED_UNKNOWN';
}
