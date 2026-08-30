/** Zkrátí titulek pro overlay ve Facebook Reel segmentu. */
export function shortenReelTitle(title: string, maxLen = 72): string {
  const t = title.trim().replace(/\s+/g, ' ');
  if (!t) return '';
  if (t.length <= maxLen) return t;
  const cut = t.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > 40 ? cut.slice(0, lastSpace) : cut;
  return `${base.trim()}…`;
}

/** Šablona hook textu bez AI. */
export function templateReelHookText(input: {
  titles: string[];
  categoryLabel?: string | null;
}): string {
  const category = input.categoryLabel?.trim();
  if (category) {
    const lower = category.toLowerCase();
    if (lower.includes('makléř')) return 'CO TEĎ ŘEŠÍ MAKLÉŘI?';
    if (lower.includes('staveb')) return 'NOVINKY ZE STAVEBNICTVÍ';
    if (lower.includes('řemes')) return 'TIPY OD ŘEMESLNÍKŮ';
    if (lower.includes('hypot') || lower.includes('finance')) return 'CO SE DĚJE S CENAMI DOMŮ?';
    if (lower.includes('bydlen')) return 'NOVINKY Z BYDLENÍ';
    return `NOVINKY: ${category.toUpperCase().slice(0, 32)}`;
  }
  const first = input.titles.find((t) => t.trim().length > 8)?.trim();
  if (first) {
    const short = shortenReelTitle(first, 48).toUpperCase();
    if (short.length >= 12) return short;
  }
  return 'NOVINKY Z REALIT A BYDLENÍ';
}
