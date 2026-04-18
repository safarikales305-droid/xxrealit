export function formatListingPrice(price: number | null | undefined): string {
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
    return 'Cena na dotaz';
  }
  return `${new Intl.NumberFormat('cs-CZ').format(price)} Kč`;
}

export function normalizePrice(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}
