import { getOptionalInternalApiBaseUrl } from '@/lib/server-api';

export type ProgrammaticSeoListingPreview = {
  id: string;
  slug: string | null;
  title: string;
  city: string;
  price: number | null;
  currency: string;
  mainImage: string | null;
  offerType: string;
  propertyType: string;
};

export type ProgrammaticSeoSection = {
  id: string;
  h2: string;
  h3?: string[];
  paragraphs: string[];
};

export type ProgrammaticSeoPageData = {
  path: string;
  h1: string;
  h2: string;
  title: string;
  description: string;
  bodyText: string;
  heroSubtitle: string;
  heroImageUrl: string;
  heroImageAlt: string;
  sections: ProgrammaticSeoSection[];
  wordCount?: number;
  faq: Array<{ question: string; answer: string }>;
  keywords: string[];
  intent: {
    slug: string;
    label: string;
    heading: string;
    isBrokerPage?: boolean;
  };
  location: {
    slug: string;
    name: string;
    locative: string;
    kind: string;
    regionSlug?: string;
  };
  totalCount: number;
  hasListings: boolean;
  listings: ProgrammaticSeoListingPreview[];
  relatedLocations: Array<{ slug: string; name: string; path: string }>;
  internalLinks: {
    sameIntentNearby: Array<{ slug: string; name: string; path: string }>;
    otherIntents: Array<{ intentSlug: string; label: string; path: string }>;
    regionIntent?: { slug: string; name: string; path: string };
    extra?: Array<{ label: string; path: string }>;
  };
  seo?: {
    canonical: string;
    robots: string;
    noindex: boolean;
    ogTitle: string;
    ogDescription: string;
    ogImage: string;
    twitterCard: string;
    schemaJson: Record<string, unknown>;
  };
};

const VALID_INTENTS = new Set([
  'prodej-domu',
  'prodej-bytu',
  'pronajem-bytu',
  'prodej-pozemku',
  'prodej-chaty',
  'prodej-garaze',
  'prodej-komercnich-prostor',
  'developerske-projekty',
  'realitni-kancelar',
]);

export function isProgrammaticSeoIntent(value: string): boolean {
  return VALID_INTENTS.has(value);
}

export async function fetchProgrammaticSeoPage(
  intent: string,
  location: string,
  limit = 24,
): Promise<ProgrammaticSeoPageData | null> {
  const api = getOptionalInternalApiBaseUrl();
  if (!api || !isProgrammaticSeoIntent(intent)) return null;

  try {
    const res = await fetch(
      `${api}/seo/programmatic/${encodeURIComponent(intent)}/${encodeURIComponent(location)}?limit=${limit}`,
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) return null;
    return (await res.json()) as ProgrammaticSeoPageData;
  } catch {
    return null;
  }
}
