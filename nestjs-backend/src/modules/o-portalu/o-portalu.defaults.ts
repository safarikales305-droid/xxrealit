export type DefaultPortalStat = {
  key: string;
  label: string;
  order: number;
  category?: string;
  icon?: string;
  realValue?: number;
  multiplier?: number;
};

export const DEFAULT_PUBLIC_PORTAL_STATS: DefaultPortalStat[] = [
  { key: 'web_visits', label: 'Návštěvy webu', order: 1, category: 'core', icon: '🌐', realValue: 0, multiplier: 1 },
  { key: 'listing_views', label: 'Shlédnutí inzerátů', order: 2, category: 'core', icon: '👁', realValue: 0, multiplier: 1 },
  { key: 'reel_views', label: 'Shlédnutí Reelů', order: 3, category: 'core', icon: '🎬', realValue: 0, multiplier: 1 },
  { key: 'facebook_reach', label: 'Dosah Facebook', order: 4, category: 'social', icon: '📘', realValue: 0, multiplier: 1 },
  { key: 'tiktok_reach', label: 'Dosah TikTok', order: 5, category: 'social', icon: '🎵', realValue: 0, multiplier: 1 },
  { key: 'youtube_reach', label: 'Dosah YouTube', order: 6, category: 'social', icon: '▶', realValue: 0, multiplier: 1 },
  { key: 'instagram_reach', label: 'Dosah Instagram', order: 7, category: 'social', icon: '📸', realValue: 0, multiplier: 1 },
  { key: 'registered_users', label: 'Registrovaní uživatelé', order: 8, category: 'core', icon: '👥', realValue: 0, multiplier: 1 },
  { key: 'active_listings', label: 'Aktivní inzeráty', order: 9, category: 'core', icon: '🏠', realValue: 0, multiplier: 1 },
  { key: 'leads_sent', label: 'Odeslané kontakty / leady', order: 10, category: 'core', icon: '📩', realValue: 0, multiplier: 1 },
];

export type DefaultLeadPrice = {
  title: string;
  description: string;
  priceCzk: number;
  priceCredits: number;
  appliesToRoles: string;
  billedToLabel: string;
  order: number;
};

export const DEFAULT_LEAD_PRICES: DefaultLeadPrice[] = [
  {
    title: 'Zobrazení kontaktu na prodávajícího',
    description: 'Zájemce získá kontakt na prodávajícího u vybraného inzerátu.',
    priceCzk: 50,
    priceCredits: 50,
    appliesToRoles: 'AGENT,COMPANY',
    billedToLabel: 'Inzerentovi',
    order: 1,
  },
  {
    title: 'Kontakt na majitele nemovitosti',
    description: 'Lead na majitele nemovitosti předaný makléři nebo portálu.',
    priceCzk: 50,
    priceCredits: 50,
    appliesToRoles: 'AGENT,COMPANY',
    billedToLabel: 'Inzerentovi',
    order: 2,
  },
  {
    title: 'Kontakt na zájemce',
    description: 'Kontakt na zájemce o nemovitost z inzerátu.',
    priceCzk: 50,
    priceCredits: 50,
    appliesToRoles: 'AGENT,COMPANY',
    billedToLabel: 'Inzerentovi',
    order: 3,
  },
  {
    title: 'Kontakt z poptávky',
    description: 'Lead z poptávky zájemce o koupi nebo pronájem.',
    priceCzk: 50,
    priceCredits: 50,
    appliesToRoles: 'AGENT,COMPANY',
    billedToLabel: 'Inzerentovi',
    order: 4,
  },
  {
    title: 'Prémiový lead',
    description: 'Kvalitní lead s vyšší pravděpodobností uzavření obchodu.',
    priceCzk: 150,
    priceCredits: 150,
    appliesToRoles: 'AGENT,COMPANY',
    billedToLabel: 'Inzerentovi',
    order: 5,
  },
  {
    title: 'Tip na nemovitost',
    description: 'Tipař předá tip na nemovitost — odměna dle provizního nastavení.',
    priceCzk: 50,
    priceCredits: 50,
    appliesToRoles: 'USER,AGENT',
    billedToLabel: 'Dle dohody tipaře',
    order: 6,
  },
];
