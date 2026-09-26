import type { ParsedPropertySearchCriteria, PropertySearchResult } from '../ai-property-finder.types';

export type PropertyDiscoverySearchInput = {
  criteria: ParsedPropertySearchCriteria;
  limit?: number;
};

export interface PropertyDiscoveryProvider {
  readonly name: string;
  readonly sourceType: PropertySearchResult['sourceType'];
  isConfigured(): boolean;
  search(input: PropertyDiscoverySearchInput): Promise<Omit<PropertySearchResult, 'matchScore' | 'matchReasons'>[]>;
}
