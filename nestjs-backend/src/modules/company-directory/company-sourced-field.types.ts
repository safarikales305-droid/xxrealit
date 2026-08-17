export type SourcedField<T = string> = {
  value: T;
  sourceUrl?: string | null;
  sourceType?: string | null;
  confidence?: number | null;
  lastVerifiedAt?: string | null;
};

export type CompanyEnrichmentPayload = {
  services?: SourcedField[];
  specializations?: SourcedField[];
  products?: SourcedField[];
  serviceAreas?: SourcedField[];
  certifications?: SourcedField[];
  brands?: SourcedField[];
  keywords?: SourcedField[];
  socialLinks?: SourcedField[];
  yearsOnMarket?: SourcedField<number>;
  targetCustomers?: SourcedField[];
  phone?: SourcedField | null;
  website?: SourcedField | null;
  email?: SourcedField | null;
};

export function sourced(value: string, sourceUrl: string, confidence = 0.85): SourcedField {
  return {
    value: value.trim(),
    sourceUrl,
    sourceType: 'OFFICIAL_WEBSITE',
    confidence,
    lastVerifiedAt: new Date().toISOString(),
  };
}
