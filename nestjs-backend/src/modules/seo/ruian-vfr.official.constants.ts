/**
 * Oficiální veřejné endpointy ČÚZK / RÚIAN (bez API klíče).
 * @see https://cuzk.gov.cz/ruian/Poskytovani-udaju-ISUI-RUIAN-VDP/Vymenny-format-RUIAN-(VFR)
 */

/** Měsíční stavové soubory VFR od srpna 2015 */
export const RUIAN_VFR_MONTHLY_BASE_URL = 'https://services.cuzk.gov.cz/vfr';

/** ATOM feed denních změn — kompletní datová sada */
export const RUIAN_VFR_DAILY_ATOM_URL = 'https://atom.cuzk.gov.cz/RUIAN-S-K-Z/RUIAN-S-K-Z.xml';

/** VDP vyhledávání VFR souborů */
export const RUIAN_VDP_VFR_SEARCH_URL = 'https://vdp.cuzk.cz/vdp/ruian/vymennyformat/vyhledej';

/** Volitelné CSV adres po obcích */
export const RUIAN_VDP_CSV_BASE_URL = 'https://vdp.cuzk.cz/vymenny_format/csv/';

/**
 * Veřejná mapová REST služba ČÚZK (diagnostika / náhled, ne hromadný import).
 * @see https://ags.cuzk.cz/arcgis/rest/services/RUIAN/
 */
export const RUIAN_MAP_REST_BASE_URL =
  'https://ags.cuzk.cz/arcgis/rest/services/RUIAN/MapServer';

/** Stavový soubor státu — hierarchie krajů, okresů, obcí, částí, katastrů */
export const RUIAN_VFR_STATE_FILE_TOKEN = 'ST_UKSG';

/** Denní změnový soubor */
export const RUIAN_VFR_DELTA_FILE_TOKEN = 'ST_ZZSG';

export const RUIAN_VFR_ELEMENT_KIND_MAP: Record<string, string> = {
  Vusc: 'KRAJ',
  Kraj: 'KRAJ',
  Okres: 'OKRES',
  Orp: 'ORP',
  POU: 'ORP',
  Obec: 'OBEC',
  CastObce: 'CAST_OBCE',
  Momc: 'MESTSKA_CAST',
  MestskaCast: 'MESTSKA_CAST',
  KatastralniUzemi: 'KATASTR',
  Ulice: 'LOKALITA',
  AdresniMisto: 'LOKALITA',
};

export type RuianVfrConnectorConfig = {
  mode: 'full' | 'delta';
  lastAvailableFile?: string | null;
  lastImportedFile?: string | null;
  lastImportedVersion?: string | null;
  progressPct?: number;
  checkpoint?: {
    phase?: string;
    recordsProcessed?: number;
    filePath?: string;
  } | null;
  stats?: {
    kraje?: number;
    okresy?: number;
    orp?: number;
    obce?: number;
    castiObci?: number;
    mestskeCasti?: number;
    katastry?: number;
    ulice?: number;
    adresniMista?: number;
  };
  lastAvailableUrl?: string | null;
  pendingDeltaFile?: string | null;
  pendingDeltaMeta?: {
    url: string;
    filename: string;
    version: string;
    publishedAt?: string;
  } | null;
  lastFullSyncAt?: string | null;
};

export type CsuDataStatConnectorConfig = {
  baseUrl: string;
  catalogUrl: string;
  /** Předdefinovaný výběr — obce a počet obyvatel (lze přepsat po zjištění z katalogu) */
  predefinedVyberCode: string;
  datasetCode: string;
  lastDatasetVersion?: string | null;
  updatedMunicipalities?: number;
};

export const CSU_DATASTAT_DEFAULTS: CsuDataStatConnectorConfig = {
  baseUrl: 'https://data.csu.gov.cz/api/dotaz/v1',
  catalogUrl: 'https://data.csu.gov.cz/api/katalog/v1',
  /** Produkt Obyvatelstvo - stav a věková struktura (nástupce Počet obyvatel v obcích) */
  datasetCode: 'OBY01',
  predefinedVyberCode: 'OBY01T1',
};
