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
  /** Bulk regeneration scope */
  scope?: 'errors' | 'noindex' | 'missing_page' | 'changed' | 'all';
  onlyDirty?: boolean;
  /** Regeneration options */
  regenerateMetadata?: boolean;
  regenerateCanonical?: boolean;
  regenerateStructuredData?: boolean;
  regenerateInternalLinks?: boolean;
  regenerateContent?: boolean;
  regenerateSitemap?: boolean;
  regenerateScore?: boolean;
  regenerateRobots?: boolean;
  skipAi?: boolean;
};

export type CompanySeoDryRunSummary = {
  total: number;
  ok: number;
  badTitle: number;
  missingDescription: number;
  badCanonical: number;
  potentialDuplicates: number;
  noindex: number;
  missingStructuredData: number;
  missingSitemap: number;
  duplicateIco: number;
};

export type CompanySeoRegenerationResult =
  | { action: 'updated'; companyId: string; seoPageId?: string; slug: string; score: number; indexable: boolean }
  | { action: 'unchanged'; companyId: string; slug: string }
  | { action: 'skipped'; companyId: string; reason: string }
  | { action: 'error'; companyId: string; error: string };

export type CompanySeoGenerationResult =
  | { action: 'created'; seoPageId: string; companyId: string; slug: string }
  | { action: 'updated'; seoPageId: string; companyId: string; slug: string }
  | { action: 'skipped'; companyId: string; reason: string }
  | { action: 'waiting_enrichment'; companyId: string }
  | { action: 'error'; companyId: string; error: string };
