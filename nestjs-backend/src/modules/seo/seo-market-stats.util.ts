export function computeMedian(values: number[]): number | null {
  const sorted = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  }
  return Math.round(sorted[mid]!);
}

export type SeoMarketStats = {
  listingCount: number;
  averagePrice: number | null;
  medianPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  pricePerM2: number | null;
  updatedAt: string;
  hasEnoughData: boolean;
};

export function buildMarketStats(input: {
  prices: number[];
  areas: Array<number | null | undefined>;
  listingCount: number;
}): SeoMarketStats {
  const prices = input.prices.filter((p) => p > 0);
  const listingCount = input.listingCount;
  const averagePrice =
    prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null;
  const medianPrice = computeMedian(prices);
  const minPrice = prices.length ? Math.min(...prices) : null;
  const maxPrice = prices.length ? Math.max(...prices) : null;

  const perM2: number[] = [];
  for (let i = 0; i < input.prices.length; i += 1) {
    const price = input.prices[i];
    const area = input.areas[i];
    if (price && area && area > 0) perM2.push(price / area);
  }
  const pricePerM2 = perM2.length ? Math.round(perM2.reduce((a, b) => a + b, 0) / perM2.length) : null;

  return {
    listingCount,
    averagePrice,
    medianPrice,
    minPrice,
    maxPrice,
    pricePerM2,
    updatedAt: new Date().toISOString(),
    hasEnoughData: listingCount >= 3 && (medianPrice != null || averagePrice != null),
  };
}
