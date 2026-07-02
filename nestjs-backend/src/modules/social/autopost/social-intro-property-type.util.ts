import { SocialIntroPropertyType } from '@prisma/client';

export const SOCIAL_INTRO_PROPERTY_TYPE_LABELS: Record<SocialIntroPropertyType, string> = {
  BYT: 'Byt',
  DUM: 'Dům',
  POZEMEK: 'Pozemek',
  KOMERCNI: 'Komerční prostor',
  GARAZ: 'Garáž',
  NOVOSTAVBA: 'Novostavba',
  PRONAJEM: 'Pronájem',
  OSTATNI: 'Ostatní',
};

/** Kanonický typ pro párování inzerátu s úvodním videem. */
export type NormalizedPropertyType =
  | 'house'
  | 'apartment'
  | 'land'
  | 'commercial'
  | 'garage'
  | 'other';

export const NORMALIZED_PROPERTY_TYPE_LABELS: Record<NormalizedPropertyType, string> = {
  house: 'Dům',
  apartment: 'Byt',
  land: 'Pozemek',
  commercial: 'Komerční',
  garage: 'Garáž',
  other: 'Ostatní',
};

export type ListingIntroContext = {
  propertyTypeKey?: string | null;
  propertyType?: string | null;
  offerType?: string | null;
  title?: string | null;
  description?: string | null;
};

function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '');
}

/**
 * Společná normalizace typu nemovitosti — používej při uploadu intro videa,
 * výběru intro videa, přegenerování i publikování.
 */
export function normalizePropertyType(value: string | null | undefined): NormalizedPropertyType {
  const raw = (value ?? '').trim().toLowerCase();
  if (!raw) return 'other';

  const ascii = stripDiacritics(raw);

  if (
    raw === 'house' ||
    raw === 'dum' ||
    raw === 'dům' ||
    ascii === 'dum' ||
    ascii.includes('rodinny') ||
    ascii.includes('rodinny_dum') ||
    raw.includes('dum') ||
    raw.includes('dům') ||
    raw === 'chata_chalupa' ||
    raw.includes('chata') ||
    raw === 'novostavba' ||
    ascii.includes('novostavb')
  ) {
    return 'house';
  }

  if (
    raw === 'apartment' ||
    raw === 'byt' ||
    raw.includes('byt') ||
    ascii.includes('apartman')
  ) {
    return 'apartment';
  }

  if (
    raw === 'land' ||
    raw === 'pozemek' ||
    raw.includes('pozem') ||
    ascii === 'pozemek'
  ) {
    return 'land';
  }

  if (
    raw === 'commercial' ||
    raw === 'komercni' ||
    raw === 'komerční' ||
    raw.includes('komer') ||
    ascii.includes('komerc')
  ) {
    return 'commercial';
  }

  if (
    raw === 'garage' ||
    raw === 'garaz' ||
    raw === 'garáž' ||
    raw.includes('gar') ||
    ascii === 'garaz'
  ) {
    return 'garage';
  }

  if (
    raw === 'other' ||
    raw === 'ostatni' ||
    raw === 'ostatní' ||
    ascii === 'ostatni'
  ) {
    return 'other';
  }

  return 'other';
}

export function socialIntroEnumToNormalized(
  type: SocialIntroPropertyType,
): NormalizedPropertyType {
  switch (type) {
    case SocialIntroPropertyType.BYT:
      return 'apartment';
    case SocialIntroPropertyType.DUM:
    case SocialIntroPropertyType.NOVOSTAVBA:
      return 'house';
    case SocialIntroPropertyType.POZEMEK:
      return 'land';
    case SocialIntroPropertyType.KOMERCNI:
      return 'commercial';
    case SocialIntroPropertyType.GARAZ:
      return 'garage';
    case SocialIntroPropertyType.PRONAJEM:
    case SocialIntroPropertyType.OSTATNI:
    default:
      return 'other';
  }
}

export function normalizedToSocialIntroEnum(
  normalized: NormalizedPropertyType,
): SocialIntroPropertyType {
  switch (normalized) {
    case 'apartment':
      return SocialIntroPropertyType.BYT;
    case 'house':
      return SocialIntroPropertyType.DUM;
    case 'land':
      return SocialIntroPropertyType.POZEMEK;
    case 'commercial':
      return SocialIntroPropertyType.KOMERCNI;
    case 'garage':
      return SocialIntroPropertyType.GARAZ;
    case 'other':
    default:
      return SocialIntroPropertyType.OSTATNI;
  }
}

export function resolveListingRawPropertyType(input: ListingIntroContext): string {
  const key = (input.propertyTypeKey ?? '').trim();
  const type = (input.propertyType ?? '').trim();
  if (key && type && key.toLowerCase() !== type.toLowerCase()) {
    return `${key} / ${type}`;
  }
  return key || type || '—';
}

export function resolveListingNormalizedType(input: ListingIntroContext): NormalizedPropertyType {
  const key = (input.propertyTypeKey ?? '').trim();
  const type = (input.propertyType ?? '').trim();

  const fromKey = key ? normalizePropertyType(key) : 'other';
  if (fromKey !== 'other') return fromKey;

  const fromType = type ? normalizePropertyType(type) : 'other';
  if (fromType !== 'other') return fromType;

  const blob = `${key} ${type} ${input.title ?? ''} ${input.description ?? ''}`;
  return normalizePropertyType(blob);
}

/** Mapuje inzerát na strukturální kategorii (Byt, Dům, …). */
export function resolveStructuralSocialIntroPropertyType(
  input: ListingIntroContext,
): SocialIntroPropertyType {
  return normalizedToSocialIntroEnum(resolveListingNormalizedType(input));
}

/**
 * Pořadí hledání aktivního úvodního videa podle normalizovaného typu.
 */
export function buildIntroVideoLookupOrder(
  input: ListingIntroContext,
): SocialIntroPropertyType[] {
  const normalizedOrder: NormalizedPropertyType[] = [
    resolveListingNormalizedType(input),
  ];
  const offer = (input.offerType ?? '').trim().toLowerCase();
  const textBlob = `${(input.title ?? '')} ${(input.description ?? '')}`.toLowerCase();

  if (
    normalizedOrder[0] !== 'house' &&
    (textBlob.includes('novostavb') || normalizePropertyType(textBlob) === 'house')
  ) {
    normalizedOrder.push('house');
  }
  if (offer.includes('pron')) {
    normalizedOrder.push('other');
  }

  const uniqueNormalized = [...new Set(normalizedOrder)];
  return uniqueNormalized.map((n) => normalizedToSocialIntroEnum(n));
}

/** Primární typ pro logy (strukturální kategorie inzerátu). */
export function resolveSocialIntroPropertyType(
  input: ListingIntroContext,
): SocialIntroPropertyType {
  return resolveStructuralSocialIntroPropertyType(input);
}
