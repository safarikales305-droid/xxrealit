export type MetaDiagnosticLevel = 'ok' | 'warning' | 'error';

export type MetaCapiEventKey =
  | 'PageView'
  | 'ViewContent'
  | 'Search'
  | 'Lead'
  | 'Contact'
  | 'CompleteRegistration'
  | 'Favorite'
  | 'PhoneReveal'
  | 'MessageSeller'
  | 'PurchaseCredits'
  | 'PromotionPurchase'
  | 'VideoPlay';

export type MetaPixelTestEvent =
  | 'PageView'
  | 'ViewContent'
  | 'Search'
  | 'Lead'
  | 'CompleteRegistration'
  | 'Contact'
  | 'PurchaseCredits'
  | 'Favorite'
  | 'Share'
  | 'MessageSeller'
  | 'VideoPlay';

export const META_SERVICE_KEYS = [
  'facebook_app',
  'facebook_login',
  'facebook_pages',
  'instagram_graph',
  'whatsapp_business',
  'meta_pixel',
  'conversions_api',
  'commerce_manager',
  'facebook_catalog',
  'dataset',
  'xml_feed',
  'csv_feed',
  'json_feed',
  'webhook',
  'domain_verification',
] as const;

export type MetaServiceKey = (typeof META_SERVICE_KEYS)[number];

export const META_SERVICE_LABELS: Record<MetaServiceKey, string> = {
  facebook_app: 'Facebook App',
  facebook_login: 'Facebook Login',
  facebook_pages: 'Facebook Pages API',
  instagram_graph: 'Instagram Graph API',
  whatsapp_business: 'WhatsApp Business API',
  meta_pixel: 'Meta Pixel',
  conversions_api: 'Conversions API',
  commerce_manager: 'Commerce Manager',
  facebook_catalog: 'Facebook Catalog',
  dataset: 'Dataset',
  xml_feed: 'XML Feed',
  csv_feed: 'CSV Feed',
  json_feed: 'JSON Feed',
  webhook: 'Webhook',
  domain_verification: 'Domain Verification',
};

export const DEFAULT_CAPI_TOGGLES: Record<MetaCapiEventKey, boolean> = {
  PageView: true,
  ViewContent: true,
  Search: true,
  Lead: true,
  Contact: true,
  CompleteRegistration: true,
  Favorite: true,
  PhoneReveal: true,
  MessageSeller: true,
  PurchaseCredits: true,
  PromotionPurchase: false,
  VideoPlay: true,
};

export const DEFAULT_PIXEL_MAPPING: Record<string, string> = {
  homepage: '/',
  search: '/hledat',
  listing_detail: '/nemovitost',
  profile: '/profil',
  registration: '/registrace',
  login: '/login',
  credits: '/profil/kredity',
  credits_order: '/profil/kredity/objednavka',
  chat: '/profil/zpravy',
  phone: 'event:phone_reveal',
  whatsapp: 'event:whatsapp_click',
  favorites: '/profil/oblibene',
  share: 'event:share',
  video: 'event:video_play',
  stories: '/stories',
  shorts: '/shorts',
  classic: '/nemovitosti',
  projects: '/projekty',
};

export const DEFAULT_REMARKETING_AUDIENCES = [
  { id: 'visited_web', label: 'Navštívil web', enabled: true, description: 'Všichni návštěvníci webu (180 dní)' },
  { id: 'viewed_listing', label: 'Prohlížel inzerát', enabled: true, description: 'ViewContent na detailu inzerátu' },
  { id: 'played_video', label: 'Přehrál video', enabled: true, description: 'VideoPlay / Shorts zhlédnutí' },
  { id: 'clicked_phone', label: 'Klikl na telefon', enabled: true, description: 'PhoneReveal událost' },
  { id: 'clicked_whatsapp', label: 'Klikl na WhatsApp', enabled: true, description: 'WhatsApp kontakt' },
  { id: 'clicked_email', label: 'Klikl na email', enabled: true, description: 'Kontaktní e-mail' },
  { id: 'registered', label: 'Registroval se', enabled: true, description: 'CompleteRegistration' },
  { id: 'added_listing', label: 'Přidal inzerát', enabled: true, description: 'Vlastníci / makléři s novým inzerátem' },
  { id: 'bought_credits', label: 'Koupil kredity', enabled: true, description: 'PurchaseCredits' },
  { id: 'inactive_user', label: 'Neaktivní uživatel', enabled: false, description: 'Bez aktivity 30+ dní' },
];

export const DEFAULT_AUTO_CAMPAIGN_RULES = [
  { id: 'new_listing', label: 'Nový inzerát', enabled: true, trigger: 'listing.created' },
  { id: 'premium_listing', label: 'Premium inzerát', enabled: true, trigger: 'listing.premium' },
  { id: 'developer_project', label: 'Developer projekt', enabled: true, trigger: 'developer.project' },
  { id: 'new_broker', label: 'Nový makléř', enabled: false, trigger: 'user.broker' },
  { id: 'new_builder', label: 'Nová stavební firma', enabled: false, trigger: 'user.builder' },
  { id: 'new_investor', label: 'Nový investor', enabled: false, trigger: 'user.investor' },
  { id: 'new_tipster', label: 'Nový tipař', enabled: false, trigger: 'user.tipster' },
  { id: 'bonus_campaign', label: 'Bonusová akce', enabled: true, trigger: 'bonus.active' },
  { id: 'new_reel', label: 'Nový Reel', enabled: true, trigger: 'reel.published' },
  { id: 'carousel_ad', label: 'Carousel reklama', enabled: true, trigger: 'ads.carousel' },
  { id: 'stories_ad', label: 'Stories reklama', enabled: true, trigger: 'ads.stories' },
];

export const DEFAULT_AD_FORMAT_FLAGS = {
  carouselAds: true,
  collectionAds: true,
  dynamicAds: true,
  catalogAds: true,
  storiesAds: true,
  reelsAds: true,
  leadAds: true,
  marketplaceAds: true,
  advantagePlus: true,
  remarketing: true,
};

export { DEFAULT_AD_PLACEMENT_SETTINGS } from './meta-placements.util';

export const GRAPH_API_VERSION_DEFAULT = 'v21.0';
