export type ProgrammaticSeoIntentSlug =
  | 'prodej-domu'
  | 'prodej-bytu'
  | 'pronajem-bytu'
  | 'prodej-pozemku'
  | 'prodej-chaty'
  | 'prodej-garaze'
  | 'prodej-komercnich-prostor'
  | 'developerske-projekty'
  | 'realitni-kancelar';

export type ProgrammaticSeoIntent = {
  slug: ProgrammaticSeoIntentSlug;
  /** Krátký název pro breadcrumbs (např. „Prodej domů“). */
  label: string;
  /** H1 / title prefix bez lokality (např. „Prodej domů“). */
  heading: string;
  /** Nabídka: prodej | pronájem */
  offerType?: 'prodej' | 'pronajem';
  /** Kanonický propertyTypeKey (null = bez filtru typu). */
  propertyTypeKey?: string;
  /** Schema.org @type pro Residence/Apartment/House */
  schemaResidenceType?: 'House' | 'Apartment' | 'Residence';
  /** Stránka makléřů místo inzerátů */
  isBrokerPage?: boolean;
  /** Priorita ve sitemapě */
  sitemapPriority: number;
};

export const PROGRAMMATIC_SEO_INTENTS: Record<ProgrammaticSeoIntentSlug, ProgrammaticSeoIntent> = {
  'prodej-domu': {
    slug: 'prodej-domu',
    label: 'Prodej domů',
    heading: 'Prodej domů',
    offerType: 'prodej',
    propertyTypeKey: 'dum',
    schemaResidenceType: 'House',
    sitemapPriority: 0.85,
  },
  'prodej-bytu': {
    slug: 'prodej-bytu',
    label: 'Prodej bytů',
    heading: 'Prodej bytů',
    offerType: 'prodej',
    propertyTypeKey: 'byt',
    schemaResidenceType: 'Apartment',
    sitemapPriority: 0.9,
  },
  'pronajem-bytu': {
    slug: 'pronajem-bytu',
    label: 'Pronájem bytů',
    heading: 'Pronájem bytů',
    offerType: 'pronajem',
    propertyTypeKey: 'byt',
    schemaResidenceType: 'Apartment',
    sitemapPriority: 0.88,
  },
  'prodej-pozemku': {
    slug: 'prodej-pozemku',
    label: 'Prodej pozemků',
    heading: 'Pozemky na prodej',
    offerType: 'prodej',
    propertyTypeKey: 'pozemek',
    schemaResidenceType: 'Residence',
    sitemapPriority: 0.82,
  },
  'prodej-chaty': {
    slug: 'prodej-chaty',
    label: 'Prodej chat',
    heading: 'Prodej chat a chalup',
    offerType: 'prodej',
    propertyTypeKey: 'chata_chalupa',
    schemaResidenceType: 'House',
    sitemapPriority: 0.78,
  },
  'prodej-garaze': {
    slug: 'prodej-garaze',
    label: 'Prodej garáží',
    heading: 'Prodej garáží',
    offerType: 'prodej',
    propertyTypeKey: 'garaz',
    schemaResidenceType: 'Residence',
    sitemapPriority: 0.72,
  },
  'prodej-komercnich-prostor': {
    slug: 'prodej-komercnich-prostor',
    label: 'Komerční prostory',
    heading: 'Prodej komerčních prostor',
    offerType: 'prodej',
    propertyTypeKey: 'komercni',
    schemaResidenceType: 'Residence',
    sitemapPriority: 0.75,
  },
  'developerske-projekty': {
    slug: 'developerske-projekty',
    label: 'Developerské projekty',
    heading: 'Developerské projekty',
    offerType: 'prodej',
    propertyTypeKey: 'byt',
    schemaResidenceType: 'Apartment',
    sitemapPriority: 0.8,
  },
  'realitni-kancelar': {
    slug: 'realitni-kancelar',
    label: 'Realitní kanceláře',
    heading: 'Realitní kancelář',
    isBrokerPage: true,
    sitemapPriority: 0.7,
  },
};

export const PROGRAMMATIC_SEO_INTENT_SLUGS = Object.keys(
  PROGRAMMATIC_SEO_INTENTS,
) as ProgrammaticSeoIntentSlug[];

export function isProgrammaticSeoIntentSlug(value: string): value is ProgrammaticSeoIntentSlug {
  return value in PROGRAMMATIC_SEO_INTENTS;
}

export function getProgrammaticSeoIntent(slug: string): ProgrammaticSeoIntent | null {
  return isProgrammaticSeoIntentSlug(slug) ? PROGRAMMATIC_SEO_INTENTS[slug] : null;
}
