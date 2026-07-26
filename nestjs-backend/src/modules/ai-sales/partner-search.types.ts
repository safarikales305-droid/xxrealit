import { AiSalesPartnerType } from '@prisma/client';

export type PartnerSearchSource =
  | 'INTERNAL_DATABASE'
  | 'MANUAL_CONTACTS'
  | 'CSV_IMPORT'
  | 'APPROVED_WEB_PROVIDER'
  | 'APPROVED_CATALOG';

export type PartnerSearchInput = {
  partnerType?: AiSalesPartnerType;
  region?: string;
  district?: string;
  city?: string;
  keywords?: string[];
  specialization?: string;
  sources: PartnerSearchSource[];
  limit: number;
};

export type PartnerSearchResultItem = {
  temporaryId: string;
  partnerType: AiSalesPartnerType;
  companyName: string;
  contactName: string | null;
  publicEmail: string | null;
  publicPhone: string | null;
  website: string | null;
  city: string | null;
  region: string | null;
  specialization: string[];
  source: string;
  sourceUrl: string | null;
  relevanceReason: string | null;
  verified: boolean;
  duplicate: boolean;
  doNotContact: boolean;
  rawData?: Record<string, unknown>;
};

export interface PartnerSearchProvider {
  getName(): string;
  getSourceKey(): PartnerSearchSource;
  isConfigured(): boolean;
  search(input: PartnerSearchInput): Promise<PartnerSearchResultItem[]>;
}
