/** Mapování kategorie aktuality na slug tématu Shorts (ContentSourceCategory). */
const ARTICLE_CATEGORY_TO_TOPIC: Record<string, string> = {
  reality: 'ostatni',
  hypoteky: 'hypoteky-finance',
  bydleni: 'bydleni',
  'ceny-nemovitosti': 'investice',
  najmy: 'bydleni',
  stavebnictvi: 'stavebni-firmy',
  development: 'developerske-projekty',
  katastr: 'pravo-legislativa',
  legislativa: 'pravo-legislativa',
  energetika: 'stavebni-firmy',
  rekonstrukce: 'rekonstrukce',
  investice: 'investice',
  trh: 'investice',
  regiony: 'ostatni',
  ubytovani: 'ubytovani-cestovani',
};

export function articleCategoryToTopicSlug(category: string | null | undefined): string | null {
  const key = category?.trim().toLowerCase();
  if (!key) return null;
  return ARTICLE_CATEGORY_TO_TOPIC[key] ?? 'ostatni';
}

/** Normalizuje query param topics (comma-separated slugs). */
export function parseTopicSlugsParam(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  const joined = Array.isArray(raw) ? raw.join(',') : raw;
  return joined
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Zda položka odpovídá alespoň jednomu vybranému tématu. */
export function itemMatchesTopicSlugs(
  itemTopicSlug: string | null | undefined,
  selected: string[],
): boolean {
  if (!selected.length) return true;
  const slug = itemTopicSlug?.trim().toLowerCase();
  if (!slug) return false;
  return selected.includes(slug);
}

/** Properties zobrazit jen při širokém tématu nebo bez filtru. */
export function shouldIncludePropertiesForTopics(selected: string[]): boolean {
  if (!selected.length) return true;
  const broad = new Set(['ostatni', 'bydleni', 'realitni-kancelare']);
  return selected.some((s) => broad.has(s));
}
