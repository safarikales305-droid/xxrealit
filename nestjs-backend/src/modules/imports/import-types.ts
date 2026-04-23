import type { ListingImportMethod, ListingImportPortal } from '@prisma/client';

export type ImportedListingDraft = {
  externalId: string;
  title: string;
  description: string;
  /** null = cena neuvedena (žádný fallback 1 Kč) */
  price: number | null;
  city: string;
  address?: string;
  images: string[];
  videoUrl?: string | null;
  offerType?: string;
  propertyType?: string;
  sourceUrl?: string;
  attributes?: Record<string, unknown>;
  /** Z detail stránky (mapuje se na Property.region / district / …). */
  region?: string;
  district?: string;
  area?: number | null;
  floor?: number | null;
  totalFloors?: number | null;
  condition?: string | null;
  ownership?: string | null;
  /** Z detailu inzerátu (Reality.cz apod.) — mapuje se na Property.contactPhone / contactEmail. */
  contactPhone?: string;
  contactEmail?: string;
  /** Jméno makléře / RK z detailu — Property.contactName. */
  contactName?: string;
  /** Název realitní kanceláře z detailu (uloží se spolu s jménem jako „jméno · kancelář“ v contactName). */
  contactCompany?: string;
  /** Debug: kolik nevalidních kontakt tokenů (icon/svg/url) parser odfiltroval. */
  invalidContactTokensFiltered?: number;
};

/** Syrový input ze scraperu/API parseru – může být nekompletní. */
export type RawImportedListing = {
  externalId?: unknown;
  /** Syrové id z JSON/HTML (číselné nebo řetězec) — nepoužívat bez validace kódu Reality.cz. */
  id?: unknown;
  listingId?: unknown;
  title?: unknown;
  description?: unknown;
  price?: unknown;
  city?: unknown;
  address?: unknown;
  images?: unknown;
  videoUrl?: unknown;
  offerType?: unknown;
  propertyType?: unknown;
  sourceUrl?: unknown;
  attributes?: unknown;
};

/** Kategorie chyby u jednoho inzerátu (admin diagnostika). */
export type ImportErrorCategory =
  | 'FETCH_ERROR'
  | 'DETAIL_PARSE_ERROR'
  | 'IMAGE_DOWNLOAD_ERROR'
  | 'IMAGE_SAVE_ERROR'
  | 'DB_SCHEMA_MISMATCH'
  | 'BROKER_SAVE_ERROR'
  | 'PROPERTY_SAVE_ERROR'
  | 'DB_VALIDATION_ERROR'
  | 'DB_CONSTRAINT_ERROR'
  | 'WATERMARK_ERROR'
  | 'CONTACT_PARSE_ERROR'
  | 'UNKNOWN';

/** Jedna položka chybového logu importu (JSON pro admin / ImportLog). */
export type ImportRunItemError = {
  at: string;
  externalId: string;
  sourceUrl?: string | null;
  title?: string | null;
  price?: number | null;
  imagesCount?: number;
  contactEmail?: string | null;
  contactPhone?: string | null;
  saveStatus: 'failed' | 'skipped_invalid' | 'skipped_disabled' | 'skipped_duplicate';
  category: ImportErrorCategory;
  message: string;
  stack?: string;
};

export type ImportRunResult = {
  importedNew: number;
  importedUpdated: number;
  skipped: number;
  /** Řádky, které nešlo uložit kvůli výjimce (odlišné od „přeskočeno“ bez chyby). */
  failed?: number;
  /** Neplatný řádek (chybí ID/URL apod.). */
  skippedInvalid?: number;
  disabled: number;
  errors: string[];
  /** Strukturovaný log posledních chyb (max. cca 200 položek na běh). */
  itemErrors?: ImportRunItemError[];
  /** Varování (např. prázdný výsledek, nejspíš špatná URL stránky). */
  warnings?: string[];
  /** Krátká zpráva pro admin UI. */
  summary?: string | null;
  /** Metriky běhu (scraping, normalizace). */
  stats?: {
    startUrl?: string;
    finalUrl?: string;
    rawCandidates?: number;
    normalizedValid?: number;
    parseMethod?: string;
    requestLog?: unknown;
    listPage429Count?: number;
    detailPage429Count?: number;
    detailFetchesAttempted?: number;
    detailFetchesCompleted?: number;
    /** Počet stažených výpisových stránek (paginace Reality.cz atd.). */
    listingPagesFetched?: number;
    /** Stručný log stránek výpisu (diagnostika scraperu). */
    listingPaginationLog?: unknown;
    scraperSettings?: unknown;
    /** Počet záznamů aktualizovaných zápisem z fáze B (detaily) do DB. */
    detailPhaseDbUpdates?: number;
    /** Počet chyb při zápisu detailů do DB. */
    detailPhaseDbErrors?: number;
    /** Počet nalezených řádků ve výpisu před zápisem (po scraperu). */
    totalFound?: number;
    /** Úspěšně zrcadlené fotky z portálu během běhu. */
    imagesMirrored?: number;
    /** Nově vytvořené záznamy ImportedBrokerContact. */
    brokersCreated?: number;
    /** Aktualizované existující kontakty makléřů. */
    brokersUpdated?: number;
    /** Délka běhu importu v ms (od startu runWithLogging do výsledku). */
    durationMs?: number;
    /** Počet deaktivovaných dříve importovaných inzerátů, které už nejsou ve výpisu. */
    deactivated?: number;
    /** Alias pro admin report: počet stažených/zrcadlených obrázků během běhu. */
    imagesDownloaded?: number;
    /** Počet URL fotek nalezených ve scrapovaných detailech. */
    imagesDiscovered?: number;
    /** Počet validních URL po filtraci parseru (bez icon/svg/placeholder). */
    validImagesAfterFilter?: number;
    /** Počet fotek skutečně uložených k inzerátům. */
    imagesSaved?: number;
    /** První validní URL fotky nalezená parserem (diagnostika). */
    firstImageUrl?: string | null;
    /** První skutečně uložená URL ve storage (diagnostika). */
    firstStoredUrl?: string | null;
    /** Počet inzerátů s nenulovým jménem kontaktu po parseru. */
    contactNameParsed?: number;
    /** Počet inzerátů s nenulovým e-mailem po parseru. */
    contactEmailParsed?: number;
    /** Počet inzerátů s nenulovým telefonem po parseru. */
    contactPhoneParsed?: number;
    /** Kolik kontakt tokenů parser zahodil jako technické assety/URL. */
    invalidContactTokensFiltered?: number;
    /** Počet inzerátů, kde zápis PropertyMedia selhal (inzerát mohl být uložen bez řádků médií). */
    mediaPersistFailures?: number;
    importFailed?: number;
    importSkippedInvalid?: number;
  };
};

