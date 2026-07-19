import { getAppOrigin } from '@/lib/app-url';
import { getOptionalInternalApiBaseUrl } from '@/lib/server-api';

export type SitemapApiEntry = {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
};

export async function fetchSitemapEntries(kind: string): Promise<SitemapApiEntry[]> {
  const base = getAppOrigin();
  const api = getOptionalInternalApiBaseUrl();
  if (!api) {
    return [{ loc: base, changefreq: 'daily', priority: 1 }];
  }

  try {
    const res = await fetch(
      `${api}/seo/sitemap/${encodeURIComponent(kind)}?origin=${encodeURIComponent(base)}`,
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) throw new Error(`sitemap ${kind} ${res.status}`);
    return (await res.json()) as SitemapApiEntry[];
  } catch {
    return [{ loc: base, changefreq: 'daily', priority: 1 }];
  }
}

export function buildSitemapXml(entries: SitemapApiEntry[]): string {
  const urls = entries
    .map((e) => {
      const parts = [`    <loc>${escapeXml(e.loc)}</loc>`];
      if (e.lastmod) parts.push(`    <lastmod>${escapeXml(e.lastmod)}</lastmod>`);
      if (e.changefreq) parts.push(`    <changefreq>${escapeXml(e.changefreq)}</changefreq>`);
      if (e.priority != null) parts.push(`    <priority>${e.priority}</priority>`);
      return `  <url>\n${parts.join('\n')}\n  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}

export function buildSitemapIndexXml(sitemaps: Array<{ loc: string; lastmod?: string }>): string {
  const items = sitemaps
    .map((s) => {
      const parts = [`    <loc>${escapeXml(s.loc)}</loc>`];
      if (s.lastmod) parts.push(`    <lastmod>${escapeXml(s.lastmod)}</lastmod>`);
      return `  <sitemap>\n${parts.join('\n')}\n  </sitemap>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const SITEMAP_KINDS = [
  'inzeraty',
  'mesta',
  'kraje',
  'obce',
  'videa',
  'profily',
  'clanky',
] as const;

/** Aliasové názvy sitemap podle SEO specifikace. */
export const SITEMAP_ALIASES: Record<string, (typeof SITEMAP_KINDS)[number]> = {
  listings: 'inzeraty',
  locations: 'mesta',
  profiles: 'profily',
  videos: 'videa',
  'seo-pages': 'mesta',
};

export function sitemapRoutePath(kind: (typeof SITEMAP_KINDS)[number]): string {
  return `/sitemap-${kind}.xml`;
}
