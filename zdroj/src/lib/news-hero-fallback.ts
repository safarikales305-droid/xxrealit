const CATEGORY_FALLBACK_POOLS: Record<string, string[]> = {
  reality: ['/images/news/reality.svg', '/images/news/trh.svg', '/images/news/ceny-nemovitosti.svg'],
  bydleni: ['/images/news/bydleni.svg', '/images/news/reality.svg'],
  hypoteky: ['/images/news/hypoteky.svg', '/images/news/investice.svg'],
  finance: ['/images/news/hypoteky.svg', '/images/news/investice.svg'],
  'ceny-nemovitosti': ['/images/news/ceny-nemovitosti.svg', '/images/news/trh.svg'],
  stavebnictvi: ['/images/news/stavebnictvi.svg', '/images/news/development.svg'],
  development: ['/images/news/development.svg', '/images/news/stavebnictvi.svg'],
  investice: ['/images/news/investice.svg', '/images/news/trh.svg'],
  legislativa: ['/images/news/legislativa.svg', '/images/news/katastr.svg'],
  katastr: ['/images/news/katastr.svg', '/images/news/legislativa.svg'],
  trh: ['/images/news/trh.svg', '/images/news/reality.svg'],
  cnb: ['/images/news/hypoteky.svg', '/images/news/legislativa.svg', '/images/news/trh.svg'],
};

const DEFAULTS = [
  '/images/news/reality.svg',
  '/images/news/hypoteky.svg',
  '/images/news/bydleni.svg',
  '/images/aktuality-default-og.svg',
];

export function pickCategoryFallbackImage(category: string, seed: string): string {
  const pool = CATEGORY_FALLBACK_POOLS[category] ?? [];
  const choices = [...pool, ...DEFAULTS];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return choices[hash % choices.length] ?? DEFAULTS[0]!;
}
