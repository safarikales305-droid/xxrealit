export const META_CREATIVE_SOURCE_OPTIONS = [
  { value: 'catalog_products', label: 'Katalogový produkt' },
  { value: 'listing', label: 'Inzerát XXREALIT' },
  { value: 'public_post', label: 'Veřejný příspěvek' },
  { value: 'facebook_post', label: 'Facebook příspěvek' },
  { value: 'instagram_post', label: 'Instagram příspěvek' },
  { value: 'custom_image', label: 'Vlastní obrázek' },
  { value: 'custom_video', label: 'Vlastní video' },
] as const;

export const META_CTA_OPTIONS = [
  { value: 'LEARN_MORE', label: 'Zjistit více' },
  { value: 'SHOP_NOW', label: 'Nakoupit' },
  { value: 'SIGN_UP', label: 'Registrovat se' },
  { value: 'CONTACT_US', label: 'Kontaktovat' },
  { value: 'GET_OFFER', label: 'Získat nabídku' },
  { value: 'GET_QUOTE', label: 'Nezávazná poptávka' },
  { value: 'CALL_NOW', label: 'Zavolat' },
  { value: 'SEND_MESSAGE', label: 'Poslat zprávu' },
] as const;

export type MetaAdPlacementId =
  | 'facebook_feed_desktop'
  | 'facebook_feed_mobile'
  | 'instagram_feed'
  | 'instagram_stories'
  | 'facebook_stories'
  | 'marketplace'
  | 'reels'
  | 'audience_network';

export const META_AD_PLACEMENTS: Array<{
  id: MetaAdPlacementId;
  label: string;
  aspect: string;
  width: number;
  platform: 'facebook' | 'instagram' | 'meta';
}> = [
  { id: 'facebook_feed_desktop', label: 'Desktop Facebook Feed', aspect: '1.91/1', width: 500, platform: 'facebook' },
  { id: 'facebook_feed_mobile', label: 'Mobil Facebook Feed', aspect: '1/1', width: 320, platform: 'facebook' },
  { id: 'instagram_feed', label: 'Instagram Feed', aspect: '1/1', width: 320, platform: 'instagram' },
  { id: 'instagram_stories', label: 'Instagram Stories', aspect: '9/16', width: 270, platform: 'instagram' },
  { id: 'facebook_stories', label: 'Facebook Stories', aspect: '9/16', width: 270, platform: 'facebook' },
  { id: 'marketplace', label: 'Marketplace', aspect: '1/1', width: 320, platform: 'facebook' },
  { id: 'reels', label: 'Reels', aspect: '9/16', width: 270, platform: 'instagram' },
  { id: 'audience_network', label: 'Audience Network', aspect: '16/9', width: 400, platform: 'meta' },
];

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

export function getCreativePreviewImage(
  payload: MetaCampaignCreativePayload | Record<string, unknown>,
): string | null {
  const p = payload as MetaCampaignCreativePayload;
  if (typeof p.image === 'string' && p.image) return p.image;
  if (Array.isArray(p.gallery) && typeof p.gallery[0] === 'string') return p.gallery[0];
  return null;
}

export function placementAspectClass(placementId: MetaAdPlacementId): string {
  switch (placementId) {
    case 'instagram_stories':
    case 'facebook_stories':
    case 'reels':
      return 'aspect-[9/16]';
    case 'audience_network':
      return 'aspect-video';
    case 'facebook_feed_desktop':
      return 'aspect-[1.91/1]';
    default:
      return 'aspect-square';
  }
}
