import { getProgrammaticSeoIntent } from '../seo/programmatic-seo-intents';
import type { ParsedPropertySearchCriteria, SeoPageSearchContext } from './ai-property-finder.types';

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  dum: 'dům',
  byt: 'byt',
  pozemek: 'pozemek',
  chata_chalupa: 'chalupa',
  garaz: 'garáž',
};

export function buildSeoPageSearchContext(input: {
  intentSlug: string;
  locationSlug: string;
  locationName: string;
  intentLabel: string;
  path: string;
}): SeoPageSearchContext | null {
  const intent = getProgrammaticSeoIntent(input.intentSlug);
  if (!intent || intent.isBrokerPage) return null;
  return {
    intentSlug: input.intentSlug,
    locationSlug: input.locationSlug,
    locationName: input.locationName,
    intentLabel: input.intentLabel,
    path: input.path,
    transaction: intent.offerType === 'pronajem' ? 'rent' : 'sale',
    propertyTypeKey: intent.propertyTypeKey,
    propertyTypeLabel: intent.propertyTypeKey
      ? PROPERTY_TYPE_LABELS[intent.propertyTypeKey] ?? intent.propertyTypeKey
      : undefined,
  };
}

export function mergeSeoContextIntoCriteria(
  seo: SeoPageSearchContext | null | undefined,
  criteria: ParsedPropertySearchCriteria,
): ParsedPropertySearchCriteria {
  if (!seo) return criteria;
  return {
    ...criteria,
    transaction: criteria.transaction ?? seo.transaction,
    propertyTypeKey: criteria.propertyTypeKey ?? seo.propertyTypeKey,
    propertyType: criteria.propertyType ?? seo.propertyTypeLabel,
    location: criteria.location ?? seo.locationName,
    locationSlug: criteria.locationSlug ?? seo.locationSlug,
  };
}

export function buildContextualPrompt(seo: SeoPageSearchContext | null): string | null {
  if (!seo) return null;
  const type = seo.propertyTypeLabel ?? 'nemovitost';
  const tx = seo.transaction === 'rent' ? 'pronájem' : 'prodej';
  return `Hledáte ${type} — ${tx} v ${seo.locationName}?`;
}

export function criteriaSummaryLines(criteria: ParsedPropertySearchCriteria): string[] {
  const lines: string[] = [];
  if (criteria.propertyType || criteria.propertyTypeKey) {
    lines.push(criteria.propertyType ?? criteria.propertyTypeKey ?? 'Nemovitost');
  }
  if (criteria.location) {
    lines.push(
      criteria.radiusKm && criteria.radiusKm > 0
        ? `${criteria.location} + ${criteria.radiusKm} km`
        : criteria.location,
    );
  }
  if (criteria.priceMax != null) {
    lines.push(`do ${new Intl.NumberFormat('cs-CZ').format(criteria.priceMax)} Kč`);
  } else if (criteria.priceMin != null) {
    lines.push(`od ${new Intl.NumberFormat('cs-CZ').format(criteria.priceMin)} Kč`);
  }
  if (criteria.dispositionMin) lines.push(criteria.dispositionMin);
  if (criteria.garden) lines.push('zahrada');
  if (criteria.areaMin) lines.push(`min. ${criteria.areaMin} m²`);
  return lines;
}
