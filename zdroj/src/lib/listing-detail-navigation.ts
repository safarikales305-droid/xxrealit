export type ListingDetailSource = 'shorts' | 'classic';

export function listingDetailHref(
  propertyId: string,
  source: ListingDetailSource,
): string {
  return `/nemovitost/${encodeURIComponent(propertyId)}?source=${source}`;
}

/** `source` má přednost; podporuje legacy `from=shorts`. */
export function parseListingDetailSource(
  params: Pick<URLSearchParams, 'get'>,
): ListingDetailSource | null {
  const raw = (params.get('source') ?? params.get('from') ?? '').trim().toLowerCase();
  if (raw === 'shorts') return 'shorts';
  if (raw === 'classic') return 'classic';
  return null;
}

export function listingDetailBackTarget(
  source: ListingDetailSource | null,
): { href: string; label: string } {
  if (source === 'shorts') {
    return { href: '/?tab=shorts', label: '← Zpět na Shorts' };
  }
  if (source === 'classic') {
    return { href: '/?tab=classic', label: '← Zpět na inzeráty' };
  }
  return { href: '/', label: '← Domů' };
}
