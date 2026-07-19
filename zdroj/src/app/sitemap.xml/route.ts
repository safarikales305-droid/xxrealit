import { getAppOrigin } from '@/lib/app-url';
import { buildSitemapIndexXml, sitemapRoutePath, SITEMAP_KINDS, SITEMAP_ALIASES } from '@/lib/seo/sitemap-xml';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export async function GET() {
  const base = getAppOrigin();
  const now = new Date().toISOString();
  const sitemaps = [
    ...SITEMAP_KINDS.map((kind) => ({
      loc: `${base}${sitemapRoutePath(kind)}`,
      lastmod: now,
    })),
    ...Object.keys(SITEMAP_ALIASES).map((alias) => ({
      loc: `${base}/${alias}.xml`,
      lastmod: now,
    })),
  ];
  const xml = buildSitemapIndexXml(sitemaps);

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
