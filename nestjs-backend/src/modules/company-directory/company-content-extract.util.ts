const BLOCK_TAGS = new Set(['P', 'LI', 'H1', 'H2', 'H3', 'H4', 'DIV', 'BR']);

export function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h1|h2|h3|h4|div)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function extractHeadings(html: string): string[] {
  const matches = html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi);
  const out: string[] = [];
  for (const m of matches) {
    const text = stripHtmlToText(m[1] ?? '');
    if (text.length >= 3 && text.length <= 120) out.push(text);
  }
  return [...new Set(out)].slice(0, 20);
}

export function extractListItems(html: string): string[] {
  const matches = html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi);
  const out: string[] = [];
  for (const m of matches) {
    const text = stripHtmlToText(m[1] ?? '');
    if (text.length >= 3 && text.length <= 100) out.push(text);
  }
  return [...new Set(out)].slice(0, 30);
}

export function guessServiceKeywords(headings: string[], listItems: string[]): string[] {
  const combined = [...headings, ...listItems];
  const serviceLike = combined.filter((t) => {
    const lower = t.toLowerCase();
    if (lower.length < 4) return false;
    if (/kontakt|cookie|gdpr|menu|domů|home|blog|novinky/i.test(lower)) return false;
    return true;
  });
  return [...new Set(serviceLike)].slice(0, 12);
}

export const ENRICHMENT_CRAWL_PATHS = [
  '/',
  '/o-nas',
  '/o-spolecnosti',
  '/sluzby',
  '/services',
  '/produkty',
  '/reference',
  '/kontakt',
];
