import { getAppOrigin } from '@/lib/app-url';
import { buildSitemapIndexXml, sitemapRoutePath, SITEMAP_KINDS } from '@/lib/seo/sitemap-xml';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export async function GET() {
  const base = getAppOrigin();
  const now = new Date().toISOString();
  const xml = buildSitemapIndexXml(
    SITEMAP_KINDS.map((kind) => ({
      loc: `${base}${sitemapRoutePath(kind)}`,
      lastmod: now,
    })),
  );

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
