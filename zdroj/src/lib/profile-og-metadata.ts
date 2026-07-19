import type { Metadata } from 'next';
import { getAppOrigin } from '@/lib/app-url';
import { getPortalLogoFallbackUrl } from '@/lib/listing-og-metadata';
import { pageTitle } from '@/lib/seo/metadata';

export type ProfileOgInput = {
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  canonicalPath: string;
};

export function buildProfileOpenGraphMetadata(input: ProfileOgInput): Metadata {
  const title = pageTitle(input.name.trim() || 'Profil');
  const description =
    input.description?.trim()?.slice(0, 200) ||
    `${input.name.trim() || 'Profil'} na XXREALIT.`;
  const canonical = `${getAppOrigin()}${input.canonicalPath.startsWith('/') ? input.canonicalPath : `/${input.canonicalPath}`}`;
  const image = input.imageUrl?.trim() || getPortalLogoFallbackUrl();
  const siteName = 'XXREALIT';

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'website',
      title,
      description,
      url: canonical,
      siteName,
      locale: 'cs_CZ',
      images: [{ url: image, width: 1200, height: 630, alt: input.name }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
    other: {
      'og:type': 'website',
      'og:title': title,
      'og:description': description,
      'og:image': image,
      'og:image:width': '1200',
      'og:image:height': '630',
      'og:url': canonical,
      'og:site_name': siteName,
      'og:locale': 'cs_CZ',
      'twitter:card': 'summary_large_image',
      'twitter:title': title,
      'twitter:description': description,
      'twitter:image': image,
    },
  };
}
