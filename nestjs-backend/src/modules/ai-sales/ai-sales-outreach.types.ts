export type OutreachBenefit = {
  title: string;
  description: string;
};

export type OutreachAiOutput = {
  subject: string;
  preheader: string;
  greeting: string;
  intro: string;
  benefits: OutreachBenefit[];
  ctaText: string;
  ctaUrl: string;
  closing: string;
  signature: string;
  plainText: string;
  personalizationReasons: string[];
  usedKnowledgeIds: string[];
  confidence: number;
  outreachReason?: string;
  recommendedOffer?: string;
};

export type GenerateOutreachOptions = {
  campaignId?: string;
  tone?: 'PROFESSIONAL' | 'FRIENDLY' | 'CONCISE';
  variantCount?: number;
  testMode?: boolean;
  variantLabel?: string;
  requireCompletedAnalysis?: boolean;
};

export const OUTREACH_VARIANTS = [
  { label: 'A', tone: 'PROFESSIONAL' as const, style: 'formální, profesionální, důvěryhodný' },
  { label: 'B', tone: 'FRIENDLY' as const, style: 'přátelský, lidský, přirozený' },
  { label: 'C', tone: 'CONCISE' as const, style: 'stručný, věcný, bez zbytečných slov' },
];

export function validateOutreachAiOutput(raw: unknown): OutreachAiOutput {
  if (!raw || typeof raw !== 'object') {
    throw new Error('AI vrátilo neplatný výstup (není objekt).');
  }
  const o = raw as Record<string, unknown>;
  const benefits = Array.isArray(o.benefits)
    ? o.benefits
        .filter((b) => b && typeof b === 'object')
        .map((b) => {
          const item = b as Record<string, unknown>;
          return {
            title: String(item.title ?? '').trim(),
            description: String(item.description ?? '').trim(),
          };
        })
        .filter((b) => b.title && b.description)
    : [];

  const subject = String(o.subject ?? '').trim();
  const intro = String(o.intro ?? o.body ?? '').trim();
  if (!subject) throw new Error('AI výstup neobsahuje předmět.');
  if (!intro) throw new Error('AI výstup neobsahuje úvod.');

  return {
    subject,
    preheader: String(o.preheader ?? '').trim(),
    greeting: String(o.greeting ?? 'Dobrý den,').trim(),
    intro,
    benefits,
    ctaText: String(o.ctaText ?? o.callToAction ?? 'Zjistit více o XXREALIT').trim(),
    ctaUrl: String(o.ctaUrl ?? 'https://www.xxrealit.cz').trim(),
    closing: String(o.closing ?? 'Těšíme se na případnou spolupráci.').trim(),
    signature: String(o.signature ?? 'Tým XXREALIT').trim(),
    plainText: String(o.plainText ?? '').trim(),
    personalizationReasons: Array.isArray(o.personalizationReasons)
      ? o.personalizationReasons.map(String).filter(Boolean)
      : [],
    usedKnowledgeIds: Array.isArray(o.usedKnowledgeIds) ? o.usedKnowledgeIds.map(String) : [],
    confidence: Math.max(0, Math.min(1, Number(o.confidence) || 0.7)),
    outreachReason: o.outreachReason ? String(o.outreachReason) : undefined,
    recommendedOffer: o.recommendedOffer ? String(o.recommendedOffer) : undefined,
  };
}

export function buildPlainTextFromParts(output: OutreachAiOutput): string {
  if (output.plainText) return output.plainText;
  const benefitLines = output.benefits.map((b) => `• ${b.title}: ${b.description}`).join('\n');
  return [
    output.greeting,
    '',
    output.intro,
    benefitLines ? `\n${benefitLines}` : '',
    '',
    output.ctaText ? `${output.ctaText}: ${output.ctaUrl}` : '',
    '',
    output.closing,
    '',
    output.signature,
  ]
    .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
    .join('\n');
}
