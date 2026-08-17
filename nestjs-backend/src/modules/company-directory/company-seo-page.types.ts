import type { CompanyDirectoryCategory } from '@prisma/client';

export type CompanySeoPageContentSection = {
  key: string;
  title: string;
  body?: string;
  items?: string[];
};

export type CompanySeoPageContent = {
  sections: CompanySeoPageContentSection[];
};

export type CompanySeoGenerationFilters = {
  category?: CompanyDirectoryCategory;
  region?: string;
  city?: string;
  seoStatus?: string;
  hasWebsite?: boolean;
  hasEmail?: boolean;
  claimed?: boolean;
  hasReviews?: boolean;
  indexStatus?: string;
  onlyMissing?: boolean;
  onlyOutdated?: boolean;
};

export type CompanySeoGenerationResult =
  | { action: 'created'; seoPageId: string; companyId: string; slug: string }
  | { action: 'updated'; seoPageId: string; companyId: string; slug: string }
  | { action: 'skipped'; companyId: string; reason: string }
  | { action: 'waiting_enrichment'; companyId: string }
  | { action: 'error'; companyId: string; error: string };
