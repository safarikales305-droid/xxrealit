/** Budoucí rozšíření Meta Marketing platformy XXREALIT. */
export const META_MARKETING_FUTURE_FEATURES = [
  'lookalike_audience',
  'advantage_plus',
  'dynamic_ads',
  'carousel_ads',
  'video_ads',
  'reels_ads',
  'instagram_ads',
  'facebook_feed_ads',
  'marketplace_ads',
  'messenger_ads',
  'whatsapp_ads',
  'ai_budget_optimization',
] as const;

export type MetaMarketingFutureFeature = (typeof META_MARKETING_FUTURE_FEATURES)[number];

export const META_CREATIVE_TYPES = [
  'catalog_products',
  'listing',
  'social_post',
  'custom_creative',
] as const;

export type MetaCreativeType = (typeof META_CREATIVE_TYPES)[number];

export const META_CAMPAIGN_TARGETING_MODES = ['map', 'remarketing', 'map_remarketing'] as const;

export type MetaCampaignTargetingMode = (typeof META_CAMPAIGN_TARGETING_MODES)[number];

export const META_REMARKETING_AUDIENCE_TYPES = [
  'visited_web',
  'viewed_listing',
  'viewed_property',
  'clicked_phone',
  'clicked_whatsapp',
  'clicked_email',
  'contact_form',
  'video_play',
  'shorts',
  'add_to_wishlist',
  'registered_users',
  'brokers',
  'builders',
  'investors',
  'financial_advisors',
] as const;

export type MetaRemarketingAudienceType = (typeof META_REMARKETING_AUDIENCE_TYPES)[number];

export const META_LIVE_DIAGNOSTIC_EVENTS = [
  'PageView',
  'ViewContent',
  'Lead',
  'Contact',
  'Search',
  'VideoPlay',
  'CompleteRegistration',
  'Favorite',
  'PhoneReveal',
  'MessageSeller',
] as const;

export const META_DATASET_CONFIGURED_INFO =
  'Dataset je nastaven z konfigurace. Graph API momentálně nevrátil seznam Datasetů.';
