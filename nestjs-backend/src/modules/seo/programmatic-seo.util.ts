import type { CzGeoLocation } from './cz-geo-locations.data';
import type { ProgrammaticSeoIntent } from './programmatic-seo-intents';
import { PROGRAMMATIC_SEO_INTENT_SLUGS, PROGRAMMATIC_SEO_INTENTS } from './programmatic-seo-intents';

const SITE = 'XXREALIT';

export type ProgrammaticSeoCopy = {
  path: string;
  h1: string;
  title: string;
  description: string;
  bodyText: string;
  faq: Array<{ question: string; answer: string }>;
  keywords: string[];
};

function inLocation(loc: CzGeoLocation): string {
  if (loc.kind === 'kraj') return `v ${loc.locative}`;
  return `v ${loc.locative}`;
}

function headingWithLocation(intent: ProgrammaticSeoIntent, loc: CzGeoLocation): string {
  if (intent.slug === 'realitni-kancelar') {
    return `${intent.heading} ${loc.name}`;
  }
  if (intent.slug === 'prodej-pozemku') {
    return `${intent.heading} ${loc.name}`;
  }
  return `${intent.heading} ${loc.name}`;
}

function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

const INTRO_VARIANTS = [
  (intent: ProgrammaticSeoIntent, loc: CzGeoLocation) =>
    `${headingWithLocation(intent, loc)} patří mezi nejvyhledávanější realitní dotazy ${inLocation(loc)}. Na portálu ${SITE} najdete aktuální nabídku s fotografiemi, videi a mapou.`,
  (intent: ProgrammaticSeoIntent, loc: CzGeoLocation) =>
    `Hledáte ${intent.label.toLowerCase()} ${inLocation(loc)}? ${SITE} propojuje majitele, makléře a zájemce — vše na jednom místě s přehlednými filtry a kontaktem.`,
  (intent: ProgrammaticSeoIntent, loc: CzGeoLocation) =>
    `Trh s nemovitostmi ${inLocation(loc)} nabízí širokou škálu možností. Prohlédněte si ${intent.label.toLowerCase()} na ${SITE} a porovnejte ceny, vybavení i lokalitu.`,
];

const BODY_VARIANTS = [
  (intent: ProgrammaticSeoIntent, loc: CzGeoLocation) =>
    `Každý inzerát na ${SITE} obsahuje detailní popis, galerii a často i video prohlídku. U ${intent.label.toLowerCase()} ${inLocation(loc)} můžete filtrovat podle ceny, dispozice a stavu nemovitosti.`,
  (intent: ProgrammaticSeoIntent, loc: CzGeoLocation) =>
    `Lokalita ${loc.name} přitahuje rodiny i investory. Na našem portálu pravidelně přibývají nové nabídky — od cenově dostupných variant po prémiové reality.`,
  (intent: ProgrammaticSeoIntent, loc: CzGeoLocation) =>
    `Při výběru ${intent.label.toLowerCase()} ${inLocation(loc)} doporučujeme porovnat více inzerátů, ověřit stav nemovitosti a využít kontakt přímo na inzerenta nebo makléře.`,
];

export function buildProgrammaticSeoPath(intentSlug: string, locationSlug: string): string {
  return `/${intentSlug}/${locationSlug}`;
}

export function buildProgrammaticSeoCopy(
  intent: ProgrammaticSeoIntent,
  loc: CzGeoLocation,
): ProgrammaticSeoCopy {
  const path = buildProgrammaticSeoPath(intent.slug, loc.slug);
  const h1 = headingWithLocation(intent, loc);
  const title = `${h1} | ${SITE}`;
  const description = buildProgrammaticDescription(intent, loc);
  const seed = hashSeed(`${intent.slug}:${loc.slug}`);
  const intro = INTRO_VARIANTS[seed % INTRO_VARIANTS.length](intent, loc);
  const body = BODY_VARIANTS[(seed >> 3) % BODY_VARIANTS.length](intent, loc);
  const bodyText = `${intro} ${body}`.trim();

  return {
    path,
    h1,
    title,
    description,
    bodyText,
    faq: buildProgrammaticFaq(intent, loc),
    keywords: buildProgrammaticKeywords(intent, loc),
  };
}

export function buildProgrammaticDescription(
  intent: ProgrammaticSeoIntent,
  loc: CzGeoLocation,
): string {
  if (intent.isBrokerPage) {
    return `Ověření makléři a realitní kanceláře ${inLocation(loc)}. Profily, hodnocení, kontakt. ${SITE}.`;
  }
  return `Aktuální nabídka ${intent.label.toLowerCase()} ${inLocation(loc)}. Fotografie, videa, mapy, kontakt přímo na majitele nebo makléře. ${SITE}.`;
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
  ];
  if (intent.offerType) base.push(intent.offerType);
  if (intent.propertyTypeKey) base.push(intent.propertyTypeKey.replace('_', ' '));
  return [...new Set(base)];
}

export function buildProgrammaticFaq(
  intent: ProgrammaticSeoIntent,
  loc: CzGeoLocation,
): Array<{ question: string; answer: string }> {
  const where = inLocation(loc);
  const items: Array<{ question: string; answer: string }> = [];

  if (!intent.isBrokerPage) {
    items.push({
      question: `Jaká je průměrná cena — ${intent.label.toLowerCase()} ${loc.name}?`,
      answer: `Ceny se liší podle lokality, stavu a vybavení. Na ${SITE} u každého inzerátu uvidíte aktuální cenu a můžete porovnat více nabídek ${where}.`,
    });
    items.push({
      question: `Kolik je aktuálně nabídek — ${intent.label.toLowerCase()} ${where}?`,
      answer: `Počet inzerátů se mění denně. Na této stránce vidíte aktuální výpis; nové nabídky přibývají průběžně od majitelů i makléřů.`,
    });
    items.push({
      question: `Jak probíhá koupě nebo pronájem ${where}?`,
      answer: `Vyberte inzerát, prohlédněte detail a kontaktujte inzerenta přímo přes ${SITE}. U vybraných nabídek je k dispozici video prohlídka a mapa.`,
    });
  } else {
    items.push({
      question: `Jak najdu spolehlivou realitní kancelář ${where}?`,
      answer: `Na ${SITE} najdete profily makléřů s hodnocením a kontaktem. Porovnejte zkušenosti a specializaci podle lokality ${loc.name}.`,
    });
    items.push({
      question: `Je kontakt na makléře zdarma?`,
      answer: `Základní profil a kontakt jsou dostupné po přihlášení. U prémiových makléřů najdete rozšířené informace a ověřené reference.`,
    });
  }

  items.push({
    question: `Proč používat ${SITE} pro reality ${where}?`,
    answer: `${SITE} kombinuje klasické inzeráty s videem, mapou a přímým kontaktem. Nabídky jsou pravidelně aktualizované a optimalizované pro rychlé vyhledávání.`,
  });

  return items;
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
  const h2 = intent.isBrokerPage
    ? `Makléři a realitní kanceláře ${loc.name}`
    : `Aktuální nabídka ${intent.label.toLowerCase()} ${loc.name}`;

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
    ogImage: `${SITE_ORIGIN}/og-default.jpg`,
    twitterCard: 'summary_large_image',
    schemaJson,
    internalLinks: [
      { label: 'Všechny reality', path: '/reality' },
      { label: intent.label, path: `/${intent.slug}` },
      { label: loc.name, path },
    ],
    relatedLocations: [],
    relatedPages,
    altTexts: [{ context: 'hero', alt: `${copy.h1} — ${SITE}` }],
    h2,
  };
}
