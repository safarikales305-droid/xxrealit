export const SEO_AI_OFFER_TYPES = ['SALE', 'RENT'] as const;
export type SeoAiOfferType = (typeof SEO_AI_OFFER_TYPES)[number];

export const SEO_AI_PROPERTY_TYPES = [
  'APARTMENT',
  'HOUSE',
  'LAND',
  'COMMERCIAL',
  'GARAGE',
  'OTHER',
] as const;
export type SeoAiPropertyType = (typeof SEO_AI_PROPERTY_TYPES)[number];

export const SEO_AI_TONES_ENUM = [
  'NATURAL',
  'EXPERT',
  'FAMILY',
  'INVESTMENT',
  'LUXURY',
  'CONCISE',
  'LOCALITY_GUIDE',
] as const;
export type SeoAiToneEnum = (typeof SEO_AI_TONES_ENUM)[number];

export const SEO_AI_AUDIENCES_ENUM = [
  'BUYER',
  'TENANT',
  'FAMILY',
  'INVESTOR',
  'SENIOR',
  'STUDENT',
  'OWNER',
  'AGENT',
  'COMPANY',
] as const;
export type SeoAiAudienceEnum = (typeof SEO_AI_AUDIENCES_ENUM)[number];

export const SEO_AI_CONTENT_LENGTHS = ['SHORT', 'MEDIUM', 'LONG'] as const;
export type SeoAiContentLength = (typeof SEO_AI_CONTENT_LENGTHS)[number];

const OFFER_MAP: Record<string, SeoAiOfferType> = {
  SALE: 'SALE',
  RENT: 'RENT',
  PRODEJ: 'SALE',
  PRONAJEM: 'RENT',
  PRONÁJEM: 'RENT',
  prodej: 'SALE',
  pronajem: 'RENT',
  pronájem: 'RENT',
};

const PROPERTY_MAP: Record<string, SeoAiPropertyType> = {
  APARTMENT: 'APARTMENT',
  HOUSE: 'HOUSE',
  LAND: 'LAND',
  COMMERCIAL: 'COMMERCIAL',
  GARAGE: 'GARAGE',
  OTHER: 'OTHER',
  BYT: 'APARTMENT',
  DUM: 'HOUSE',
  DŮM: 'HOUSE',
  POZEMEK: 'LAND',
  KOMERCNI: 'COMMERCIAL',
  GARAZ: 'GARAGE',
  byt: 'APARTMENT',
  dum: 'HOUSE',
  pozemek: 'LAND',
};

const TONE_MAP: Record<string, SeoAiToneEnum> = {
  NATURAL: 'NATURAL',
  EXPERT: 'EXPERT',
  FAMILY: 'FAMILY',
  INVESTMENT: 'INVESTMENT',
  LUXURY: 'LUXURY',
  CONCISE: 'CONCISE',
  LOCALITY_GUIDE: 'LOCALITY_GUIDE',
  Odborný: 'EXPERT',
  Přirozený: 'NATURAL',
  'Rodinné bydlení': 'FAMILY',
  Investiční: 'INVESTMENT',
  Luxusní: 'LUXURY',
  Stručný: 'CONCISE',
  'Průvodce lokalitou': 'LOCALITY_GUIDE',
};

const AUDIENCE_MAP: Record<string, SeoAiAudienceEnum> = {
  BUYER: 'BUYER',
  TENANT: 'TENANT',
  FAMILY: 'FAMILY',
  INVESTOR: 'INVESTOR',
  SENIOR: 'SENIOR',
  STUDENT: 'STUDENT',
  OWNER: 'OWNER',
  AGENT: 'AGENT',
  COMPANY: 'COMPANY',
  kupující: 'BUYER',
  nájemci: 'TENANT',
  rodiny: 'FAMILY',
  investoři: 'INVESTOR',
  senioři: 'SENIOR',
  studenti: 'STUDENT',
  majitelé: 'OWNER',
  makléři: 'AGENT',
  'stavební firmy': 'COMPANY',
};

const LENGTH_MAP: Record<string, SeoAiContentLength> = {
  SHORT: 'SHORT',
  MEDIUM: 'MEDIUM',
  LONG: 'LONG',
  short: 'SHORT',
  medium: 'MEDIUM',
  long: 'LONG',
  Krátká: 'SHORT',
  Střední: 'MEDIUM',
  Dlouhá: 'LONG',
};

export function normalizeSeoAiOfferType(raw?: string): SeoAiOfferType {
  if (!raw?.trim()) return 'SALE';
  return OFFER_MAP[raw.trim()] ?? OFFER_MAP[raw.trim().toUpperCase()] ?? 'SALE';
}

export function normalizeSeoAiPropertyType(raw?: string): SeoAiPropertyType {
  if (!raw?.trim()) return 'APARTMENT';
  return PROPERTY_MAP[raw.trim()] ?? PROPERTY_MAP[raw.trim().toUpperCase()] ?? 'APARTMENT';
}

export function normalizeSeoAiTone(raw?: string): SeoAiToneEnum {
  if (!raw?.trim()) return 'NATURAL';
  return TONE_MAP[raw.trim()] ?? 'NATURAL';
}

export function normalizeSeoAiAudience(raw?: string): SeoAiAudienceEnum {
  if (!raw?.trim()) return 'BUYER';
  return AUDIENCE_MAP[raw.trim()] ?? 'BUYER';
}

export function normalizeSeoAiContentLength(raw?: string): SeoAiContentLength {
  if (!raw?.trim()) return 'MEDIUM';
  return LENGTH_MAP[raw.trim()] ?? 'MEDIUM';
}

export function resolveIntentSlugFromEnums(
  offerType: SeoAiOfferType,
  propertyType: SeoAiPropertyType,
  intentSlug?: string,
): string {
  if (intentSlug?.trim()) return intentSlug.trim();
  if (offerType === 'RENT') {
    if (propertyType === 'HOUSE') return 'pronajem-bytu';
    return 'pronajem-bytu';
  }
  if (propertyType === 'HOUSE') return 'prodej-domu';
  if (propertyType === 'LAND') return 'prodej-pozemku';
  if (propertyType === 'GARAGE') return 'prodej-garaze';
  if (propertyType === 'COMMERCIAL') return 'prodej-komercnich-prostor';
  return 'prodej-bytu';
}
