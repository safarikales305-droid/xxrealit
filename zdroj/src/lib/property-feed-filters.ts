import type { PropertyFeedItem } from '@/types/property';

export function propertyListingHasVideo(p: PropertyFeedItem): boolean {
  if (p.media?.some((m) => m.type === 'video')) return true;
  return Boolean(p.videoUrl?.trim());
}

export function classicListingsOnly(items: PropertyFeedItem[]): PropertyFeedItem[] {
  return items.filter((p) => !propertyListingHasVideo(p));
}
