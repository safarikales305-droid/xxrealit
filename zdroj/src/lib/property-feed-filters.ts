import type { PropertyFeedItem } from '@/types/property';

export function propertyListingHasVideo(p: PropertyFeedItem): boolean {
  if (p.media?.some((m) => m.type === 'video')) return true;
  return Boolean(p.videoUrl?.trim());
}

function listingTypeOf(p: PropertyFeedItem): string | null {
  const lt = p.listingType;
  if (typeof lt !== 'string') return null;
  const norm = lt.trim().toUpperCase();
  return norm || null;
}

/** Veřejný výpis Klasik — primárně podle listingType, ne podle přítomnosti videa. */
export function classicListingsOnly(items: PropertyFeedItem[]): PropertyFeedItem[] {
  return items.filter((p) => {
    const lt = listingTypeOf(p);
    if (lt === 'CLASSIC') return true;
    if (lt === 'SHORTS') return false;
    return !propertyListingHasVideo(p);
  });
}
