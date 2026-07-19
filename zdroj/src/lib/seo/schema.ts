import { getAppOrigin } from '@/lib/app-url';
import { SITE_NAME } from '@/lib/seo/metadata';

type BreadcrumbItem = { name: string; path: string };

export function breadcrumbJsonLd(items: BreadcrumbItem[]) {
  const origin = getAppOrigin();
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${origin}${item.path.startsWith('/') ? item.path : `/${item.path}`}`,
    })),
  };
}

export function organizationJsonLd() {
  const origin = getAppOrigin();
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: origin,
    logo: `${origin}/icons/icon-192.png`,
    sameAs: [],
  };
}

export function webSiteJsonLd() {
  const origin = getAppOrigin();
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: origin,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${origin}/nemovitosti?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

export function realEstateListingJsonLd(input: {
  id: string;
  slug?: string | null;
  title: string;
  description?: string | null;
  city?: string | null;
  price?: number | null;
  currency?: string | null;
  image?: string | null;
  offerType?: string | null;
  propertyType?: string | null;
  videoUrl?: string | null;
  createdAt?: string | null;
}) {
  const origin = getAppOrigin();
  const path = input.slug ? `/nemovitosti/${input.slug}` : `/nemovitost/${input.id}`;
  const url = `${origin}${path}`;
  const images = input.image ? [input.image] : [];

  const graph: Record<string, unknown>[] = [
    {
      '@type': 'RealEstateListing',
      '@id': `${url}#listing`,
      name: input.title,
      description: input.description ?? undefined,
      url,
      image: images,
      address: input.city
        ? { '@type': 'PostalAddress', addressLocality: input.city, addressCountry: 'CZ' }
        : undefined,
      offers: input.price
        ? {
            '@type': 'Offer',
            price: input.price,
            priceCurrency: input.currency ?? 'CZK',
            availability: 'https://schema.org/InStock',
          }
        : undefined,
    },
  ];

  if (input.videoUrl) {
    graph.push({
      '@type': 'VideoObject',
      name: input.title,
      description: input.description ?? input.title,
      thumbnailUrl: input.image ?? undefined,
      contentUrl: input.videoUrl,
      uploadDate: input.createdAt ?? undefined,
    });
  }

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  };
}

export function realEstateAgentJsonLd(input: {
  name: string;
  slug: string;
  city?: string | null;
  image?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
}) {
  const origin = getAppOrigin();
  const url = `${origin}/makler/${input.slug}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    name: input.name,
    url,
    image: input.image ?? undefined,
    address: input.city
      ? { '@type': 'PostalAddress', addressLocality: input.city, addressCountry: 'CZ' }
      : undefined,
    ...(input.rating && input.reviewCount
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: input.rating,
            reviewCount: input.reviewCount,
          },
        }
      : {}),
  };
}

export function articleJsonLd(input: {
  title: string;
  description?: string | null;
  path: string;
  image?: string | null;
  publishedAt?: string | null;
  authorName?: string | null;
}) {
  const origin = getAppOrigin();
  const url = `${origin}${input.path.startsWith('/') ? input.path : `/${input.path}`}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.title,
    description: input.description ?? undefined,
    image: input.image ?? undefined,
    datePublished: input.publishedAt ?? undefined,
    author: input.authorName
      ? { '@type': 'Person', name: input.authorName }
      : { '@type': 'Organization', name: SITE_NAME },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: `${origin}/icons/icon-192.png` },
    },
    mainEntityOfPage: url,
  };
}

export function faqJsonLd(items: Array<{ question: string; answer: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}

export function collectionPageJsonLd(input: {
  name: string;
  description: string;
  path: string;
  numberOfItems?: number;
}) {
  const origin = getAppOrigin();
  const url = `${origin}${input.path.startsWith('/') ? input.path : `/${input.path}`}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: input.name,
    description: input.description,
    url,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: origin },
    ...(input.numberOfItems != null
      ? { mainEntity: { '@type': 'ItemList', numberOfItems: input.numberOfItems } }
      : {}),
  };
}

export function offerCatalogJsonLd(input: {
  name: string;
  description: string;
  path: string;
  residenceType?: 'House' | 'Apartment' | 'Residence';
  city?: string;
}) {
  const origin = getAppOrigin();
  const url = `${origin}${input.path.startsWith('/') ? input.path : `/${input.path}`}`;
  const residence = input.residenceType ?? 'Residence';
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': residence,
        name: input.name,
        description: input.description,
        url,
        address: input.city
          ? { '@type': 'PostalAddress', addressLocality: input.city, addressCountry: 'CZ' }
          : undefined,
      },
      {
        '@type': 'OfferCatalog',
        name: input.name,
        url,
        itemListElement: [],
      },
    ],
  };
}

export function localBusinessDirectoryJsonLd(input: {
  name: string;
  description: string;
  path: string;
  city?: string;
}) {
  const origin = getAppOrigin();
  const url = `${origin}${input.path.startsWith('/') ? input.path : `/${input.path}`}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: input.name,
    description: input.description,
    url,
    address: input.city
      ? { '@type': 'PostalAddress', addressLocality: input.city, addressCountry: 'CZ' }
      : undefined,
    parentOrganization: { '@type': 'Organization', name: SITE_NAME, url: origin },
  };
}

export function videoObjectJsonLd(input: {
  name: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  contentUrl?: string | null;
  embedUrl?: string | null;
  uploadDate?: string | null;
  durationSec?: number | null;
  authorName?: string | null;
  url: string;
}) {
  const duration =
    input.durationSec != null && input.durationSec > 0
      ? `PT${Math.max(1, Math.round(input.durationSec))}S`
      : undefined;
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: input.name,
    description: input.description ?? undefined,
    thumbnailUrl: input.thumbnailUrl ?? undefined,
    contentUrl: input.contentUrl ?? undefined,
    embedUrl: input.embedUrl ?? input.url,
    uploadDate: input.uploadDate ?? undefined,
    duration,
    author: input.authorName
      ? { '@type': 'Person', name: input.authorName }
      : { '@type': 'Organization', name: SITE_NAME },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: `${getAppOrigin()}/icons/icon-192.png` },
    },
    mainEntityOfPage: input.url,
  };
}
