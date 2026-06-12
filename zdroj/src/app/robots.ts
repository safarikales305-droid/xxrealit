import type { MetadataRoute } from 'next';
import { getAppOrigin } from '@/lib/app-url';

export default function robots(): MetadataRoute.Robots {
  const base = getAppOrigin();

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin/', '/api/', '/dashboard/'],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
