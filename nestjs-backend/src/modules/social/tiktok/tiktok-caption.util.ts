const OFFER_LABELS: Record<string, string> = {
  prodej: 'Prodej',
  pronájem: 'Pronájem',
  pronajem: 'Pronájem',
};

const PROPERTY_LABELS: Record<string, string> = {
  byt: 'bytu',
  dum: 'domu',
  dům: 'domu',
  pozemek: 'pozemku',
  komercni: 'komerčního prostoru',
  komerční: 'komerčního prostoru',
  garaz: 'garáže',
  garáž: 'garáže',
  novostavba: 'novostavby',
  ostatni: 'nemovitosti',
  ostatní: 'nemovitosti',
};

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function buildTikTokOfferLabel(offerType: string): string {
  const key = normalizeKey(offerType);
  return OFFER_LABELS[key] ?? (offerType.trim() || 'Nabídka');
}

export function buildTikTokPropertyLabel(propertyType: string): string {
  const key = normalizeKey(propertyType);
  return PROPERTY_LABELS[key] ?? (propertyType.trim() || 'nemovitosti');
}

export function buildTikTokCaption(input: {
  offerType: string;
  propertyType: string;
  city: string;
}): string {
  const offer = buildTikTokOfferLabel(input.offerType);
  const property = buildTikTokPropertyLabel(input.propertyType);
  const city = input.city?.trim() || 'Česko';
  return `${offer} ${property} – ${city} | XXREALIT`;
}

export function buildTikTokHashtags(input: {
  offerType: string;
  propertyType: string;
}): string {
  const tags = new Set([
    '#xxrealit',
    '#reality',
    '#nemovitosti',
    '#prodej',
    '#pronajem',
    '#bydleni',
  ]);

  const offerKey = normalizeKey(input.offerType);
  if (offerKey.includes('pronaj')) {
    tags.add('#pronajem');
  } else if (offerKey.includes('prod')) {
    tags.add('#prodej');
  }

  const propertyKey = normalizeKey(input.propertyType);
  if (propertyKey === 'byt') tags.add('#byt');
  if (propertyKey === 'dum') tags.add('#dum');

  return [...tags].join(' ');
}

export function buildTikTokPostText(caption: string, hashtags: string): string {
  return `${caption}\n\n${hashtags}`.trim();
}
