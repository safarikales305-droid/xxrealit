import type { MetadataRoute } from 'next';
import { CANONICAL_WWW_HOST, CANONICAL_WWW_ORIGIN, resolveSiteOrigin } from '@/lib/site-origin';

export default function robots(): MetadataRoute.Robots {
  const base = resolveSiteOrigin() || CANONICAL_WWW_ORIGIN;

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
    host: CANONICAL_WWW_HOST,
  };
}