export type ImportExecutionContext = {
  portal: ListingImportPortal;
  method: ListingImportMethod;
  sourceId: string;
  sourceName: string;
  limitPerRun: number;
  endpointUrl?: string | null;
  credentialsJson?: Record<string, unknown> | null;
  settingsJson?: Record<string, unknown> | null;
  /** Metadata větve importu (pro zápis na Property + budoucí portály). */
  portalKey?: string;
  portalLabel?: string;
  categoryKey?: string;
  categoryLabel?: string;
  actorId?: string | null;
  actorTaskId?: string | null;
  datasetId?: string | null;
  startUrl?: string | null;
  sourcePortal?: string | null;
  notes?: string | null;
};

export type ImportRunPhase = 'listing' | 'details' | 'done' | 'error';

/** Průběh importu (NDJSON stream / admin UI + in-memory stav větve). */
export type ImportRunProgressPayload = {
  percent: number;
  message: string;
  phase: ImportRunPhase;
  totalListings: number;
  processedListings: number;
  totalDetails: number;
  processedDetails: number;
  savedCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  failedCount?: number;
  /** Poslední zpracovaná URL inzerátu (diagnostika zaseknutí). */
  lastProcessedSourceUrl?: string | null;
  lastItemErrorMessage?: string | null;
  lastItemErrorCategory?: ImportErrorCategory | null;
  lastItemErrorExternalId?: string | null;
  /** Posledních N položek chyb pro rychlý náhled v adminu. */
  itemErrorLog?: ImportRunItemError[];
  /** Stejné jako `percent` — pro kompatibilitu se specifikací admin API. */
  progressPercent: number;
  currentMessage: string;
};

/** In-memory stav běžícího importu (Map v ImportSyncService). */
export type ImportRunLiveState = ImportRunProgressPayload & {
  running: boolean;
  startedAt: string;
};

export type ImportSourceBranchRow = {
  id: string;
  portal: ListingImportPortal;
  method: ListingImportMethod;
  name: string;
  portalKey: string;
  portalLabel: string;
  categoryKey: string;
  categoryLabel: string;
  listingType?: string | null;
  propertyType?: string | null;
  sortOrder: number;
  enabled: boolean;
  intervalMinutes: number;
  limitPerRun: number;
  endpointUrl?: string | null;
  actorId?: string | null;
  actorTaskId?: string | null;
  datasetId?: string | null;
  startUrl?: string | null;
  sourcePortal?: string | null;
  notes?: string | null;
  isActive?: boolean;
  lastRunId?: string | null;
  lastDatasetId?: string | null;
  lastProcessedUrl?: string | null;
  lastError?: string | null;
  credentialsJson?: Record<string, unknown> | null;
  settingsJson?: Record<string, unknown> | null;
  lastRunAt?: Date | null;
  lastStatus?: string | null;
  createdAt: Date;
  updatedAt: Date;
  latestLog?: {
    id: string;
    status: string;
    importedNew: number;
    importedUpdated: number;
    skipped: number;
    disabled: number;
    error?: string | null;
    createdAt: Date;
  } | null;
  running?: {
    running: boolean;
    percent: number;
    message: string;
    startedAt?: string;
    phase?: ImportRunPhase;
    totalListings?: number;
    processedListings?: number;
    totalDetails?: number;
    processedDetails?: number;
    savedCount?: number;
    updatedCount?: number;
    skippedCount?: number;
    errorCount?: number;
    failedCount?: number;
    lastProcessedSourceUrl?: string | null;
    lastItemErrorMessage?: string | null;
    lastItemErrorCategory?: ImportErrorCategory | null;
    lastItemErrorExternalId?: string | null;
    itemErrorLog?: ImportRunItemError[];
    progressPercent?: number;
    currentMessage?: string;
  };
};

export type PortalImportAggregate = {
  portalKey: string;
  portalLabel: string;
  branchesTotal: number;
  branchesEnabled: number;
  branchesRunning: number;
  branchesError: number;
  totalNew: number;
  totalUpdated: number;
};

