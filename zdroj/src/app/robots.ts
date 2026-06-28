import type { MetadataRoute } from 'next';
import { getAppOrigin } from '@/lib/app-url';

export default function robots(): MetadataRoute.Robots {
  const base = getAppOrigin();

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin/',
        '/dashboard/',
        '/api/',
        '/profil/',
        '/pracovnik/',
        '/login',
        '/registrace',
        '/prihlaseni',
        '/onboarding/',
        '/debug-og/',
      ],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base.replace(/^https?:\/\//, ''),
  };
}
