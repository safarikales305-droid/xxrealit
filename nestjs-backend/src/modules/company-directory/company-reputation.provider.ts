import type { GoogleMatchInput } from './company-google-match.util';

export type CompanyReputationSnapshot = {
  placeId?: string | null;
  displayName?: string | null;
  rating?: number | null;
  userRatingCount?: number | null;
  googleMapsUri?: string | null;
  reviews?: Array<Record<string, unknown>>;
  matchConfidence?: 'HIGH' | 'MEDIUM' | 'LOW' | null;
};

export interface CompanyReputationProvider {
  readonly providerId: string;
  isEnabled(): boolean;
  matchPlace(input: GoogleMatchInput): Promise<CompanyReputationSnapshot | null>;
  fetchReputation(placeId: string): Promise<CompanyReputationSnapshot | null>;
}

export const COMPANY_REPUTATION_PROVIDER = Symbol('COMPANY_REPUTATION_PROVIDER');
