export const AI_SALES_PROMPT_FEATURES = {
  PARTNER_ANALYSIS: 'AI_SALES_PARTNER_ANALYSIS',
  PARTNER_SEARCH_QUERY: 'AI_SALES_PARTNER_SEARCH_QUERY',
  FIT_SCORING: 'AI_SALES_FIT_SCORING',
  FIRST_OUTREACH: 'AI_SALES_FIRST_OUTREACH',
  FOLLOW_UP: 'AI_SALES_FOLLOW_UP',
  REPLY_CLASSIFICATION: 'AI_SALES_REPLY_CLASSIFICATION',
  REPLY_DRAFT: 'AI_SALES_REPLY_DRAFT',
  CAMPAIGN_SUMMARY: 'AI_SALES_CAMPAIGN_SUMMARY',
  LEAD_SUMMARY: 'AI_SALES_LEAD_SUMMARY',
  MEETING_PREPARATION: 'AI_SALES_MEETING_PREPARATION',
  MAIN: 'AI_SALES_MAIN',
} as const;

export const AI_SALES_KNOWLEDGE_CATEGORIES = [
  'XXREALIT_GENERAL',
  'AGENT_OFFER',
  'AGENCY_OFFER',
  'CONSTRUCTION_COMPANY_OFFER',
  'DEVELOPER_OFFER',
  'FINANCIAL_ADVISOR_OFFER',
  'INVESTOR_OFFER',
  'PRICING',
  'REGISTRATION',
  'MARKETING',
  'LEADS',
  'SOCIAL_PUBLISHING',
  'CONTACT_RULES',
  'LEGAL_AND_PRIVACY',
  'FREQUENT_OBJECTIONS',
] as const;

export const AI_SALES_PARTNER_TYPES = [
  'REAL_ESTATE_AGENT',
  'REAL_ESTATE_AGENCY',
  'CONSTRUCTION_COMPANY',
  'DEVELOPER',
  'FINANCIAL_ADVISOR',
  'MORTGAGE_SPECIALIST',
  'INVESTOR',
  'CRAFTSMAN',
  'PROPERTY_SERVICES',
  'PROPERTY_MANAGER',
  'PROPERTY_PHOTOGRAPHER',
  'LEGAL_TECH_SPECIALIST',
  'OTHER',
] as const;

export const AI_SALES_PERMISSIONS = [
  'AI_SALES_VIEW',
  'AI_SALES_MANAGE_PROSPECTS',
  'AI_SALES_GENERATE',
  'AI_SALES_APPROVE',
  'AI_SALES_SEND',
  'AI_SALES_VIEW_REPLIES',
  'AI_SALES_MANAGE_CAMPAIGNS',
  'AI_SALES_MANAGE_PROMPTS',
  'AI_SALES_MANAGE_KNOWLEDGE',
  'AI_SALES_VIEW_PERSONAL_DATA',
  'AI_SALES_EXPORT',
] as const;

export type AiSalesPermission = (typeof AI_SALES_PERMISSIONS)[number];

export const PARTNER_TYPE_LABELS: Record<string, string> = {
  REAL_ESTATE_AGENT: 'Makléř',
  REAL_ESTATE_AGENCY: 'Realitní kancelář',
  CONSTRUCTION_COMPANY: 'Stavební firma',
  DEVELOPER: 'Developer',
  FINANCIAL_ADVISOR: 'Finanční poradce',
  MORTGAGE_SPECIALIST: 'Hypoteční specialista',
  INVESTOR: 'Investor',
  CRAFTSMAN: 'Řemeslník',
  PROPERTY_SERVICES: 'Služby pro nemovitosti',
  PROPERTY_MANAGER: 'Správce nemovitostí',
  PROPERTY_PHOTOGRAPHER: 'Fotograf nemovitostí',
  LEGAL_TECH_SPECIALIST: 'Právní/technický specialista',
  OTHER: 'Jiný partner',
};

export const FIT_SCORE_LABELS = {
  low: { min: 0, max: 29, label: 'Nízká vhodnost' },
  medium: { min: 30, max: 59, label: 'Střední vhodnost' },
  good: { min: 60, max: 79, label: 'Vhodný partner' },
  priority: { min: 80, max: 100, label: 'Prioritní partner' },
} as const;

export function fitScoreCategory(score: number | null | undefined): string {
  if (score == null) return '—';
  if (score >= 80) return FIT_SCORE_LABELS.priority.label;
  if (score >= 60) return FIT_SCORE_LABELS.good.label;
  if (score >= 30) return FIT_SCORE_LABELS.medium.label;
  return FIT_SCORE_LABELS.low.label;
}

export const OPT_OUT_FOOTER =
  '\n\n---\nPokud si nepřejete dostávat další obchodní sdělení, odpovězte prosím „NEZÁJEM“ nebo nás kontaktujte na podpora@xxrealit.cz.';
