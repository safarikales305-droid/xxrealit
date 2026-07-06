import {
  REQUIRED_MARKETING_ADS_SCOPES,
} from './meta-connect.constants';

export function parseMarketingGrantedScopes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
}

export function hasMarketingAdsScopes(scopes: readonly string[]): boolean {
  return REQUIRED_MARKETING_ADS_SCOPES.every((scope) => scopes.includes(scope));
}

export function isMarketingAdsTokenActive(row: {
  marketingAccessTokenEncrypted?: string | null;
  marketingGrantedScopes?: unknown;
  marketingTokenExpiresAt?: Date | null;
}): boolean {
  if (!row.marketingAccessTokenEncrypted) return false;
  if (row.marketingTokenExpiresAt && row.marketingTokenExpiresAt.getTime() < Date.now()) {
    return false;
  }
  return hasMarketingAdsScopes(parseMarketingGrantedScopes(row.marketingGrantedScopes));
}
