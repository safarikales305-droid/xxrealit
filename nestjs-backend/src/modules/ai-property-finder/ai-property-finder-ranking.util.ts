import type { ParsedPropertySearchCriteria, PropertySearchResult } from './ai-property-finder.types';

function clampScore(v: number): number {
  return Math.min(100, Math.max(0, Math.round(v)));
}

export function rankPropertyResult(
  row: Omit<PropertySearchResult, 'matchScore' | 'matchReasons'>,
  criteria: ParsedPropertySearchCriteria,
): { matchScore: number; matchReasons: string[] } {
  let score = 55;
  const reasons: string[] = [];

  if (row.isInternal) {
    score += 12;
    reasons.push('nabídka XXREALIT');
  }

  if (criteria.priceMax != null && row.price != null && row.price > 0) {
    if (row.price <= criteria.priceMax) {
      score += 15;
      reasons.push('cena odpovídá');
    } else {
      const over = (row.price - criteria.priceMax) / criteria.priceMax;
      score -= Math.min(25, Math.round(over * 40));
    }
  }

  if (criteria.location && row.location) {
    const loc = row.location.toLowerCase();
    const want = criteria.location.toLowerCase();
    if (loc.includes(want) || want.includes(loc)) {
      score += 12;
      reasons.push('lokalita odpovídá');
    }
  }

  if (criteria.propertyTypeKey && row.propertyType) {
    const pt = row.propertyType.toLowerCase();
    const key = criteria.propertyTypeKey.toLowerCase();
    if (pt.includes(key) || key.includes('dum') && pt.includes('dům')) {
      score += 8;
    }
  }

  if (criteria.dispositionMin && row.disposition) {
    if (row.disposition.toLowerCase().includes(criteria.dispositionMin.toLowerCase())) {
      score += 6;
      reasons.push('dispozice');
    }
  }

  if (criteria.garden && row.descriptionSnippet?.toLowerCase().includes('zahrad')) {
    score += 8;
    reasons.push('zahrada');
  }

  if (criteria.areaMin && row.area != null && row.area >= criteria.areaMin) {
    score += 6;
    reasons.push('požadovaná velikost');
  }

  if (row.imageUrl && row.imageUsageAllowed) {
    score += 2;
  }

  return { matchScore: clampScore(score), matchReasons: reasons.slice(0, 4) };
}

export function applyRanking(
  rows: Omit<PropertySearchResult, 'matchScore' | 'matchReasons'>[],
  criteria: ParsedPropertySearchCriteria,
  minScore: number,
): PropertySearchResult[] {
  return rows
    .map((row) => {
      const { matchScore, matchReasons } = rankPropertyResult(row, criteria);
      return { ...row, matchScore, matchReasons };
    })
    .filter((r) => r.matchScore >= minScore)
    .sort((a, b) => b.matchScore - a.matchScore);
}
