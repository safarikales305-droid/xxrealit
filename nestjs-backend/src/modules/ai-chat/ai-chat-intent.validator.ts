import type { AiChatIntent } from '@prisma/client';

const VALID_INTENTS = new Set<string>([
  'BUY_PROPERTY',
  'RENT_PROPERTY',
  'SELL_PROPERTY',
  'RENT_OUT_PROPERTY',
  'FIND_AGENT',
  'AGENT_REGISTRATION',
  'AGENCY_COOPERATION',
  'CONSTRUCTION_COMPANY',
  'FINANCIAL_ADVISOR',
  'INVESTOR',
  'PROPERTY_OWNER',
  'SERVICE_PROVIDER',
  'PORTAL_SUPPORT',
  'GENERAL_QUESTION',
  'UNKNOWN',
]);

const VALID_STAGES = new Set(['DISCOVERY', 'ACTIVE_SEARCH', 'COMPARISON', 'READY_FOR_LEAD', 'CONTACT_COLLECTED', 'CLOSED']);

export type IntentClassificationResult = {
  intent: AiChatIntent;
  confidence: number;
  leadScore: number;
  stage: string;
  missingFields: string[];
};

export function parseIntentClassification(raw: string): IntentClassificationResult | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const intent = String(parsed.intent ?? 'UNKNOWN');
    if (!VALID_INTENTS.has(intent)) return null;
    const stage = String(parsed.stage ?? 'DISCOVERY');
    return {
      intent: intent as AiChatIntent,
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence ?? 0))),
      leadScore: Math.min(100, Math.max(0, Math.round(Number(parsed.leadScore ?? 0)))),
      stage: VALID_STAGES.has(stage) ? stage : 'DISCOVERY',
      missingFields: Array.isArray(parsed.missingFields)
        ? parsed.missingFields.map((f) => String(f)).slice(0, 20)
        : [],
    };
  } catch {
    return null;
  }
}
