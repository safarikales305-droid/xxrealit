import type { MetaCreativeType } from './meta-marketing-platform.constants';

export type MetaCampaignCreativePayload = {
  sourceType?: string;
  primaryText?: string;
  headline?: string;
  description?: string;
  cta?: string;
  ctaType?: string;
  link?: string;
  detailUrl?: string;
  image?: string;
  imageHash?: string;
  video?: string;
  videoId?: string;
  author?: string;
  postId?: string;
  objectStoryId?: string;
  gallery?: string[];
  price?: number | null;
  currency?: string;
  city?: string;
  propertyType?: string;
  text?: string;
};

export const META_CTA_OPTIONS = [
  { value: 'LEARN_MORE', label: 'Zjistit více' },
  { value: 'SHOP_NOW', label: 'Nakoupit' },
  { value: 'SIGN_UP', label: 'Registrovat se' },
  { value: 'CONTACT_US', label: 'Kontaktovat' },
  { value: 'BOOK_TRAVEL', label: 'Rezervovat' },
  { value: 'GET_OFFER', label: 'Získat nabídku' },
  { value: 'GET_QUOTE', label: 'Nezávazná poptávka' },
  { value: 'APPLY_NOW', label: 'Přihlásit se' },
  { value: 'CALL_NOW', label: 'Zavolat' },
  { value: 'SEND_MESSAGE', label: 'Poslat zprávu' },
] as const;

export function normalizeCreativePayload(
  raw: Record<string, unknown> | undefined,
): MetaCampaignCreativePayload {
  if (!raw) return {};
  return {
    sourceType: typeof raw.sourceType === 'string' ? raw.sourceType : undefined,
    primaryText:
      typeof raw.primaryText === 'string'
        ? raw.primaryText
        : typeof raw.text === 'string'
          ? raw.text
          : undefined,
    headline: typeof raw.headline === 'string' ? raw.headline : undefined,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    cta: typeof raw.cta === 'string' ? raw.cta : undefined,
    ctaType: typeof raw.ctaType === 'string' ? raw.ctaType : undefined,
    link: typeof raw.link === 'string' ? raw.link : undefined,
    detailUrl: typeof raw.detailUrl === 'string' ? raw.detailUrl : undefined,
    image: typeof raw.image === 'string' ? raw.image : undefined,
    imageHash: typeof raw.imageHash === 'string' ? raw.imageHash : undefined,
    video: typeof raw.video === 'string' ? raw.video : undefined,
    videoId: typeof raw.videoId === 'string' ? raw.videoId : undefined,
    author: typeof raw.author === 'string' ? raw.author : undefined,
    postId: typeof raw.postId === 'string' ? raw.postId : undefined,
    objectStoryId: typeof raw.objectStoryId === 'string' ? raw.objectStoryId : undefined,
    gallery: Array.isArray(raw.gallery)
      ? raw.gallery.filter((u): u is string => typeof u === 'string')
      : undefined,
    price: typeof raw.price === 'number' ? raw.price : null,
    currency: typeof raw.currency === 'string' ? raw.currency : undefined,
    city: typeof raw.city === 'string' ? raw.city : undefined,
    propertyType: typeof raw.propertyType === 'string' ? raw.propertyType : undefined,
    text: typeof raw.text === 'string' ? raw.text : undefined,
  };
}

export function propertyTypeEmoji(propertyType: string | null | undefined): string {
  switch ((propertyType ?? '').toLowerCase()) {
    case 'dum':
    case 'dům':
      return '🏡';
    case 'byt':
      return '🏢';
    case 'pozemek':
      return '🌳';
    case 'komerce':
      return '🏪';
    default:
      return '🏠';
  }
}

export function buildListingCreativeTexts(input: {
  title: string;
  price: number | null;
  currency?: string | null;
  city?: string | null;
  propertyType?: string | null;
  description?: string | null;
}): Pick<MetaCampaignCreativePayload, 'primaryText' | 'headline' | 'description' | 'cta' | 'ctaType'> {
  const emoji = propertyTypeEmoji(input.propertyType);
  const headline = `${emoji} ${input.title}`;
  const priceLine =
    input.price != null
      ? `Cena ${input.price.toLocaleString('cs-CZ')} ${input.currency ?? 'Kč'}`
      : '';
  const primaryText = [
    headline,
    priceLine,
    input.description?.trim() || 'Více fotografií a kompletní informace na XXREALIT.',
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    primaryText,
    headline: input.title,
    description: input.city?.trim() ?? '',
    ctaType: 'LEARN_MORE',
    cta: 'Zjistit více',
  };
}

export function creativeTypeRequiresCatalogProducts(type: MetaCreativeType): boolean {
  return type === 'catalog_products';
}

export function normalizeCreativeType(value: string | undefined): MetaCreativeType {
  if (value === 'social_post') return 'facebook_post';
  if (value === 'custom_creative') return 'custom_image';
  const allowed = [
    'catalog_products',
    'listing',
    'public_post',
    'facebook_post',
    'instagram_post',
    'custom_image',
    'custom_video',
    'social_post',
    'custom_creative',
  ] as const;
  if (value && (allowed as readonly string[]).includes(value)) {
    return value as MetaCreativeType;
  }
  return 'catalog_products';
}

export function isVideoCreativeType(type: MetaCreativeType): boolean {
  return type === 'custom_video' || type === 'instagram_post';
}

export function isPostCreativeType(type: MetaCreativeType): boolean {
  return type === 'public_post' || type === 'facebook_post' || type === 'instagram_post';
}
