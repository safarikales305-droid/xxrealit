export type SeoPageResolveLog = {
  pathname: string;
  category: string;
  slug: string;
  resolvedLocation?: string | null;
  pageId?: string | null;
  httpStatus: number;
  dataSource?: string;
  errorCode?: string;
};

/** Server-side diagnostic only — no PII. */
export function logSeoPageResolve(entry: SeoPageResolveLog): void {
  if (typeof window !== 'undefined') return;
  try {
    // eslint-disable-next-line no-console
    console.info('[SEO_PAGE_RESOLVE]', JSON.stringify(entry));
  } catch {
    /* ignore */
  }
}
