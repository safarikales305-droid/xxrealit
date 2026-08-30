import {
  YOUTUBE_DISCOVERY_QUERY_BANK,
  pickDiscoveryQueries,
} from './news-youtube-discovery-queries';

/** @deprecated use YOUTUBE_DISCOVERY_QUERY_BANK */
export const YOUTUBE_DISCOVERY_QUERIES = YOUTUBE_DISCOVERY_QUERY_BANK;

export { YOUTUBE_DISCOVERY_QUERY_BANK, pickDiscoveryQueries };

export const YOUTUBE_DISCOVERY_SETTINGS_KEY = 'youtube_discovery_settings';

export type YoutubeDiscoverySettings = {
  enabled: boolean;
  frequency: 'daily' | 'three_per_week' | 'weekly';
  maxSuggestionsPerCategory: number;
  minRelevanceScore: number;
  maxPagesPerQuery: number;
  maxResultsPerPage: number;
  maxCandidatesPerRun: number;
  maxQueriesPerCategoryPerRun: number;
  maxSearchRequestsPerRun: number;
  lastRunAt: string | null;
  queryRotationIndex: number;
  categoriesPerScheduledRun: number;
};

export const DEFAULT_YOUTUBE_DISCOVERY_SETTINGS: YoutubeDiscoverySettings = {
  enabled: false,
  frequency: 'weekly',
  maxSuggestionsPerCategory: 20,
  minRelevanceScore: 55,
  maxPagesPerQuery: 2,
  maxResultsPerPage: 25,
  maxCandidatesPerRun: 100,
  maxQueriesPerCategoryPerRun: 8,
  maxSearchRequestsPerRun: 120,
  lastRunAt: null,
  queryRotationIndex: 0,
  categoriesPerScheduledRun: 0,
};

export type YoutubeDiscoveryRunDiagnostics = {
  queriesExecuted: number;
  rawResults: number;
  uniqueChannelIds: number;
  existingSources: number;
  existingCandidates: number;
  rejectedByRelevance: number;
  duplicates: number;
  newCandidates: number;
  errors: number;
  searchRequests: number;
  pendingInDb: number;
};
