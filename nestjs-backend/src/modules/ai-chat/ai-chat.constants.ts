export const AI_CHAT_PROMPT_FEATURES = {
  MAIN_CHAT: 'MAIN_CHAT',
  INTENT_CLASSIFICATION: 'INTENT_CLASSIFICATION',
  PROPERTY_SEARCH: 'PROPERTY_SEARCH',
  AGENT_REGISTRATION: 'AGENT_REGISTRATION',
  AGENCY_COOPERATION: 'AGENCY_COOPERATION',
  CONSTRUCTION_COMPANY: 'CONSTRUCTION_COMPANY',
  INVESTOR: 'INVESTOR',
  SELL_PROPERTY: 'SELL_PROPERTY',
  RENT_PROPERTY: 'RENT_PROPERTY',
  SUPPORT: 'SUPPORT',
  LEAD_QUALIFICATION: 'LEAD_QUALIFICATION',
  CONVERSATION_SUMMARY: 'CONVERSATION_SUMMARY',
  QUALITY_EVALUATION: 'QUALITY_EVALUATION',
  PROFILE_EXTRACTION: 'PROFILE_EXTRACTION',
} as const;

export type AiChatPromptFeature = (typeof AI_CHAT_PROMPT_FEATURES)[keyof typeof AI_CHAT_PROMPT_FEATURES];

export const AI_CHAT_PROMPT_TYPE_LABELS: Record<string, string> = {
  MAIN_CHAT: 'Hlavní chat',
  INTENT_CLASSIFICATION: 'Klasifikace intentu',
  PROPERTY_SEARCH: 'Vyhledávání nemovitostí',
  AGENT_REGISTRATION: 'Registrace makléře',
  AGENCY_COOPERATION: 'Spolupráce RK',
  CONSTRUCTION_COMPANY: 'Stavební firmy',
  INVESTOR: 'Investor',
  SELL_PROPERTY: 'Prodej nemovitosti',
  RENT_PROPERTY: 'Pronájem nemovitosti',
  SUPPORT: 'Podpora',
  LEAD_QUALIFICATION: 'Kvalifikace leadu',
  CONVERSATION_SUMMARY: 'Shrnutí konverzace',
  QUALITY_EVALUATION: 'Hodnocení kvality',
  PROFILE_EXTRACTION: 'Extrakce profilu',
};

export const AI_CHAT_KNOWLEDGE_CATEGORIES = [
  'PORTAL_GENERAL',
  'REGISTRATION',
  'LISTINGS',
  'AGENTS',
  'AGENCIES',
  'CONSTRUCTION_COMPANIES',
  'INVESTORS',
  'CREDITS',
  'PAYMENTS',
  'PRIVACY',
  'SUPPORT',
  'SEO',
  'SOCIAL_NETWORKS',
  'COOPERATION',
  'PROPERTY_SEARCH',
  'SELL_PROPERTY',
  'RENT_PROPERTY',
] as const;

export const AI_CHAT_ALLOWED_PROMPT_VARIABLES = [
  'currentUrl',
  'pageType',
  'listingTitle',
  'listingId',
  'userRole',
  'detectedIntent',
  'searchProfile',
  'approvedKnowledge',
  'conversationHistory',
  'availableListings',
  'portalName',
] as const;

export const AI_CHAT_VAGUE_RESPONSE_PATTERNS = [
  /chvíli\s+prosím/i,
  /moment\s+prosím/i,
  /něco\s+najdu/i,
  /vyhledávám/i,
  /hned\s+se\s+na\s+to\s+podívám/i,
  /počkejte\s+chvíli/i,
];

export const AI_CHAT_NO_RESULTS_MESSAGE =
  'Pro zadané podmínky jsem nyní nenašel žádnou aktivní nabídku. Můžeme rozšířit lokalitu, upravit cenu nebo nastavit upozornění na nové nabídky.';

export const AI_CHAT_QUICK_ACTIONS = [
  { id: 'search', label: 'Hledám nemovitost', intentHint: 'BUY_PROPERTY' },
  { id: 'sell', label: 'Chci prodat nemovitost', intentHint: 'SELL_PROPERTY' },
  { id: 'rent_out', label: 'Chci pronajmout nemovitost', intentHint: 'RENT_OUT_PROPERTY' },
  { id: 'agent', label: 'Jsem makléř', intentHint: 'AGENT_REGISTRATION' },
  { id: 'agency', label: 'Mám realitní kancelář', intentHint: 'AGENCY_COOPERATION' },
  { id: 'construction', label: 'Mám stavební firmu', intentHint: 'CONSTRUCTION_COMPANY' },
  { id: 'investor', label: 'Jsem investor', intentHint: 'INVESTOR' },
  { id: 'support', label: 'Potřebuji podporu', intentHint: 'PORTAL_SUPPORT' },
] as const;

export const AI_CHAT_GREETING =
  'Dobrý den, jsem AI průvodce portálu XXREALIT. Pomohu vám najít nemovitost, nabídnout nemovitost, spojit se s makléřem nebo zjistit možnosti spolupráce. Co právě potřebujete?';

export const AI_CHAT_FALLBACK_MESSAGE =
  'AI průvodce je dočasně nedostupný. Můžete pokračovat ve vyhledávání nebo nám zanechat kontakt.';

export const AI_CHAT_PAGE_TYPES = [
  'PORTAL',
  'HOME',
  'PROPERTY_DETAIL',
  'SHORTS_FEED',
  'CLASSIC_LISTINGS',
  'PUBLIC_PROFILE',
  'SEO_PAGE',
  'REGISTRATION',
  'AGENT_PAGES',
  'COMPANY_PAGES',
] as const;
