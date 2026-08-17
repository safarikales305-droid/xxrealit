import type { CzGeoLocation } from './cz-geo-locations.data';
import type { ProgrammaticSeoIntent } from './programmatic-seo-intents';
import { PROGRAMMATIC_SEO_INTENT_SLUGS, PROGRAMMATIC_SEO_INTENTS } from './programmatic-seo-intents';
import {
  buildProgrammaticRichContent,
  type ProgrammaticSeoSection,
} from './programmatic-seo-rich-content';

const SITE = 'XXREALIT';

export type { ProgrammaticSeoSection };

export type ProgrammaticSeoCopy = {
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
  faq: Array<{ question: string; answer: string }>;
  keywords: string[];
  wordCount: number;
};

function inLocation(loc: CzGeoLocation): string {
  return `v ${loc.locative}`;
}

function headingWithLocation(intent: ProgrammaticSeoIntent, loc: CzGeoLocation): string {
  if (intent.slug === 'realitni-kancelar') {
    return `${intent.heading} ${loc.name}`;
  }
  if (intent.offerType === 'pronajem') {
    return `${intent.heading} v ${loc.locative} – ceny a aktuální nabídka`;
  }
  return `${intent.heading} v ${loc.locative} – ceny, nabídka a praktické informace`;
}

export function buildProgrammaticSeoPath(intentSlug: string, locationSlug: string): string {
  return `/${intentSlug}/${locationSlug}`;
}

export function buildProgrammaticSeoCopy(
  intent: ProgrammaticSeoIntent,
  loc: CzGeoLocation,
): ProgrammaticSeoCopy {
  const path = buildProgrammaticSeoPath(intent.slug, loc.slug);
  const h1 = headingWithLocation(intent, loc);
  const title = `${intent.heading} ${loc.name} – ceny a nabídka | ${SITE}`;
  const description = buildProgrammaticDescription(intent, loc);
  const rich = buildProgrammaticRichContent(intent, loc);
  const h2 = intent.isBrokerPage
    ? `Makléři a realitní kanceláře ${loc.name}`
    : `Průvodce ${intent.label.toLowerCase()} ${loc.name}`;

  return {
    path,
    h1,
    h2,
    title,
    description,
    bodyText: rich.bodyText,
    heroSubtitle: rich.heroSubtitle,
    heroImageUrl: rich.heroImageUrl,
    heroImageAlt: rich.heroImageAlt,
    sections: rich.sections,
    faq: rich.faq,
    keywords: buildProgrammaticKeywords(intent, loc),
    wordCount: rich.wordCount,
  };
}

export function buildProgrammaticDescription(
  intent: ProgrammaticSeoIntent,
  loc: CzGeoLocation,
): string {
  if (intent.isBrokerPage) {
    return `Ověření makléři a realitní kanceláře ${inLocation(loc)}. Profily, hodnocení, kontakt. ${SITE}.`;
  }
  return `Kompletní průvodce ${intent.label.toLowerCase()} ${inLocation(loc)}. Trh, ceny, tipy a aktuální nabídky s fotografiemi a videem. ${SITE}.`;
}

export function buildProgrammaticKeywords(
  intent: ProgrammaticSeoIntent,
  loc: CzGeoLocation,
): string[] {
  const base = [
    intent.heading.toLowerCase(),
    loc.name.toLowerCase(),
    intent.label.toLowerCase(),
    'nemovitosti',
    'reality',
    'xxrealit',
    loc.locative.toLowerCase(),
  ];
  if (intent.offerType) base.push(intent.offerType);
  if (intent.propertyTypeKey) base.push(intent.propertyTypeKey.replace('_', ' '));
  return [...new Set(base)];
}

export function buildProgrammaticFaq(
  intent: ProgrammaticSeoIntent,
  loc: CzGeoLocation,
): Array<{ question: string; answer: string }> {
  return buildProgrammaticRichContent(intent, loc).faq;
}

const SITE_ORIGIN = 'https://www.xxrealit.cz';

export type ExtendedSeoMetadata = {
  canonical: string;
  robots: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  twitterCard: string;
  schemaJson: Record<string, unknown>;
  internalLinks: Array<{ label: string; path: string }>;
  relatedLocations: Array<{ slug: string; name: string }>;
  relatedPages: Array<{ intentSlug: string; label: string; path: string }>;
  altTexts: Array<{ context: string; alt: string }>;
  h2: string;
};

export function buildExtendedSeoMetadata(
  intent: ProgrammaticSeoIntent,
  loc: CzGeoLocation,
  copy: ProgrammaticSeoCopy,
): ExtendedSeoMetadata {
  const path = copy.path;
  const canonical = `${SITE_ORIGIN}${path}`;

  const schemaJson: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: copy.h1,
    description: copy.description,
    url: canonical,
    inLanguage: 'cs-CZ',
    isPartOf: { '@type': 'WebSite', name: SITE, url: SITE_ORIGIN },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Domů', item: SITE_ORIGIN },
        { '@type': 'ListItem', position: 2, name: intent.label, item: `${SITE_ORIGIN}/${intent.slug}` },
        { '@type': 'ListItem', position: 3, name: loc.name, item: canonical },
      ],
    },
    ...(copy.faq.length
      ? {
          mainEntity: copy.faq.map((f) => ({
            '@type': 'Question',
            name: f.question,
            acceptedAnswer: { '@type': 'Answer', text: f.answer },
          })),
        }
      : {}),
  };

  const relatedPages = PROGRAMMATIC_SEO_INTENT_SLUGS.filter((s) => s !== intent.slug)
    .slice(0, 4)
    .map((slug) => ({
      intentSlug: slug,
      label: PROGRAMMATIC_SEO_INTENTS[slug].label,
      path: `/${slug}/${loc.slug}`,
    }));

  return {
    canonical,
    robots: 'index,follow',
    ogTitle: copy.title,
    ogDescription: copy.description,
    ogImage: copy.heroImageUrl || `${SITE_ORIGIN}/og-default.jpg`,
    twitterCard: 'summary_large_image',
    schemaJson,
    internalLinks: [
      { label: 'Všechny reality', path: '/reality' },
      { label: intent.label, path: `/${intent.slug}` },
      { label: loc.name, path },
      { label: 'Makléři', path: '/makleri' },
      { label: 'Hypotéky', path: '/hypoteky' },
      { label: 'Stavební firmy', path: '/stavebni-firmy' },
    ],
    relatedLocations: [],
    relatedPages,
    altTexts: [{ context: 'hero', alt: copy.heroImageAlt || `${copy.h1} — ${SITE}` }],
    h2: copy.h2,
  };
}
