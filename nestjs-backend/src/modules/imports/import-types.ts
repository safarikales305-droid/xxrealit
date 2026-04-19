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

export type ImportRunResult = {
  importedNew: number;
  importedUpdated: number;
  skipped: number;
  disabled: number;
  errors: string[];
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

