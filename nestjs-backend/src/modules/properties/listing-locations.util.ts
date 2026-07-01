export function listingLocationSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export type PublicListingLocationRow = {
  city: string;
  district: string;
  region: string;
  label: string;
  count: number;
  slug: string;
};
