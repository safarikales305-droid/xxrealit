export type PartnerAnalysisOutput = {
  companySummary: string;
  partnerType: string;
  fitScore: number;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  servicesDetected: string[];
  locationsDetected: string[];
  recommendedProducts: string[];
  recommendedOffer: string;
  personalizationPoints: string[];
  risks: string[];
  missingInformation: string[];
  recommendedTone: string;
  recommendedNextStep: string;
};

export function parsePartnerAnalysisJson(text: string): unknown {
  const trimmed = text.trim();
  const jsonStart = trimmed.indexOf('{');
  const jsonEnd = trimmed.lastIndexOf('}');
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
  }
  return JSON.parse(trimmed);
}

export function validatePartnerAnalysisOutput(
  raw: unknown,
): { ok: true; data: PartnerAnalysisOutput } | { ok: false; errors: string[] } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['Odpověď není JSON objekt.'] };
  }
  const o = raw as Record<string, unknown>;
  const errors: string[] = [];

  const companySummary = pickString(o, ['companySummary', 'summary']);
  const partnerType = pickString(o, ['partnerType', 'activityType', 'companyType']);
  const fitScoreRaw = o.fitScore ?? o.fit_score;
  const fitScore = Number(fitScoreRaw);
  const recommendedOffer = pickString(o, ['recommendedOffer', 'aiRecommendation']);

  if (!companySummary) errors.push('Chybí companySummary.');
  if (!partnerType) errors.push('Chybí partnerType.');
  if (!Number.isFinite(fitScore)) errors.push('Chybí nebo neplatný fitScore.');
  if (!recommendedOffer) errors.push('Chybí recommendedOffer.');

  if (errors.length) return { ok: false, errors };

  const priority = normalizePriority(o.priority, fitScore);

  return {
    ok: true,
    data: {
      companySummary: companySummary!,
      partnerType: partnerType!,
      fitScore: Math.max(0, Math.min(100, Math.round(fitScore))),
      priority,
      servicesDetected: pickStringArray(o, ['servicesDetected', 'services', 'servicesOffered']),
      locationsDetected: pickStringArray(o, ['locationsDetected', 'serviceArea', 'city']),
      recommendedProducts: pickStringArray(o, ['recommendedProducts', 'xxrealitBenefits']),
      recommendedOffer: recommendedOffer!,
      personalizationPoints: pickStringArray(o, ['personalizationPoints', 'reasons', 'strengths']),
      risks: pickStringArray(o, ['risks', 'weaknesses']),
      missingInformation: pickStringArray(o, ['missingInformation']),
      recommendedTone: pickString(o, ['recommendedTone', 'tone']) ?? 'PROFESSIONAL',
      recommendedNextStep: pickString(o, ['recommendedNextStep', 'aiRecommendation']) ?? 'Připravit nabídku',
    },
  };
}

function pickString(o: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function pickStringArray(o: Record<string, unknown>, keys: string[]): string[] {
  for (const k of keys) {
    const v = o[k];
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
    if (typeof v === 'string' && v.trim()) return [v.trim()];
  }
  return [];
}

function normalizePriority(raw: unknown, fitScore: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (raw === 'HIGH' || fitScore >= 80) return 'HIGH';
  if (raw === 'LOW' || fitScore < 30) return 'LOW';
  return 'MEDIUM';
}
