import { buildSitemapXml, fetchSitemapEntries, SITEMAP_ALIASES } from '@/lib/seo/sitemap-xml';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export async function GET() {
  const entries = await fetchSitemapEntries(SITEMAP_ALIASES.locations);
  const xml = buildSitemapXml(entries);
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
