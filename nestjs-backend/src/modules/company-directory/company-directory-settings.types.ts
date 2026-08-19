export type CompanyDirectorySeoSettings = {
  aiEnrichmentEnabled: boolean;
  enrichAfterWebsiteFound: boolean;
  minScoreForIndex: number;
  refreshDays: number;
  addSeoReadyToSitemap: boolean;
  noindexWeakProfiles: boolean;
  generateJsonLd: boolean;
};

export type CompanyDirectoryFacebookSettings = {
  autoPublishNewCompanies: boolean;
  postsPerDay: number;
  publishFromHour: number;
  publishToHour: number;
  onlyEnrichedCompanies: boolean;
  useProfileAsCta: boolean;
  headlineTemplate: string;
  textTemplate: string;
  ctaLabel: string;
};

export type CompanyDirectoryEmailCampaignSettings = {
  enrollOnContactFound: boolean;
  notifyOnNewReview: boolean;
  notifyReviewAuthor: boolean;
  notifyOnProfileInterest: boolean;
  profileViewThrottleDays: number;
  sequenceDelaysDays: number[];
  monthlyAfterSequence: boolean;
};

export type CompanyDirectoryAresImportSettings = {
  batchSize: number;
  delayMs: number;
  maxRetries: number;
  concurrency: number;
  autoContinue: boolean;
  saveCheckpoint: boolean;
  autoRecoverOnRestart: boolean;
  maintainRegistry: boolean;
  maintainInterval: 'daily' | 'weekly' | 'manual';
};

export type CompanyDirectoryAutomationSettings = {
  seo: CompanyDirectorySeoSettings;
  facebook: CompanyDirectoryFacebookSettings;
  email: CompanyDirectoryEmailCampaignSettings;
  aresImport: CompanyDirectoryAresImportSettings;
};

export const DEFAULT_COMPANY_DIRECTORY_SEO_SETTINGS: CompanyDirectorySeoSettings = {
  aiEnrichmentEnabled: true,
  enrichAfterWebsiteFound: true,
  minScoreForIndex: 60,
  refreshDays: 90,
  addSeoReadyToSitemap: true,
  noindexWeakProfiles: true,
  generateJsonLd: true,
};

export const DEFAULT_COMPANY_DIRECTORY_FACEBOOK_SETTINGS: CompanyDirectoryFacebookSettings = {
  autoPublishNewCompanies: true,
  postsPerDay: 5,
  publishFromHour: 9,
  publishToHour: 20,
  onlyEnrichedCompanies: true,
  useProfileAsCta: true,
  headlineTemplate: 'Nová firma na XXREALIT',
  textTemplate:
    '{{variantIntro}}\n\n🏢 {{companyName}}\n📍 {{city}}\n🛠 {{category}}\n\n{{shortDescription}}\n\nPodívejte se na profil firmy na XXREALIT.',
  ctaLabel: 'Zobrazit profil firmy',
};

export const DEFAULT_COMPANY_DIRECTORY_EMAIL_SETTINGS: CompanyDirectoryEmailCampaignSettings = {
  enrollOnContactFound: true,
  notifyOnNewReview: true,
  notifyReviewAuthor: true,
  notifyOnProfileInterest: true,
  profileViewThrottleDays: 7,
  sequenceDelaysDays: [0, 7, 14, 21, 28],
  monthlyAfterSequence: true,
};

export const DEFAULT_COMPANY_DIRECTORY_ARES_IMPORT_SETTINGS: CompanyDirectoryAresImportSettings = {
  batchSize: 500,
  delayMs: 2000,
  maxRetries: 5,
  concurrency: 1,
  autoContinue: true,
  saveCheckpoint: true,
  autoRecoverOnRestart: true,
  maintainRegistry: false,
  maintainInterval: 'weekly',
};

export const DEFAULT_COMPANY_DIRECTORY_AUTOMATION_SETTINGS: CompanyDirectoryAutomationSettings = {
  seo: DEFAULT_COMPANY_DIRECTORY_SEO_SETTINGS,
  facebook: DEFAULT_COMPANY_DIRECTORY_FACEBOOK_SETTINGS,
  email: DEFAULT_COMPANY_DIRECTORY_EMAIL_SETTINGS,
  aresImport: DEFAULT_COMPANY_DIRECTORY_ARES_IMPORT_SETTINGS,
};

export const FACEBOOK_POSTS_PER_DAY_MIN = 2;
export const FACEBOOK_POSTS_PER_DAY_MAX = 20;
