export type PropertyTransactionType = 'sale' | 'rent';

export type ParsedPropertySearchCriteria = {
  transaction?: PropertyTransactionType;
  propertyType?: string;
  propertyTypeKey?: string;
  location?: string;
  locationSlug?: string;
  radiusKm?: number;
  priceMin?: number;
  priceMax?: number;
  dispositionMin?: string;
  areaMin?: number;
  garden?: boolean;
  condition?: string[];
  rawQuery?: string;
};

export type SeoPageSearchContext = {
  intentSlug: string;
  locationSlug: string;
  locationName: string;
  intentLabel: string;
  path: string;
  transaction: PropertyTransactionType;
  propertyTypeKey?: string;
  propertyTypeLabel?: string;
};

export type PropertySearchResult = {
  id: string;
  source: string;
  sourceType: 'XXREALIT' | 'EXTERNAL_SEARCH' | 'PARTNER_FEED';
  sourceUrl: string;
  canonicalUrl: string;
  title: string;
  propertyType?: string;
  transactionType?: PropertyTransactionType;
  price?: number | null;
  currency: string;
  location?: string;
  addressText?: string;
  latitude?: number | null;
  longitude?: number | null;
  area?: number | null;
  landArea?: number | null;
  disposition?: string | null;
  condition?: string | null;
  descriptionSnippet?: string;
  imageUrl?: string | null;
  imageUsageAllowed: boolean;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  contactDisplayAllowed: boolean;
  publishedAt?: string | null;
  discoveredAt: string;
  lastVerifiedAt?: string | null;
  isInternal: boolean;
  isExternal: boolean;
  matchScore: number;
  matchReasons: string[];
  expired?: boolean;
};

export type PropertySearchResponse = {
  sessionId: string;
  criteria: ParsedPropertySearchCriteria;
  criteriaSummary: string[];
  results: PropertySearchResult[];
  internalCount: number;
  externalCount: number;
  clarifyingQuestion?: string;
  expandSuggestions?: Array<{ id: string; label: string; patch: Partial<ParsedPropertySearchCriteria> }>;
  externalDiscoveryConfigured: boolean;
  message?: string;
};

export type AiPropertyFinderPublicConfig = {
  enabled: boolean;
  popupDelaySec: number;
  popupScrollPercent: number;
  popupOnInteraction: boolean;
  popupAsCtaOnly: boolean;
};

export const DEFAULT_AI_PROPERTY_FINDER_SETTINGS = {
  enabled: true,
  popupDelaySec: 8,
  popupScrollPercent: 30,
  popupOnInteraction: true,
  popupAsCtaOnly: false,
  externalDiscoveryEnabled: true,
  cacheTtlMinutes: 20,
  minMatchScore: 40,
};
