export const AI_CHAT_PROMPT_FEATURES = {
  MAIN_CHAT: 'ai_chat_main',
  INTENT_CLASSIFICATION: 'ai_chat_intent',
  PROFILE_EXTRACTION: 'ai_chat_profile',
  CONVERSATION_SUMMARY: 'ai_chat_summary',
  QUALITY_EVALUATION: 'ai_chat_eval',
} as const;

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
