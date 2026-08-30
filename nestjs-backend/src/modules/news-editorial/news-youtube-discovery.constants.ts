/** Vyhledávací dotazy pro AI discovery podle slug kategorie zdroje. */
export const YOUTUBE_DISCOVERY_QUERIES: Record<string, string[]> = {
  makleri: ['realitní makléř', 'prodej nemovitostí', 'realitní tipy', 'prodej domu', 'prodej bytu'],
  'realitni-kancelare': ['realitní kancelář', 'realitní agentura', 'prodej nemovitostí česko'],
  'developerske-projekty': ['developerský projekt', 'novostavba byt', 'rezidenční projekt'],
  'stavebni-firmy': ['stavba domu', 'stavební firma', 'rekonstrukce domu', 'zateplení', 'dřevostavby'],
  remeslnici: ['řemeslník rekonstrukce', 'instalatér', 'elektrikář bydlení', 'malíř pokoj'],
  architektura: ['architekt dům', 'návrh domu', 'architektura bydlení'],
  interiery: ['interiér bytu', 'design interiéru', 'zařízení bytu'],
  rekonstrukce: ['rekonstrukce bytu', 'rekonstrukce domu', 'přestavba bytu'],
  'hypoteky-finance': ['hypotéka', 'úrokové sazby hypotéky', 'financování bydlení'],
  investice: ['investice do nemovitostí', 'pronájem bytu', 'realitní investice'],
  'pravo-legislativa': ['realitní právo', 'kupní smlouva nemovitost', 'legislativa bydlení'],
  bydleni: ['bydlení tipy', 'první byt', 'nájem vs koupě'],
  'ubytovani-cestovani': ['ubytování airbnb', 'rekreační pronájem', 'apartmán pronájem'],
  'technologie-pro-reality': ['proptech', 'technologie reality', 'digitalizace realit'],
  ostatni: ['realitní trh česko', 'ceny nemovitostí', 'novinky reality'],
};

export const YOUTUBE_DISCOVERY_SETTINGS_KEY = 'youtube_discovery_settings';

export type YoutubeDiscoverySettings = {
  enabled: boolean;
  frequency: 'daily' | 'three_per_week' | 'weekly';
  maxSuggestionsPerCategory: number;
  minRelevanceScore: number;
  lastRunAt: string | null;
};

export const DEFAULT_YOUTUBE_DISCOVERY_SETTINGS: YoutubeDiscoverySettings = {
  enabled: false,
  frequency: 'weekly',
  maxSuggestionsPerCategory: 5,
  minRelevanceScore: 70,
  lastRunAt: null,
};
