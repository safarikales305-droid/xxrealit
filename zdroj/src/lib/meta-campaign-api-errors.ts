const META_CAMPAIGN_FIELD_LABELS: Record<string, string> = {
  name: 'Název kampaně',
  objective: 'Cíl kampaně',
  cityName: 'Město',
  radiusKm: 'Okruh',
  dailyBudgetCzk: 'Denní rozpočet',
  selectedProductIds: 'Vybrané nemovitosti',
  startDate: 'Datum spuštění',
  endDate: 'Datum ukončení',
  propertyType: 'Typ nemovitosti',
  creativeType: 'Zdroj kreativy',
  targetingMode: 'Cílení',
  locationTargetingMode: 'Režim lokality',
  audienceId: 'Remarketing publikum',
  creativePayload: 'Kreativa',
  latitude: 'Zeměpisná šířka',
  longitude: 'Zeměpisná délka',
  metaGeoKey: 'Meta Geo ID',
};

function translateFieldToken(token: string): string {
  const cleaned = token.trim();
  if (!cleaned) return cleaned;
  return META_CAMPAIGN_FIELD_LABELS[cleaned] ?? cleaned;
}

function translateValidationLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return trimmed;

  const propertyMatch = /^([a-zA-Z0-9_.]+)\s+(must|should)/i.exec(trimmed);
  if (propertyMatch) {
    const label = translateFieldToken(propertyMatch[1].split('.')[0] ?? propertyMatch[1]);
    const rest = trimmed.slice(propertyMatch[1].length).trim();
    return `${label} ${translateConstraint(rest)}`;
  }

  let out = trimmed;
  for (const [key, label] of Object.entries(META_CAMPAIGN_FIELD_LABELS)) {
    out = out.replace(new RegExp(`\\b${key}\\b`, 'g'), label);
  }
  return out;
}

function translateConstraint(rest: string): string {
  const r = rest.toLowerCase();
  if (r.includes('longer than or equal to 1')) return 'musí být vyplněný';
  if (r.includes('must be a string')) return 'musí být text';
  if (r.includes('must be a number')) return 'musí být číslo';
  if (r.includes('must be an array')) return 'musí být seznam';
  if (r.includes('must be greater than 0')) return 'musí být větší než 0';
  if (r.includes('must not be greater than 80')) return 'nesmí být větší než 80';
  if (r.includes('each value in')) return 'musí obsahovat platné ID';
  return rest;
}

export function translateMetaCampaignApiError(message: string | null | undefined): string {
  if (!message?.trim()) return 'Požadavek selhal.';
  const parts = message
    .split(/[\n,]/)
    .map((part) => translateValidationLine(part))
    .filter(Boolean);
  return parts.length ? parts.join('\n') : message;
}
