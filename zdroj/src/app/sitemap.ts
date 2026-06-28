import type { MetadataRoute } from 'next';
import { getAppOrigin } from '@/lib/app-url';
import { getOptionalInternalApiBaseUrl } from '@/lib/server-api';

type SitemapApiEntry = {
  loc: string;
  lastmod?: string;
  changefreq?: MetadataRoute.Sitemap[number]['changeFrequency'];
  priority?: number;
};

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getAppOrigin();
  const api = getOptionalInternalApiBaseUrl();

  if (!api) {
    return [{ url: base, lastModified: new Date(), changeFrequency: 'daily', priority: 1 }];
  }

  try {
    const res = await fetch(`${api}/seo/sitemap?origin=${encodeURIComponent(base)}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`sitemap api ${res.status}`);
    const entries = (await res.json()) as SitemapApiEntry[];
    return entries.map((e) => ({
      url: e.loc,
      lastModified: e.lastmod ? new Date(e.lastmod) : new Date(),
      changeFrequency: e.changefreq ?? 'weekly',
      priority: e.priority ?? 0.5,
    }));
  } catch {
    return [
      { url: base, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
      { url: `${base}/nemovitosti`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
      { url: `${base}/makleri`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
      { url: `${base}/o-portalu`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.85 },
    ];
  }
}
