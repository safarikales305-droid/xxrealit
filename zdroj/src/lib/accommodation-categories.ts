/** Veřejné kategorie XXREALIT pro /ubytovani/[category] */
export const ACCOMMODATION_PUBLIC_CATEGORIES = [
  { slug: 'hotely', label: 'Hotely' },
  { slug: 'apartmany', label: 'Apartmány' },
  { slug: 'penziony', label: 'Penziony' },
  { slug: 'chaty', label: 'Chaty' },
  { slug: 'chalupy', label: 'Chalupy' },
  { slug: 'wellness', label: 'Wellness' },
  { slug: 'kempy', label: 'Kempy' },
  { slug: 'resorty', label: 'Resorty' },
  { slug: 'luxusni', label: 'Luxusní' },
  { slug: 'u-more', label: 'U moře' },
  { slug: 'hory', label: 'Hory' },
  { slug: 'mesto', label: 'Město' },
] as const;

export type AccommodationCategorySlug = (typeof ACCOMMODATION_PUBLIC_CATEGORIES)[number]['slug'];

export const ACCOMMODATION_CATEGORY_SLUGS = new Set<string>(
  ACCOMMODATION_PUBLIC_CATEGORIES.map((c) => c.slug),
);

export const ACCOMMODATION_LOCATION_SLUGS = new Set<string>([
  'praha',
  'brno',
  'krkonose',
  'lipno',
  'spindleruv-mlyn',
  'karlovy-vary',
  'cesky-krumlov',
]);

export const ACCOMMODATION_PAGE_SIZE = 24;

export function accommodationCategoryLabel(slug: string): string {
  return ACCOMMODATION_PUBLIC_CATEGORIES.find((c) => c.slug === slug)?.label ?? slug.replace(/-/g, ' ');
}
