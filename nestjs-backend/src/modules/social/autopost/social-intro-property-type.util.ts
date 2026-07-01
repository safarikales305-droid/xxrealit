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

export type ListingIntroContext = {
  propertyTypeKey?: string | null;
  propertyType?: string | null;
  offerType?: string | null;
  title?: string | null;
  description?: string | null;
};

/** Mapuje inzerát na kategorii úvodního videa pro Reel. */
export function resolveSocialIntroPropertyType(
  input: ListingIntroContext,
): SocialIntroPropertyType {
  const offer = (input.offerType ?? '').trim().toLowerCase();
  if (offer.includes('pron')) {
    return SocialIntroPropertyType.PRONAJEM;
  }

  const key = (input.propertyTypeKey ?? input.propertyType ?? '').trim().toLowerCase();
  const blob = `${key} ${(input.title ?? '')} ${(input.description ?? '')}`.toLowerCase();

  if (blob.includes('novostavb')) {
    return SocialIntroPropertyType.NOVOSTAVBA;
  }
  if (key === 'byt' || key.includes('byt')) {
    return SocialIntroPropertyType.BYT;
  }
  if (
    key === 'dum' ||
    key.includes('dum') ||
    key.includes('dům') ||
    key === 'chata_chalupa' ||
    key.includes('chata')
  ) {
    return SocialIntroPropertyType.DUM;
  }
  if (key === 'pozemek' || key.includes('pozem')) {
    return SocialIntroPropertyType.POZEMEK;
  }
  if (key === 'garaz' || key.includes('gar')) {
    return SocialIntroPropertyType.GARAZ;
  }
  if (key === 'komercni' || key.includes('komer')) {
    return SocialIntroPropertyType.KOMERCNI;
  }
  return SocialIntroPropertyType.OSTATNI;
}
