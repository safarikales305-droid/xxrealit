import type { Metadata } from 'next';
import { getAppOrigin } from '@/lib/app-url';

export const SITE_NAME = 'XXREALIT';
export const DEFAULT_TITLE = 'XXREALIT | Moderní realitní portál s video inzeráty';
export const DEFAULT_DESCRIPTION =
  'XXREALIT je moderní realitní portál propojující video inzeráty, klasickou inzerci, makléře, stavební firmy, finanční poradce a investory.';

export const HREFLANG_LOCALES = ['cs', 'en', 'de', 'pl'] as const;

export type BuildSiteMetadataInput = {
  title: string;
  description?: string;
  path?: string;
  image?: string | null;
  keywords?: string[];
  noindex?: boolean;
  type?: 'website' | 'article' | 'profile';
};

function absoluteUrl(path: string): string {
  const origin = getAppOrigin();
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${origin}${p}`;
}

function buildHreflang(path: string): Record<string, string> {
  const canonical = absoluteUrl(path);
  const langs: Record<string, string> = {};
  for (const locale of HREFLANG_LOCALES) {
    langs[locale] = locale === 'cs' ? canonical : `${canonical}?lang=${locale}`;
  }
  langs['x-default'] = canonical;
  return langs;
}

/** Centrální builder metadat pro Metadata API Next.js. */
export function buildSiteMetadata(input: BuildSiteMetadataInput): Metadata {
  const path = input.path ?? '/';
  const canonical = absoluteUrl(path);
  const title = input.title.includes(SITE_NAME)
    ? input.title
    : input.title.includes('|')
      ? input.title
      : `${input.title} | ${SITE_NAME}`;
  const description = input.description ?? DEFAULT_DESCRIPTION;
  const image = input.image?.trim() || `${getAppOrigin()}/icons/icon-192.png`;

  return {
    title,
    description,
    keywords: input.keywords,
    robots: input.noindex
      ? { index: false, follow: false }
      : { index: true, follow: true },
    alternates: {
      canonical,
      languages: buildHreflang(path),
    },
    openGraph: {
      type: input.type ?? 'website',
      locale: 'cs_CZ',
      url: canonical,
      siteName: SITE_NAME,
      title,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}

/** Šablona title pro podstránky: "Nemovitosti | XXREALIT" */
export function pageTitle(label: string): string {
  return `${label} | ${SITE_NAME}`;
}

export function listingCanonicalPath(slug: string): string {
  return `/nemovitosti/${slug}`;
}

export function listingLegacyPath(id: string): string {
  return `/nemovitost/${id}`;
}
