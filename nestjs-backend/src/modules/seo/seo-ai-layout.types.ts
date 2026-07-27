export const SEO_AI_LAYOUT_TYPES = [
  'LOCALITY_GUIDE',
  'PROPERTY_OVERVIEW',
  'FAMILY_LIVING',
  'INVESTMENT_GUIDE',
  'CITY_AND_SURROUNDINGS',
  'COMPACT_SEARCH_PAGE',
  'EDITORIAL_REAL_ESTATE_GUIDE',
] as const;

export type SeoAiLayoutTypeName = (typeof SEO_AI_LAYOUT_TYPES)[number];

export const SEO_AI_BLOCK_TYPES = [
  'HERO',
  'INTRO',
  'MAIN_CONTENT',
  'LOCALITY_OVERVIEW',
  'PROPERTY_TYPES',
  'LIVING_GUIDE',
  'BUYER_TIPS',
  'RENTAL_TIPS',
  'INVESTMENT_VIEW',
  'TRANSPORT',
  'AMENITIES',
  'SURROUNDINGS',
  'PROS_CONS',
  'PROPERTY_RESULTS',
  'NO_LISTINGS_GUIDE',
  'FAQ',
  'INTERNAL_LINKS',
  'CTA',
  'LOCALITY_FACTS',
] as const;

export type SeoAiBlockType = (typeof SEO_AI_BLOCK_TYPES)[number];

export type SeoAiContentBlock = {
  type: SeoAiBlockType;
  title?: string;
  content: string;
  items?: Array<{ title?: string; text: string }>;
};

export type SeoAiSourceClaim = {
  claim: string;
  sourceType: 'RUIAN' | 'CSU' | 'APPROVED_KNOWLEDGE' | 'LISTINGS_DB' | 'MANUAL';
  sourceId?: string;
  verified: boolean;
};

export type SeoAiPageOutput = {
  layout: SeoAiLayoutTypeName;
  slugSuggestion: string;
  editorialTitle: string;
  subtitle: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  introText: string;
  mainContent: string;
  blocks: SeoAiContentBlock[];
  faq: Array<{ question: string; answer: string }>;
  internalLinks: Array<{ label: string; path: string }>;
  cta: { title: string; text: string; buttonLabel: string; buttonPath: string };
  sourceClaims: SeoAiSourceClaim[];
};

export type SeoAiGenerateInput = {
  localityId?: string;
  localitySlug?: string;
  /** @deprecated use localitySlug */
  locationSlug?: string;
  intentSlug?: string;
  offerType?: string;
  propertyType?: string;
  region?: string;
  district?: string;
  primaryKeyword?: string;
  secondaryKeywords?: string[];
  tone?: string;
  length?: 'short' | 'medium' | 'long' | string;
  contentLength?: string;
  targetAudience?: string;
  useRuian?: boolean;
  useCsu?: boolean;
  useListings?: boolean;
  useLocalFacts?: boolean;
  useLocalityFacts?: boolean;
  initialStatus?: 'DRAFT' | 'REVIEW' | 'PUBLISHED';
  status?: 'DRAFT' | 'REVIEW' | 'PUBLISHED';
  indexImmediately?: boolean;
  publish?: boolean;
  createLocationIfMissing?: boolean;
};

export const SEO_AI_TONES = [
  'Odborný',
  'Přirozený',
  'Rodinné bydlení',
  'Investiční',
  'Luxusní',
  'Stručný',
  'Průvodce lokalitou',
] as const;

export const SEO_AI_AUDIENCES = [
  'kupující',
  'nájemci',
  'rodiny',
  'investoři',
  'senioři',
  'studenti',
  'majitelé',
  'makléři',
  'stavební firmy',
] as const;

export const SEO_KNOWLEDGE_CATEGORIES = [
  'SEO_PORTAL',
  'SEO_PROPERTY_TYPES',
  'SEO_BUYING',
  'SEO_RENTING',
  'SEO_SELLING',
  'SEO_FINANCING',
  'SEO_INVESTING',
  'SEO_LOCALITY',
  'SEO_RUIAN',
  'SEO_CSU',
  'SEO_GLOSSARY',
  'SEO_FAQ',
  'SEO_PORTAL_BENEFITS',
  'SEO_ALERTS',
  'SEO_LISTING',
] as const;
