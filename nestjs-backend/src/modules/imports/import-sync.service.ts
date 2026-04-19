import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ListingImportMethod,
  ListingImportPortal,
  Prisma,
  Property,
  PropertyShortsSourceType,
} from '@prisma/client';
import {
  computeShortsSourceForImport,
  detectPropertyType,
  portalKeyLabelForEnum,
} from './import-listing-classification';

/** Jen skutečná http(s) videa — relativní cesty z SOAP apod. nesmí vyřadit inzerát z Klasik feedu. */
function normalizeImportVideoUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  if (!/^https?:\/\//i.test(t)) return null;
  return t;
}

/**
 * Reality.cz má často tour / embed odkazy — veřejný „Klasik“ výpis je vždy CLASSIC bez Property.videoUrl.
 */
function resolveImportedListingVideoAndType(
  portal: ListingImportPortal,
  rowVideo: string | null | undefined,
): { videoUrl: string | null; listingType: 'CLASSIC' | 'SHORTS' } {
  if (portal === ListingImportPortal.reality_cz) {
    return { videoUrl: null, listingType: 'CLASSIC' };
  }
  const videoUrl = normalizeImportVideoUrl(rowVideo);
  return {
    videoUrl,
    listingType: videoUrl ? 'SHORTS' : 'CLASSIC',
  };
}

function resolveVideoForImportUpdate(
  portal: ListingImportPortal,
  rowVideo: string | null | undefined,
  existingVideo: string | null | undefined,
): { videoUrl: string | null; listingType: 'CLASSIC' | 'SHORTS' } {
  if (portal === ListingImportPortal.reality_cz) {
    return { videoUrl: null, listingType: 'CLASSIC' };
  }
  if (rowVideo !== undefined) {
    const videoUrl = normalizeImportVideoUrl(rowVideo);
    return { videoUrl, listingType: videoUrl ? 'SHORTS' : 'CLASSIC' };
  }
  const videoUrl = normalizeImportVideoUrl(existingVideo);
  return { videoUrl, listingType: videoUrl ? 'SHORTS' : 'CLASSIC' };
}
import { PrismaService } from '../../database/prisma.service';
import type {
  ImportErrorCategory,
  ImportExecutionContext,
  ImportRunItemError,
  ImportSourceBranchRow,
  ImportedListingDraft,
  ImportRunLiveState,
  ImportRunProgressPayload,
  ImportRunResult,
  PortalImportAggregate,
} from './import-types';
import { resolveRealityListingExternalId } from './reality-listing-code.util';
import { RealityCzSoapImporter } from './reality-cz-soap-importer.service';
import {
  RealityCzScraperImporter,
  type RealityCzScraperFetchOutcome,
} from './reality-cz-scraper-importer.service';
import {
  Century21ScraperImporter,
  isValidCentury21ListingStartUrl,
  type Century21ScraperFetchMeta,
} from './century21-scraper-importer.service';
import { parseRealityCzScraperSettings } from './reality-cz-scraper-settings';
import { normalizeStoredImageUrlList } from './import-image-urls';
import { ImportImageService } from './import-image.service';
import { ListingWatermarkSettingsService } from '../properties/listing-watermark-settings.service';
import { ImportedBrokerContactService } from '../imported-broker-contacts/imported-broker-contact.service';
import {
  DEFAULT_REALITY_BYTY_START_URL,
  getDefaultRealityStartUrlForCategoryKey,
  resolveRealityScraperStartUrlForCategory,
} from './reality-branch-url.util';
const DEFAULT_CATEGORY_KEY = 'ostatni';
const DEFAULT_CATEGORY_LABEL = 'Ostatní';

const MAX_ITEM_ERROR_LOG = 200;
const MAX_ITEM_ERROR_LIVE_TAIL = 40;

function categorizeImportRowError(err: unknown): ImportErrorCategory {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002' || err.code === 'P2003') return 'DB_CONSTRAINT_ERROR';
    return 'DB_VALIDATION_ERROR';
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/watermark|Cloudinary|cloudinary/i.test(msg)) return 'WATERMARK_ERROR';
  if (/fetch|ECONNRESET|ETIMEDOUT|network/i.test(msg)) return 'FETCH_ERROR';
  if (/image|download|sharp|buffer|mime/i.test(msg)) return 'IMAGE_DOWNLOAD_ERROR';
  if (/contact|email|phone/i.test(msg)) return 'CONTACT_PARSE_ERROR';
  return 'UNKNOWN';
}

/** Postgres / Prisma — chybějící sloupec v DB vs. schema (např. starší migrace na Railway). */
function isDbSchemaMismatchMessage(msg: string): boolean {
  return (
    /column .* does not exist/i.test(msg) ||
    /does not exist/i.test(msg) && /column/i.test(msg)
  );
}

function categorizeImportMediaError(err: unknown): ImportErrorCategory {
  const msg = err instanceof Error ? err.message : String(err);
  if (isDbSchemaMismatchMessage(msg)) return 'DB_SCHEMA_MISMATCH';
  return 'IMAGE_SAVE_ERROR';
}

function errStack(err: unknown): string | undefined {
  return err instanceof Error && err.stack ? err.stack.slice(0, 4000) : undefined;
}

type ImportCategoryMeta = {
  categoryKey: string;
  categoryLabel: string;
};

type PortalMeta = {
  portalKey: string;
  portalLabel: string;
};

type ImportSourceCreateInput = {
  portal: ListingImportPortal;
  method: ListingImportMethod;
  name: string;
  portalKey: string;
  portalLabel: string;
  categoryKey: string;
  categoryLabel: string;
  listingType?: string | null;
  propertyType?: string | null;
  endpointUrl?: string | null;
  intervalMinutes?: number;
  limitPerRun?: number;
  enabled?: boolean;
  settingsJson?: Prisma.InputJsonValue | null;
  credentialsJson?: Prisma.InputJsonValue | null;
  sortOrder?: number;
};

function isValidRealityListingUrl(url: string): boolean {
  return /^https?:\/\/(www\.)?reality\.cz\/(prodej|pronajem)\//i.test(url.trim());
}

function normalizeCategoryKey(v: string): string {
  return (v || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || DEFAULT_CATEGORY_KEY;
}

function inferCategoryMetaFromUrl(url?: string | null): ImportCategoryMeta {
  const t = (url ?? '').toLowerCase();
  if (t.includes('/byty/')) return { categoryKey: 'byty', categoryLabel: 'Byty' };
  if (t.includes('/domy/')) return { categoryKey: 'domy', categoryLabel: 'Domy' };
  if (t.includes('/pozemky/')) return { categoryKey: 'pozemky', categoryLabel: 'Pozemky' };
  if (t.includes('/komercni/')) return { categoryKey: 'komercni', categoryLabel: 'Komerční' };
  if (t.includes('/garaze/')) return { categoryKey: 'garaze', categoryLabel: 'Garáže' };
  if (
    t.includes('/chaty/') ||
    t.includes('/chalupy/') ||
    t.includes('/chaty-a-chalupy/')
  ) {
    return { categoryKey: 'chaty-chalupy', categoryLabel: 'Chaty a chalupy' };
  }
  return { categoryKey: DEFAULT_CATEGORY_KEY, categoryLabel: DEFAULT_CATEGORY_LABEL };
}

function portalMetaFor(portal: ListingImportPortal): PortalMeta {
  switch (portal) {
    case ListingImportPortal.reality_cz:
      return { portalKey: 'reality_cz', portalLabel: 'Reality.cz' };
    case ListingImportPortal.century21_cz:
      return { portalKey: 'century21_cz', portalLabel: 'CENTURY 21' };
    case ListingImportPortal.xml_feed:
      return { portalKey: 'xml_feed', portalLabel: 'XML feed' };
    case ListingImportPortal.csv_feed:
      return { portalKey: 'csv_feed', portalLabel: 'CSV' };
    default:
      return { portalKey: 'other', portalLabel: 'Jiný portál' };
  }
}

type ImportSourcePatch = {
  enabled?: boolean;
  intervalMinutes?: number;
  limitPerRun?: number;
  endpointUrl?: string | null;
  portalKey?: string;
  portalLabel?: string;
  categoryKey?: string;
  categoryLabel?: string;
  listingType?: string | null;
  propertyType?: string | null;
  sortOrder?: number;
  credentialsJson?: Prisma.InputJsonValue | null;
  settingsJson?: Prisma.InputJsonValue | null;
};

/** Objekt z DB / DTO → vždy plain object vhodný pro `settingsJson` (Prisma JSON write). */
function asInputJsonObject(value: unknown): Prisma.InputJsonObject {
  if (value != null && typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Prisma.InputJsonObject) };
  }
  return {};
}

function defaultRealityScraperSettingsJson(startUrl: string): Prisma.InputJsonObject {
  return {
    startUrl,
    scraperListOnlyImport: false,
    scraperRequestDelayMs: 900,
    scraperDetailConcurrency: 1,
    scraperDetailRequestGapMs: 550,
    scraperMaxRetries: 6,
    scraperBackoffMultiplier: 2,
    scraperBaseBackoffMsOn429: 12_000,
    scraperMaxListingPages: 120,
    scraperMaxDetailFetchesPerRun: 500,
  };
}

/** Výchozí výpis (Pardubický / domy / prodej) — lze v administraci změnit. */
const DEFAULT_CENTURY21_LISTING_START_URL =
  'https://www.century21.cz/nemovitosti?filter=%7B%22regions%22%3A%5B%22Pardubick%C3%BD%22%5D%2C%22country%22%3A%5B%5D%2C%22county%22%3A%5B%5D%2C%22district%22%3A%5B%5D%2C%22propertyType%22%3A%5B%22HOUSE%22%5D%2C%22listingType%22%3A%22SALE%22%2C%22isAbroad%22%3Afalse%2C%22construction%22%3A%5B%5D%2C%22disposition%22%3A%5B%5D%2C%22condition%22%3A%5B%5D%2C%22ownershipType%22%3A%5B%5D%2C%22energy%22%3A%5B%5D%7D';

function defaultCentury21ScraperSettingsJson(startUrl: string): Prisma.InputJsonObject {
  return {
    startUrl,
    scraperListOnlyImport: false,
    scraperRequestDelayMs: 950,
    scraperDetailConcurrency: 2,
    scraperDetailRequestGapMs: 650,
    scraperMaxRetries: 6,
    scraperBackoffMultiplier: 2,
    scraperBaseBackoffMsOn429: 14_000,
    scraperMaxListingPages: 40,
    scraperMaxDetailFetchesPerRun: 500,
  };
}

function initialImportRunLive(startedAt: string): ImportRunLiveState {
  return {
    running: true,
    startedAt,
    percent: 0,
    message: 'Spouštím…',
    phase: 'listing',
    totalListings: 0,
    processedListings: 0,
    totalDetails: 0,
    processedDetails: 0,
    savedCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    failedCount: 0,
    lastProcessedSourceUrl: null,
    lastItemErrorMessage: null,
    lastItemErrorCategory: null,
    lastItemErrorExternalId: null,
    itemErrorLog: [],
    progressPercent: 0,
    currentMessage: 'Spouštím…',
  };
}

@Injectable()
export class ImportSyncService {
  private readonly logger = new Logger(ImportSyncService.name);
  private readonly runningBySource = new Map<string, ImportRunLiveState>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly soapImporter: RealityCzSoapImporter,
    private readonly scraperImporter: RealityCzScraperImporter,
    private readonly century21ScraperImporter: Century21ScraperImporter,
    private readonly importImageService: ImportImageService,
    private readonly watermarkSettings: ListingWatermarkSettingsService,
    private readonly importedBrokerContacts: ImportedBrokerContactService,
  ) {}

  async ensureDefaultSources() {
    await this.backfillImportSourceMetadata();
    await this.ensureDefaultSource({
      portal: ListingImportPortal.reality_cz,
      method: ListingImportMethod.soap,
      name: 'Reality.cz SOAP',
      portalKey: 'reality_cz',
      portalLabel: 'Reality.cz',
      categoryKey: 'soap-main',
      categoryLabel: 'SOAP hlavní',
      intervalMinutes: 60,
      limitPerRun: 150,
      enabled: false,
      sortOrder: 10,
    });
    await this.ensureDefaultSource({
      portal: ListingImportPortal.reality_cz,
      method: ListingImportMethod.scraper,
      name: 'Reality.cz Scraper / Byty',
      portalKey: 'reality_cz',
      portalLabel: 'Reality.cz',
      categoryKey: 'byty',
      categoryLabel: 'Byty',
      endpointUrl: DEFAULT_REALITY_BYTY_START_URL,
      intervalMinutes: 120,
      limitPerRun: 100,
      enabled: false,
      settingsJson: defaultRealityScraperSettingsJson(DEFAULT_REALITY_BYTY_START_URL),
      sortOrder: 10,
    });
    await this.ensureDefaultSource({
      portal: ListingImportPortal.reality_cz,
      method: ListingImportMethod.scraper,
      name: 'Reality.cz Scraper / Domy',
      portalKey: 'reality_cz',
      portalLabel: 'Reality.cz',
      categoryKey: 'domy',
      categoryLabel: 'Domy',
      endpointUrl: getDefaultRealityStartUrlForCategoryKey('domy')!,
      intervalMinutes: 120,
      limitPerRun: 100,
      enabled: false,
      settingsJson: defaultRealityScraperSettingsJson(getDefaultRealityStartUrlForCategoryKey('domy')!),
      sortOrder: 11,
    });
    await this.ensureDefaultSource({
      portal: ListingImportPortal.reality_cz,
      method: ListingImportMethod.scraper,
      name: 'Reality.cz Scraper / Pozemky',
      portalKey: 'reality_cz',
      portalLabel: 'Reality.cz',
      categoryKey: 'pozemky',
      categoryLabel: 'Pozemky',
      endpointUrl: getDefaultRealityStartUrlForCategoryKey('pozemky')!,
      intervalMinutes: 120,
      limitPerRun: 100,
      enabled: false,
      settingsJson: defaultRealityScraperSettingsJson(getDefaultRealityStartUrlForCategoryKey('pozemky')!),
      sortOrder: 12,
    });
    await this.ensureDefaultSource({
      portal: ListingImportPortal.reality_cz,
      method: ListingImportMethod.scraper,
      name: 'Reality.cz Scraper / Garáže',
      portalKey: 'reality_cz',
      portalLabel: 'Reality.cz',
      categoryKey: 'garaze',
      categoryLabel: 'Garáže',
      endpointUrl: getDefaultRealityStartUrlForCategoryKey('garaze')!,
      intervalMinutes: 120,
      limitPerRun: 100,
      enabled: false,
      settingsJson: defaultRealityScraperSettingsJson(getDefaultRealityStartUrlForCategoryKey('garaze')!),
      sortOrder: 13,
    });
    await this.ensureDefaultSource({
      portal: ListingImportPortal.reality_cz,
      method: ListingImportMethod.scraper,
      name: 'Reality.cz Scraper / Chaty a chalupy',
      portalKey: 'reality_cz',
      portalLabel: 'Reality.cz',
      categoryKey: 'chaty-chalupy',
      categoryLabel: 'Chaty a chalupy',
      endpointUrl: getDefaultRealityStartUrlForCategoryKey('chaty-chalupy')!,
      intervalMinutes: 120,
      limitPerRun: 100,
      enabled: false,
      settingsJson: defaultRealityScraperSettingsJson(getDefaultRealityStartUrlForCategoryKey('chaty-chalupy')!),
      sortOrder: 14,
    });
    await this.ensureDefaultSource({
      portal: ListingImportPortal.reality_cz,
      method: ListingImportMethod.scraper,
      name: 'Reality.cz Scraper / Komerční',
      portalKey: 'reality_cz',
      portalLabel: 'Reality.cz',
      categoryKey: 'komercni',
      categoryLabel: 'Komerční',
      endpointUrl: getDefaultRealityStartUrlForCategoryKey('komercni')!,
      intervalMinutes: 120,
      limitPerRun: 100,
      enabled: false,
      settingsJson: defaultRealityScraperSettingsJson(getDefaultRealityStartUrlForCategoryKey('komercni')!),
      sortOrder: 15,
    });
    await this.ensureDefaultSource({
      portal: ListingImportPortal.century21_cz,
      method: ListingImportMethod.scraper,
      name: 'CENTURY 21 Scraper / Domy Pardubický',
      portalKey: 'century21_cz',
      portalLabel: 'CENTURY 21',
      categoryKey: 'domy',
      categoryLabel: 'Domy',
      endpointUrl: DEFAULT_CENTURY21_LISTING_START_URL,
      intervalMinutes: 180,
      limitPerRun: 150,
      enabled: false,
      settingsJson: defaultCentury21ScraperSettingsJson(DEFAULT_CENTURY21_LISTING_START_URL),
      sortOrder: 26,
    });
    await this.ensureDefaultSource({
      portal: ListingImportPortal.xml_feed,
      method: ListingImportMethod.xml,
      name: 'XML feed / Obecné',
      portalKey: 'xml_feed',
      portalLabel: 'XML feed',
      categoryKey: 'obecne',
      categoryLabel: 'Obecné',
      intervalMinutes: 120,
      limitPerRun: 200,
      enabled: false,
      sortOrder: 30,
    });
    await this.ensureDefaultSource({
      portal: ListingImportPortal.csv_feed,
      method: ListingImportMethod.csv,
      name: 'CSV / Obecné',
      portalKey: 'csv_feed',
      portalLabel: 'CSV',
      categoryKey: 'obecne',
      categoryLabel: 'Obecné',
      intervalMinutes: 180,
      limitPerRun: 200,
      enabled: false,
      sortOrder: 40,
    });
    await this.backfillImportSourceMetadata();
  }

  private async ensureDefaultSource(input: ImportSourceCreateInput): Promise<void> {
    const existing = await this.prisma.importSource.findFirst({
      where: {
        portalKey: input.portalKey,
        categoryKey: input.categoryKey,
        method: input.method,
      },
      select: { id: true },
    });
    if (existing) return;
    await this.prisma.importSource.create({
      data: {
        portal: input.portal,
        method: input.method,
        name: input.name,
        portalKey: input.portalKey,
        portalLabel: input.portalLabel,
        categoryKey: input.categoryKey,
        categoryLabel: input.categoryLabel,
        sortOrder: input.sortOrder ?? 0,
        enabled: input.enabled ?? false,
        intervalMinutes: input.intervalMinutes ?? 60,
        limitPerRun: input.limitPerRun ?? 100,
        endpointUrl: input.endpointUrl ?? null,
        settingsJson: input.settingsJson ?? Prisma.JsonNull,
        credentialsJson: input.credentialsJson ?? Prisma.JsonNull,
      },
    });
  }

  private async backfillImportSourceMetadata(): Promise<void> {
    const all = await this.prisma.importSource.findMany({
      orderBy: { createdAt: 'asc' },
    });
    for (const s of all) {
      const portalMeta = portalMetaFor(s.portal);
      const settings = asInputJsonObject(s.settingsJson);
      const startUrl =
        typeof settings.startUrl === 'string' && settings.startUrl.trim()
          ? settings.startUrl.trim()
          : s.endpointUrl?.trim() ?? '';
      const inferred = inferCategoryMetaFromUrl(startUrl || s.endpointUrl);
      let categoryKey = normalizeCategoryKey((s as { categoryKey?: string }).categoryKey ?? '');
      let categoryLabel = (s as { categoryLabel?: string }).categoryLabel?.trim() ?? '';
      if (!categoryKey || categoryKey === DEFAULT_CATEGORY_KEY) categoryKey = inferred.categoryKey;
      if (!categoryLabel || categoryLabel === DEFAULT_CATEGORY_LABEL) categoryLabel = inferred.categoryLabel;
      if (s.method === ListingImportMethod.soap && s.portal === ListingImportPortal.reality_cz) {
        categoryKey = 'soap-main';
        categoryLabel = 'SOAP hlavní';
      }
      if (s.method === ListingImportMethod.scraper && s.portal === ListingImportPortal.reality_cz) {
        if (!categoryLabel || categoryLabel === DEFAULT_CATEGORY_LABEL) {
          categoryLabel = inferred.categoryLabel;
        }
        const candidate = isValidRealityListingUrl(startUrl)
          ? startUrl
          : (getDefaultRealityStartUrlForCategoryKey(categoryKey) ?? DEFAULT_REALITY_BYTY_START_URL);
        const aligned = resolveRealityScraperStartUrlForCategory(candidate, categoryKey);
        if (aligned !== candidate) {
          this.logger.warn(
            `Backfill import větev ${s.id} (${categoryKey}): start URL „${candidate.slice(0, 96)}…“ → „${aligned}“.`,
          );
        }
        const settingsWithAligned: Prisma.InputJsonObject = { ...settings, startUrl: aligned };
        await this.prisma.importSource.update({
          where: { id: s.id },
          data: {
            endpointUrl: aligned,
            settingsJson: settingsWithAligned,
            portalKey: portalMeta.portalKey,
            portalLabel: portalMeta.portalLabel,
            categoryKey,
            categoryLabel,
            name: `Reality.cz Scraper / ${categoryLabel}`,
            sortOrder: s.sortOrder || 10,
          },
        });
        continue;
      }
      if (s.method === ListingImportMethod.scraper && s.portal === ListingImportPortal.century21_cz) {
        const candidate = isValidCentury21ListingStartUrl(startUrl)
          ? startUrl
          : DEFAULT_CENTURY21_LISTING_START_URL;
        const settingsWithStart: Prisma.InputJsonObject = {
          ...defaultCentury21ScraperSettingsJson(candidate),
          ...settings,
          startUrl: candidate,
        };
        await this.prisma.importSource.update({
          where: { id: s.id },
          data: {
            endpointUrl: candidate,
            settingsJson: settingsWithStart,
            portalKey: portalMeta.portalKey,
            portalLabel: portalMeta.portalLabel,
            categoryKey: categoryKey || 'domy',
            categoryLabel: categoryLabel || 'Domy',
            name: `CENTURY 21 Scraper / ${categoryLabel || 'Domy'}`,
            sortOrder: s.sortOrder || 26,
          },
        });
        continue;
      }
      await this.prisma.importSource.update({
        where: { id: s.id },
        data: {
          portalKey: portalMeta.portalKey,
          portalLabel: portalMeta.portalLabel,
          categoryKey: categoryKey || DEFAULT_CATEGORY_KEY,
          categoryLabel: categoryLabel || DEFAULT_CATEGORY_LABEL,
          sortOrder: s.sortOrder || (portalMeta.portalKey === 'reality_cz' ? 10 : 40),
        },
      });
    }
  }

  async listSources() {
    await this.ensureDefaultSources();
    const rows = await this.prisma.importSource.findMany({
      orderBy: [
        { portalLabel: 'asc' },
        { sortOrder: 'asc' },
        { categoryLabel: 'asc' },
        { method: 'asc' },
      ],
      include: {
        logs: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    return rows.map((r) => this.toBranchRow(r));
  }

  async listSourcesOverview(filter: {
    portalKey?: string;
    onlyEnabled?: boolean;
    onlyRunning?: boolean;
    onlyError?: boolean;
    search?: string;
  }): Promise<{ portals: PortalImportAggregate[]; branches: ImportSourceBranchRow[] }> {
    const all = await this.listSources();
    const q = (filter.search ?? '').trim().toLowerCase();
    const branches = all.filter((b) => {
      if (filter.portalKey && b.portalKey !== filter.portalKey) return false;
      if (filter.onlyEnabled && !b.enabled) return false;
      if (filter.onlyRunning && !b.running?.running) return false;
      if (filter.onlyError && !(b.lastStatus ?? '').toLowerCase().startsWith('error')) return false;
      if (!q) return true;
      const hay = `${b.portalLabel} ${b.categoryLabel} ${b.name} ${b.endpointUrl ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
    const grouped = new Map<string, PortalImportAggregate>();
    for (const b of branches) {
      const key = b.portalKey;
      const prev =
        grouped.get(key) ??
        ({
          portalKey: b.portalKey,
          portalLabel: b.portalLabel,
          branchesTotal: 0,
          branchesEnabled: 0,
          branchesRunning: 0,
          branchesError: 0,
          totalNew: 0,
          totalUpdated: 0,
        } satisfies PortalImportAggregate);
      prev.branchesTotal += 1;
      if (b.enabled) prev.branchesEnabled += 1;
      if (b.running?.running) prev.branchesRunning += 1;
      if ((b.lastStatus ?? '').toLowerCase().startsWith('error')) prev.branchesError += 1;
      prev.totalNew += b.latestLog?.importedNew ?? 0;
      prev.totalUpdated += b.latestLog?.importedUpdated ?? 0;
      grouped.set(key, prev);
    }
    const portals = [...grouped.values()].sort((a, b) => a.portalLabel.localeCompare(b.portalLabel));
    return { portals, branches };
  }

  private toBranchRow(
    r: Prisma.ImportSourceGetPayload<{ include: { logs: true } }>,
  ): ImportSourceBranchRow {
    const latestLog = Array.isArray(r.logs) && r.logs.length > 0 ? r.logs[0] : null;
    const live = this.runningBySource.get(r.id);
    return {
      id: r.id,
      portal: r.portal,
      method: r.method,
      name: r.name,
      portalKey: r.portalKey,
      portalLabel: r.portalLabel,
      categoryKey: r.categoryKey,
      categoryLabel: r.categoryLabel,
      listingType: r.listingType,
      propertyType: r.propertyType,
      sortOrder: r.sortOrder,
      enabled: r.enabled,
      intervalMinutes: r.intervalMinutes,
      limitPerRun: r.limitPerRun,
      endpointUrl: r.endpointUrl,
      credentialsJson:
        r.credentialsJson && typeof r.credentialsJson === 'object' && !Array.isArray(r.credentialsJson)
          ? (r.credentialsJson as Record<string, unknown>)
          : null,
      settingsJson:
        r.settingsJson && typeof r.settingsJson === 'object' && !Array.isArray(r.settingsJson)
          ? (r.settingsJson as Record<string, unknown>)
          : null,
      lastRunAt: r.lastRunAt,
      lastStatus: r.lastStatus,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      latestLog: latestLog
        ? {
            id: latestLog.id,
            status: latestLog.status,
            importedNew: latestLog.importedNew,
            importedUpdated: latestLog.importedUpdated,
            skipped: latestLog.skipped,
            disabled: latestLog.disabled,
            error: latestLog.error,
            createdAt: latestLog.createdAt,
          }
        : null,
      running: live
        ? {
            running: live.running,
            percent: live.percent,
            message: live.message,
            startedAt: live.startedAt,
            phase: live.phase,
            totalListings: live.totalListings,
            processedListings: live.processedListings,
            totalDetails: live.totalDetails,
            processedDetails: live.processedDetails,
            savedCount: live.savedCount,
            updatedCount: live.updatedCount,
            skippedCount: live.skippedCount,
            errorCount: live.errorCount,
            failedCount: live.failedCount,
            lastProcessedSourceUrl: live.lastProcessedSourceUrl,
            lastItemErrorMessage: live.lastItemErrorMessage,
            lastItemErrorCategory: live.lastItemErrorCategory,
            lastItemErrorExternalId: live.lastItemErrorExternalId,
            itemErrorLog: live.itemErrorLog,
            progressPercent: live.progressPercent,
            currentMessage: live.currentMessage,
          }
        : { running: false, percent: 0, message: '', phase: 'done' as const },
    };
  }

  async createSource(input: ImportSourceCreateInput): Promise<ImportSourceBranchRow> {
    await this.ensureDefaultSources();
    const portalMeta = portalMetaFor(input.portal);
    const inferred = inferCategoryMetaFromUrl(input.endpointUrl);
    const categoryKey = normalizeCategoryKey(input.categoryKey || inferred.categoryKey);
    const categoryLabel = input.categoryLabel?.trim() || inferred.categoryLabel;
    const existing = await this.prisma.importSource.findFirst({
      where: { portalKey: portalMeta.portalKey, categoryKey, method: input.method },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException('Větev pro tento portál/kategorii/metodu už existuje.');
    }
    let settings: Prisma.InputJsonObject = asInputJsonObject(input.settingsJson);
    if (
      input.method === ListingImportMethod.scraper &&
      input.portal === ListingImportPortal.reality_cz
    ) {
      const candidate = isValidRealityListingUrl(input.endpointUrl ?? '')
        ? (input.endpointUrl ?? '').trim()
        : (getDefaultRealityStartUrlForCategoryKey(categoryKey) ?? DEFAULT_REALITY_BYTY_START_URL);
      const aligned = resolveRealityScraperStartUrlForCategory(candidate, categoryKey);
      settings = {
        ...defaultRealityScraperSettingsJson(aligned),
        ...settings,
        startUrl: aligned,
      };
      input.endpointUrl = aligned;
    }
    if (
      input.method === ListingImportMethod.scraper &&
      input.portal === ListingImportPortal.century21_cz
    ) {
      const candidate = (input.endpointUrl ?? '').trim();
      if (!isValidCentury21ListingStartUrl(candidate)) {
        throw new BadRequestException(
          'Start URL scraperu musí být výpisová URL CENTURY 21 (např. https://www.century21.cz/nemovitosti?filter=...).',
        );
      }
      settings = {
        ...defaultCentury21ScraperSettingsJson(candidate),
        ...settings,
        startUrl: candidate,
      };
      input.endpointUrl = candidate;
    }
    const created = await this.prisma.importSource.create({
      data: {
        portal: input.portal,
        method: input.method,
        name:
          input.name?.trim() ||
          `${portalMeta.portalLabel} ${input.method.toUpperCase()} / ${categoryLabel}`,
        portalKey: portalMeta.portalKey,
        portalLabel: portalMeta.portalLabel,
        categoryKey,
        categoryLabel,
        listingType: input.listingType ?? null,
        propertyType: input.propertyType ?? null,
        sortOrder: input.sortOrder ?? 50,
        enabled: input.enabled ?? false,
        intervalMinutes: Math.max(1, Math.trunc(input.intervalMinutes ?? 120)),
        limitPerRun: Math.max(1, Math.trunc(input.limitPerRun ?? 100)),
        endpointUrl: input.endpointUrl?.trim() || null,
        settingsJson: settings,
        credentialsJson: input.credentialsJson ?? Prisma.JsonNull,
      },
      include: { logs: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    return this.toBranchRow(created);
  }

  async deleteSource(sourceId: string): Promise<{ ok: true; id: string }> {
    const existing = await this.prisma.importSource.findUnique({ where: { id: sourceId }, select: { id: true } });
    if (!existing) throw new NotFoundException('Import source nenalezen');
    await this.prisma.importSource.delete({ where: { id: sourceId } });
    this.runningBySource.delete(sourceId);
    return { ok: true, id: sourceId };
  }

  async updateSource(sourceId: string, patch: ImportSourcePatch) {
    const current = await this.prisma.importSource.findUnique({ where: { id: sourceId } });
    if (!current) throw new NotFoundException('Import source nenalezen');
    const data: Prisma.ImportSourceUpdateInput = {};
    if (typeof patch.enabled === 'boolean') data.enabled = patch.enabled;
    if (typeof patch.intervalMinutes === 'number') data.intervalMinutes = Math.max(1, Math.trunc(patch.intervalMinutes));
    if (typeof patch.limitPerRun === 'number') data.limitPerRun = Math.max(1, Math.trunc(patch.limitPerRun));
    if (typeof patch.sortOrder === 'number') data.sortOrder = Math.trunc(patch.sortOrder);
    if (patch.portalKey !== undefined) data.portalKey = normalizeCategoryKey(patch.portalKey);
    if (patch.portalLabel !== undefined) data.portalLabel = patch.portalLabel.trim() || current.portalLabel;
    if (patch.categoryKey !== undefined) data.categoryKey = normalizeCategoryKey(patch.categoryKey);
    if (patch.categoryLabel !== undefined) data.categoryLabel = patch.categoryLabel.trim() || current.categoryLabel;
    if (patch.listingType !== undefined) data.listingType = patch.listingType;
    if (patch.propertyType !== undefined) data.propertyType = patch.propertyType;
    const isRealitySoap =
      current.portal === ListingImportPortal.reality_cz &&
      current.method === ListingImportMethod.soap;
    const isRealityScraper =
      current.portal === ListingImportPortal.reality_cz &&
      current.method === ListingImportMethod.scraper;
    const isCentury21Scraper =
      current.portal === ListingImportPortal.century21_cz &&
      current.method === ListingImportMethod.scraper;
    if (patch.endpointUrl !== undefined && !isRealitySoap) {
      data.endpointUrl = patch.endpointUrl ? patch.endpointUrl.trim() : null;
    }
    if (patch.credentialsJson !== undefined) {
      data.credentialsJson = patch.credentialsJson ?? Prisma.JsonNull;
    }
    if (patch.settingsJson !== undefined) {
      data.settingsJson = patch.settingsJson ?? Prisma.JsonNull;
    }
    if (isRealityScraper) {
      const currentSettings = asInputJsonObject(current.settingsJson);
      const patchSettings = asInputJsonObject(patch.settingsJson);
      const startFromPatch =
        typeof patchSettings.startUrl === 'string' ? patchSettings.startUrl.trim() : '';
      const startFromEndpoint =
        patch.endpointUrl !== undefined ? (patch.endpointUrl?.trim() ?? '') : '';
      const startFromCurrent =
        typeof currentSettings.startUrl === 'string' ? currentSettings.startUrl.trim() : '';
      const startFromCurrentEndpoint = current.endpointUrl?.trim() ?? '';
      const resolvedStart =
        startFromPatch ||
        startFromEndpoint ||
        startFromCurrent ||
        startFromCurrentEndpoint ||
        '';
      if (!isValidRealityListingUrl(resolvedStart)) {
        throw new BadRequestException(
          'Start URL scraperu musí být validní listing URL Reality.cz (např. https://www.reality.cz/prodej/byty/?strana=1).',
        );
      }
      const mergedCategoryKey = normalizeCategoryKey(
        (patch.categoryKey !== undefined ? String(patch.categoryKey) : current.categoryKey) ?? '',
      );
      const aligned = resolveRealityScraperStartUrlForCategory(resolvedStart, mergedCategoryKey);
      if (aligned !== resolvedStart) {
        this.logger.warn(
          `Import větev ${sourceId} (${mergedCategoryKey}): start URL sjednocena na „${aligned}“ (dříve „${resolvedStart.slice(0, 120)}…“).`,
        );
      }
      const nextSettings: Prisma.InputJsonObject = {
        ...currentSettings,
        ...patchSettings,
        startUrl: aligned,
      };
      data.settingsJson = nextSettings;
      data.endpointUrl = aligned;
    }
    if (isCentury21Scraper) {
      const currentSettings = asInputJsonObject(current.settingsJson);
      const patchSettings = asInputJsonObject(patch.settingsJson);
      const startFromPatch =
        typeof patchSettings.startUrl === 'string' ? patchSettings.startUrl.trim() : '';
      const startFromEndpoint =
        patch.endpointUrl !== undefined ? (patch.endpointUrl?.trim() ?? '') : '';
      const startFromCurrent =
        typeof currentSettings.startUrl === 'string' ? currentSettings.startUrl.trim() : '';
      const startFromCurrentEndpoint = current.endpointUrl?.trim() ?? '';
      const resolvedStart =
        startFromPatch || startFromEndpoint || startFromCurrent || startFromCurrentEndpoint || '';
      if (!isValidCentury21ListingStartUrl(resolvedStart)) {
        throw new BadRequestException(
          'Start URL scraperu musí být výpisová URL CENTURY 21 (stránka /nemovitosti), ne detail inzerátu.',
        );
      }
      const nextSettings: Prisma.InputJsonObject = {
        ...defaultCentury21ScraperSettingsJson(resolvedStart),
        ...currentSettings,
        ...patchSettings,
        startUrl: resolvedStart,
      };
      data.settingsJson = nextSettings;
      data.endpointUrl = resolvedStart;
    }
    if (data.portalLabel || data.categoryLabel) {
      const portalLabel = (data.portalLabel as string | undefined) ?? current.portalLabel;
      const categoryLabel = (data.categoryLabel as string | undefined) ?? current.categoryLabel;
      data.name = `${portalLabel} ${current.method.toUpperCase()} / ${categoryLabel}`;
    }
    return this.prisma.importSource.update({ where: { id: sourceId }, data });
  }

  async listLogs(filter?: { sourceId?: string; portalKey?: string; categoryKey?: string }) {
    const where: Prisma.ImportLogWhereInput = {};
    if (filter?.sourceId) where.sourceId = filter.sourceId;
    if (filter?.portalKey || filter?.categoryKey) {
      where.source = {
        ...(filter.portalKey ? { portalKey: filter.portalKey } : {}),
        ...(filter.categoryKey ? { categoryKey: filter.categoryKey } : {}),
      };
    }
    return this.prisma.importLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 120,
      include: { source: true },
    });
  }

  async runSource(
    sourceId: string,
    actorUserId: string,
    onProgress?: (e: ImportRunProgressPayload) => void,
  ): Promise<ImportRunResult> {
    await this.ensureDefaultSources();
    const source = await this.prisma.importSource.findUnique({ where: { id: sourceId } });
    if (!source) throw new NotFoundException('Import source nenalezen');
    const ctx: ImportExecutionContext = {
      sourceId: source.id,
      sourceName: source.name,
      portal: source.portal,
      method: source.method,
      limitPerRun: source.limitPerRun,
      endpointUrl: source.endpointUrl,
      credentialsJson: (source.credentialsJson as Record<string, unknown> | null) ?? null,
      settingsJson: (source.settingsJson as Record<string, unknown> | null) ?? null,
      portalKey: source.portalKey?.trim() || undefined,
      portalLabel: source.portalLabel?.trim() || undefined,
      categoryKey: source.categoryKey?.trim() || undefined,
      categoryLabel: source.categoryLabel?.trim() || undefined,
    };
    const settingsKeys =
      ctx.settingsJson && typeof ctx.settingsJson === 'object' && !Array.isArray(ctx.settingsJson)
        ? Object.keys(ctx.settingsJson as Record<string, unknown>).sort().join(',')
        : '';
    const scraperStartHint =
      ctx.method === ListingImportMethod.scraper
        ? ((typeof ctx.settingsJson?.startUrl === 'string' ? ctx.settingsJson.startUrl.trim() : '') ||
            ctx.endpointUrl?.trim() ||
            '(nenastaveno)')
        : null;
    this.logger.log(
      `Import RUN: sourceId=${ctx.sourceId} name=${ctx.sourceName} portal=${ctx.portal} method=${ctx.method} ` +
        `limit=${ctx.limitPerRun} endpointUrl=${ctx.endpointUrl ?? 'null'} ` +
        `scraperStartHint=${scraperStartHint ?? 'n/a'} settingsKeys=[${settingsKeys}] ` +
        `(SOAP používá REALITY_CZ_* env, scraper start URL = settingsJson.startUrl)`,
    );
    this.runningBySource.set(ctx.sourceId, initialImportRunLive(new Date().toISOString()));
    return this.runWithLogging(ctx, actorUserId, onProgress);
  }

  async runPortal(
    portalKey: string,
    actorUserId: string,
    onBranchProgress?: (e: { sourceId: string; percent: number; message: string }) => void,
  ): Promise<Array<{ sourceId: string; ok: boolean; error?: string }>> {
    await this.ensureDefaultSources();
    const rows = await this.prisma.importSource.findMany({
      where: { portalKey },
      orderBy: [{ sortOrder: 'asc' }, { categoryLabel: 'asc' }],
      select: { id: true },
    });
    const out: Array<{ sourceId: string; ok: boolean; error?: string }> = [];
    for (const r of rows) {
      try {
        await this.runSource(r.id, actorUserId, (p) => {
          onBranchProgress?.({ sourceId: r.id, percent: p.percent, message: p.message });
        });
        out.push({ sourceId: r.id, ok: true });
      } catch (e) {
        out.push({
          sourceId: r.id,
          ok: false,
          error: e instanceof Error ? e.message : 'Neznámá chyba',
        });
      }
    }
    return out;
  }

  async bulkDisableByFilter(filter: { portal?: ListingImportPortal; method?: ListingImportMethod }) {
    const where: Prisma.PropertyWhereInput = {
      importSource: filter.portal ?? undefined,
      importMethod: filter.method ?? undefined,
    };
    const updated = await this.prisma.property.updateMany({
      where,
      data: { isActive: false, importDisabled: true },
    });
    return { affected: updated.count };
  }

  private async runWithLogging(
    ctx: ImportExecutionContext,
    actorUserId: string,
    onProgress?: (e: ImportRunProgressPayload) => void,
  ): Promise<ImportRunResult> {
    const startedAt = new Date();
    const startedAtIso = startedAt.toISOString();
    let live = initialImportRunLive(startedAtIso);

    const emitProgress = (patch: Partial<ImportRunProgressPayload>) => {
      live = { ...live, ...patch, running: true, startedAt: startedAtIso };
      if (patch.progressPercent !== undefined) live.progressPercent = patch.progressPercent;
      else live.progressPercent = live.percent;
      if (patch.currentMessage !== undefined) live.currentMessage = patch.currentMessage;
      else live.currentMessage = live.message;
      this.runningBySource.set(ctx.sourceId, live);
      onProgress?.({ ...live });
    };

    let result: ImportRunResult | null = null;
    let errorMessage: string | null = null;
    let scraperMeta: RealityCzScraperFetchOutcome['meta'] | Century21ScraperFetchMeta | undefined;
    try {
      emitProgress({
        percent: 1,
        message: `Spouštím import „${ctx.sourceName}“…`,
        phase: 'listing',
      });
      const { rows, scraperMeta: sm } = await this.fetchRows(ctx, (partial) => {
        if (ctx.method === ListingImportMethod.scraper) {
          const p = partial.percent;
          const listingFetchPct =
            p != null ? Math.min(9, Math.max(2, Math.round(Number(p) * 0.12))) : live.percent;
          emitProgress({
            ...partial,
            phase: 'listing',
            percent: listingFetchPct,
            progressPercent: listingFetchPct,
            currentMessage: partial.message ?? live.message,
          });
        } else {
          emitProgress({
            ...partial,
            phase: 'listing',
            percent: partial.percent ?? live.percent,
            progressPercent: partial.percent ?? live.percent,
            currentMessage: partial.message ?? live.message,
          });
        }
      });
      scraperMeta = sm;
      const totalFoundListings = rows.length;
      if (ctx.method === ListingImportMethod.scraper && totalFoundListings === 0) {
        throw new BadRequestException(
          'LIST_PARSE_NO_RESULTS: Parser výpisu nenašel žádné URL inzerátů. Zkontrolujte start URL výpisu a selektory parseru.',
        );
      }
      emitProgress({
        totalListings: rows.length,
        message: `Nalezeno ${rows.length} inzerátů ve výpisu…`,
        percent: 10,
        phase: 'listing',
      });

      const settings = parseRealityCzScraperSettings(ctx.settingsJson);
      let rowsForDb = rows;
      if (
        ctx.method === ListingImportMethod.scraper &&
        !settings.listOnlyImport &&
        settings.maxDetailFetchesPerRun > 0 &&
        rows.length > 0
      ) {
        emitProgress({
          phase: 'details',
          processedDetails: 0,
          percent: 12,
          message: 'Stahuji detail každého inzerátu (fotky, cena, popis)…',
        });
        let plannedDetailSlotsForProgress = 0;
        const enr =
          ctx.portal === ListingImportPortal.century21_cz
            ? await this.century21ScraperImporter.enrichDraftsWithDetailsBatched(rows, settings, {
                onPlanned: (n) => {
                  plannedDetailSlotsForProgress = n;
                  emitProgress({
                    totalDetails: n,
                    phase: 'details',
                    message:
                      n > 0
                        ? `Detaily: až ${n} stránek paralelně, poté zápis do databáze…`
                        : 'Žádné URL detailů — import jen z výpisu.',
                  });
                },
                onTick: (tick) => {
                  const denom = Math.max(1, plannedDetailSlotsForProgress);
                  const frac = Math.min(1, tick.detailFetchesCompleted / denom);
                  emitProgress({
                    phase: 'details',
                    processedDetails: tick.detailFetchesCompleted,
                    percent: 12 + Math.floor(frac * 78),
                    message: tick.message,
                  });
                },
              })
            : await this.scraperImporter.enrichDraftsWithDetailsBatched(rows, settings, {
                onPlanned: (n) => {
                  plannedDetailSlotsForProgress = n;
                  emitProgress({
                    totalDetails: n,
                    phase: 'details',
                    message:
                      n > 0
                        ? `Detaily: až ${n} stránek paralelně, poté zápis do databáze…`
                        : 'Žádné URL detailů — import jen z výpisu.',
                  });
                },
                onTick: (tick) => {
                  const denom = Math.max(1, plannedDetailSlotsForProgress);
                  const frac = Math.min(1, tick.detailFetchesCompleted / denom);
                  emitProgress({
                    phase: 'details',
                    processedDetails: tick.detailFetchesCompleted,
                    percent: 12 + Math.floor(frac * 78),
                    message: tick.message,
                  });
                },
              });
        rowsForDb = enr.rows;
        if (
          ctx.portal === ListingImportPortal.century21_cz &&
          enr.detailFetchesAttempted > 0 &&
          enr.detailFetchesCompleted === 0
        ) {
          throw new BadRequestException(
            'DETAIL_PARSE_FAILED: Detaily se nepodařilo načíst ani jednou. Import byl zastaven, aby neproběhl pseudo-import.',
          );
        }
        if (scraperMeta) {
          scraperMeta = {
            ...scraperMeta,
            detailFetchesAttempted: enr.detailFetchesAttempted,
            detailFetchesCompleted: enr.detailFetchesCompleted,
            detailPage429Count: enr.detailPage429Count,
            requestLog: [...(scraperMeta.requestLog ?? []), ...enr.requestLog],
          };
        }
        emitProgress({
          processedDetails: enr.plannedDetailSlots,
          percent: 92,
          phase: 'listing',
          message: 'Ukládám inzeráty do databáze (po načtení detailů)…',
        });
      } else {
        const skipMsg =
          ctx.method !== ListingImportMethod.scraper
            ? 'Metoda bez HTTP detail scraperu.'
            : settings.listOnlyImport || settings.maxDetailFetchesPerRun <= 0
              ? 'Bez detailů (jen výpis nebo limit detailů 0).'
              : 'Bez fáze detailů.';
        emitProgress({
          phase: 'listing',
          totalDetails: 0,
          processedDetails: 0,
          percent: Math.max(live.percent, 12),
          message: skipMsg,
        });
      }

      result = await this.importListingShells(ctx, actorUserId, rowsForDb, emitProgress);
      let deactivated = 0;
      if (ctx.method === ListingImportMethod.scraper) {
        deactivated = await this.deactivateMissingImportedListings(ctx, rowsForDb);
        if (deactivated > 0) {
          this.logger.log(`Import deactivate sync: source=${ctx.sourceName} deactivated=${deactivated}`);
        }
      }

      const warnings = [...(result.warnings ?? [])];
      if (ctx.method === ListingImportMethod.scraper && scraperMeta) {
        this.logger.log(
          `Scraper metrics: startUrl=${scraperMeta.startUrl} finalUrl=${scraperMeta.finalUrl} listingPages=${scraperMeta.listingPagesFetched ?? 1} raw=${scraperMeta.rawCandidates} valid=${scraperMeta.normalizedValid} parse=${scraperMeta.parseMethod} details=${scraperMeta.detailFetchesCompleted}/${scraperMeta.detailFetchesAttempted} list429=${scraperMeta.listPage429Count} detail429=${scraperMeta.detailPage429Count}`,
        );
        if (scraperMeta.rawCandidates === 0) {
          const msg =
            'Parser nenašel žádné inzeráty na stažené stránce (zkontrolujte, zda start URL vede na výpis nabídek, ne např. jen na titulní stránku).';
          warnings.push(msg);
          this.logger.warn(msg);
        } else if (scraperMeta.normalizedValid === 0) {
          const msg = `Nalezeno ${scraperMeta.rawCandidates} kandidátů z HTML/JSON, ale žádný neprošel validací (chybí titulek, ID nebo platná URL detailu).`;
          warnings.push(msg);
          this.logger.warn(msg);
        }
        const pageHint =
          ctx.portal === ListingImportPortal.reality_cz
            ? this.describeListingPageMismatch(scraperMeta.finalUrl)
            : null;
        if (pageHint) {
          warnings.push(pageHint);
          this.logger.warn(pageHint);
        }
      }
      const summaryParts: string[] = [];
      const failedN = result.failed ?? 0;
      if (result.importedNew || result.importedUpdated) {
        summaryParts.push(
          `nové ${result.importedNew}, aktualizované ${result.importedUpdated}, přeskočeno ${result.skipped}, selhalo ${failedN}, ručně vypnuté ${result.disabled}`,
        );
      } else if (!errorMessage) {
        summaryParts.push(
          `žádné změny v DB (nové 0, aktualizované 0, přeskočeno ${result.skipped}, selhalo ${failedN}, ručně vypnuté ${result.disabled})`,
        );
      }
      if (!errorMessage && result.importedNew === 0 && result.importedUpdated === 0) {
        warnings.push(
          'ZERO_IMPORT_RESULT: Import doběhl bez vytvoření/aktualizace inzerátu. Zkontrolujte výpis, detail parser nebo validaci dat.',
        );
      }
      const mediaPersistN = result.stats?.mediaPersistFailures ?? 0;
      if (!errorMessage && mediaPersistN > 0) {
        warnings.push(
          `MEDIA_PERSIST_ISSUES: Zápis PropertyMedia selhal u ${mediaPersistN} inzerátů (kategorie DB_SCHEMA_MISMATCH / IMAGE_SAVE_ERROR v položkovém logu). Ověřte migrace tabulky PropertyMedia na produkci.`,
        );
      }
      if (warnings.length) {
        summaryParts.push(`Varování: ${warnings.join(' | ')}`);
      }
      result.warnings = warnings;
      result.summary = summaryParts.join('. ') || null;
      const durationMs = Date.now() - startedAt.getTime();
      result.stats = {
        ...(result.stats ?? {}),
        startUrl: scraperMeta?.startUrl,
        finalUrl: scraperMeta?.finalUrl,
        rawCandidates: scraperMeta?.rawCandidates,
        normalizedValid: scraperMeta?.normalizedValid,
        parseMethod: scraperMeta?.parseMethod,
        requestLog: scraperMeta?.requestLog,
        listPage429Count: scraperMeta?.listPage429Count,
        detailPage429Count: scraperMeta?.detailPage429Count,
        detailFetchesAttempted: scraperMeta?.detailFetchesAttempted,
        detailFetchesCompleted: scraperMeta?.detailFetchesCompleted,
        listingPagesFetched: scraperMeta?.listingPagesFetched,
        listingPaginationLog: scraperMeta?.listingPaginationLog,
        scraperSettings: scraperMeta?.settings,
        detailPhaseDbUpdates: result.importedNew + result.importedUpdated,
        detailPhaseDbErrors: result.failed ?? 0,
        totalFound: totalFoundListings,
        durationMs,
        brokersCreated: result.stats?.brokersCreated ?? 0,
        brokersUpdated: result.stats?.brokersUpdated ?? 0,
        imagesMirrored: result.stats?.imagesMirrored ?? 0,
        imagesDownloaded: result.stats?.imagesMirrored ?? 0,
        imagesDiscovered: result.stats?.imagesDiscovered ?? 0,
        imagesSaved: result.stats?.imagesSaved ?? 0,
        mediaPersistFailures: result.stats?.mediaPersistFailures ?? 0,
        deactivated,
      };
      this.logger.log(
        `Import summary: totalFound=${totalFoundListings} processed=${totalFoundListings} new=${result.importedNew} updated=${result.importedUpdated} skipped=${result.skipped} skippedInvalid=${result.skippedInvalid ?? 0} failed=${result.failed ?? 0} errorLines=${result.errors.length} brokersCreated=${result.stats.brokersCreated ?? 0} brokersUpdated=${result.stats.brokersUpdated ?? 0} imagesMirrored=${result.stats.imagesMirrored ?? 0} mediaPersistFailures=${result.stats.mediaPersistFailures ?? 0} durationMs=${durationMs}`,
      );

      const hasProblem =
        warnings.length > 0 && result.importedNew === 0 && result.importedUpdated === 0;
      const mediaIssues = !errorMessage && mediaPersistN > 0;
      await this.prisma.importSource.update({
        where: { id: ctx.sourceId },
        data: {
          lastRunAt: new Date(),
          lastStatus: errorMessage
            ? `error: ${errorMessage}`
            : mediaIssues
              ? `warn: MEDIA_SAVE (${mediaPersistN}× PropertyMedia)`
              : hasProblem
                ? `warn: ${warnings[0]?.slice(0, 240) ?? 'viz log'}`
                : 'ok',
        },
      });
      emitProgress({
        percent: 100,
        message: 'Import dokončen.',
        phase: 'done',
        failedCount: result.failed ?? 0,
        itemErrorLog: result.itemErrors?.slice(-MAX_ITEM_ERROR_LIVE_TAIL) ?? [],
        lastItemErrorMessage: result.itemErrors?.length
          ? result.itemErrors[result.itemErrors.length - 1]?.message ?? null
          : null,
        lastItemErrorCategory: result.itemErrors?.length
          ? result.itemErrors[result.itemErrors.length - 1]?.category ?? null
          : null,
        lastItemErrorExternalId: result.itemErrors?.length
          ? result.itemErrors[result.itemErrors.length - 1]?.externalId ?? null
          : null,
      });
      return result;
    } catch (error: unknown) {
      errorMessage = error instanceof Error ? error.message : 'Neznámá chyba importu';
      if (
        ctx.method === ListingImportMethod.scraper &&
        /429|Too Many Requests/i.test(errorMessage)
      ) {
        const portalLabel = ctx.portal === ListingImportPortal.century21_cz ? 'CENTURY 21' : 'Reality.cz';
        errorMessage = `Web ${portalLabel} blokuje příliš rychlé dotazy (HTTP 429). V administraci Importy zvětšete prodlevu mezi požadavky, snižte počet detailů na běh nebo nechte zapnutý režim „jen výpis“. Technická hláška: ${errorMessage}`;
      }
      this.logger.error(`Import ${ctx.portal}/${ctx.method} failed: ${errorMessage}`);
      emitProgress({
        phase: 'error',
        percent: 0,
        message: `Chyba: ${errorMessage}`,
        progressPercent: 0,
        currentMessage: `Chyba: ${errorMessage}`,
      });
      await this.prisma.importSource.update({
        where: { id: ctx.sourceId },
        data: { lastRunAt: new Date(), lastStatus: `error: ${errorMessage}` },
      });
      throw new BadRequestException(errorMessage);
    } finally {
      const mediaIssuesFin =
        !errorMessage &&
        !!result &&
        (result.stats?.mediaPersistFailures ?? 0) > 0;
      const warnOutcome =
        !errorMessage &&
        !!result &&
        (result.warnings?.length ?? 0) > 0 &&
        result.importedNew === 0 &&
        result.importedUpdated === 0;
      const logStatus =
        errorMessage ? 'error' : mediaIssuesFin || warnOutcome ? 'warn' : 'ok';
      await this.prisma.importLog.create({
        data: {
          sourceId: ctx.sourceId,
          portal: ctx.portal,
          method: ctx.method,
          status: logStatus,
          message: errorMessage
            ? null
            : result?.summary ?? `Import ${ctx.sourceName} dokončen`,
          importedNew: result?.importedNew ?? 0,
          importedUpdated: result?.importedUpdated ?? 0,
          skipped: result?.skipped ?? 0,
          disabled: result?.disabled ?? 0,
          error: errorMessage ?? null,
          payloadJson: {
            startedAt,
            finishedAt: new Date(),
            run: JSON.parse(
              JSON.stringify({
                sourceId: ctx.sourceId,
                sourceName: ctx.sourceName,
                portal: ctx.portal,
                method: ctx.method,
                limitPerRun: ctx.limitPerRun,
                endpointUrl: ctx.endpointUrl ?? null,
                settingsJson: ctx.settingsJson ?? null,
              }),
            ) as Prisma.InputJsonValue,
            errors: result?.errors ?? [],
            warnings: result?.warnings ?? [],
            scraper: scraperMeta
              ? (JSON.parse(JSON.stringify(scraperMeta)) as Prisma.InputJsonValue)
              : null,
            summary: result?.stats
              ? (JSON.parse(JSON.stringify(result.stats)) as Prisma.InputJsonValue)
              : null,
            itemErrors: result?.itemErrors?.length
              ? (JSON.parse(JSON.stringify(result.itemErrors.slice(-80))) as Prisma.InputJsonValue)
              : null,
            failed: result?.failed ?? 0,
            skippedInvalid: result?.skippedInvalid ?? 0,
          },
        },
      });
      const doneLive = this.runningBySource.get(ctx.sourceId) ?? initialImportRunLive(startedAtIso);
      this.runningBySource.set(ctx.sourceId, {
        ...doneLive,
        running: false,
        percent: errorMessage ? 0 : 100,
        message: errorMessage ? `Chyba: ${errorMessage}` : 'Dokončeno',
        startedAt: startedAtIso,
        phase: errorMessage ? 'error' : 'done',
        progressPercent: errorMessage ? 0 : 100,
        currentMessage: errorMessage ? `Chyba: ${errorMessage}` : 'Dokončeno',
      });
    }
  }

  private describeListingPageMismatch(finalUrl: string): string | null {
    try {
      const u = new URL(finalUrl);
      const path = u.pathname.toLowerCase();
      if (!path || path === '/' || path === '') {
        return 'Finální URL vypadá jako titulní stránka, ne výpis inzerátů — použijte URL typu /prodej/byty/ nebo vlastní výpis z Reality.cz.';
      }
      const looksListing =
        path.includes('prodej') ||
        path.includes('pronaj') ||
        path.includes('pronáj') ||
        path.includes('hledani') ||
        path.includes('vyhledavani') ||
        path.includes('search') ||
        path.includes('byty') ||
        path.includes('domy') ||
        path.includes('pozemk') ||
        path.includes('garaz') ||
        path.includes('chat') ||
        path.includes('chalup') ||
        path.includes('komerc');
      if (!looksListing) {
        return `URL „${finalUrl}“ pravděpodobně není stránka se seznamem nabídek (očekávejte cestu s prodej/pronájem nebo typ nemovitosti).`;
      }
    } catch {
      return null;
    }
    return null;
  }

  private resolveRealityCzScraperStartUrl(ctx: ImportExecutionContext): string {
    const fromSettings =
      ctx.settingsJson &&
      typeof ctx.settingsJson.startUrl === 'string' &&
      ctx.settingsJson.startUrl.trim()
        ? ctx.settingsJson.startUrl.trim()
        : '';
    const fromEndpoint = ctx.endpointUrl?.trim() ?? '';
    const candidate = fromSettings || fromEndpoint;
    // eslint-disable-next-line no-console
    console.log('REALITY IMPORT START URL', {
      endpointUrl: fromEndpoint || null,
      settingsJsonStartUrl: fromSettings || null,
      resolvedStartUrl: candidate || null,
    });
    if (!candidate) {
      throw new BadRequestException(
        'Zadejte start URL pro scraper Reality.cz (konkrétní výpis s parametry, např. https://www.reality.cz/prodej/byty/?strana=1).',
      );
    }
    if (!isValidRealityListingUrl(candidate)) {
      throw new BadRequestException(
        'Invalid import URL — Použij konkrétní výpis inzerátů Reality.cz ve tvaru https://www.reality.cz/prodej/... nebo https://www.reality.cz/pronajem/....',
      );
    }
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      throw new BadRequestException(
        `Neplatná start URL pro scraper: „${candidate.slice(0, 200)}“. Zadejte platnou adresu https://…`,
      );
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException('Start URL musí používat protokol http nebo https.');
    }
    if (!parsed.hostname.toLowerCase().endsWith('reality.cz')) {
      this.logger.warn(
        `Scraper start URL hostitel „${parsed.hostname}“ není reality.cz — pokračujeme podle zadání.`,
      );
    }
    if (!this.realityScraperUrlLooksLikeListingPage(parsed.href)) {
      throw new BadRequestException(
        'Invalid import URL — Použij konkrétní výpis inzerátů Reality.cz (např. /prodej/byty/, /prodej/domy/, /pronajem/byty/ nebo výpis s lokalitou).',
      );
    }
    const categoryKey = normalizeCategoryKey(ctx.categoryKey ?? '');
    return resolveRealityScraperStartUrlForCategory(candidate, categoryKey);
  }

  private resolveCentury21ScraperStartUrl(ctx: ImportExecutionContext): string {
    const fromSettings =
      ctx.settingsJson &&
      typeof ctx.settingsJson.startUrl === 'string' &&
      ctx.settingsJson.startUrl.trim()
        ? ctx.settingsJson.startUrl.trim()
        : '';
    const fromEndpoint = ctx.endpointUrl?.trim() ?? '';
    const candidate = fromSettings || fromEndpoint;
    if (!candidate) {
      throw new BadRequestException(
        'Zadejte start URL pro scraper CENTURY 21 (výpis /nemovitosti?filter=...).',
      );
    }
    if (!isValidCentury21ListingStartUrl(candidate)) {
      throw new BadRequestException(
        'Invalid import URL — použijte výpisovou URL CENTURY 21 (/nemovitosti?filter=...), nikoliv detail inzerátu.',
      );
    }
    return candidate;
  }

  /** Povolen je konkrétní výpis (prodej/pronájem/typ nemovitosti/search), root homepage je zakázaná. */
  private realityScraperUrlLooksLikeListingPage(url: string): boolean {
    try {
      const u = new URL(url);
      if (!u.hostname.toLowerCase().endsWith('reality.cz')) return false;
      const path = (u.pathname || '/').toLowerCase().replace(/\/+$/, '') || '/';
      if (path === '/' || path === '') return false;
      if (/strana=/i.test(`${u.pathname}${u.search}`)) return true;
      if (u.searchParams.toString().length > 0) {
        return /(prodej|pronajem|pronaj|hledani|vyhledavani|search|byty|domy|pozemk|garaz|chat|chalup|komerc)/i.test(
          `${path}${u.search}`,
        );
      }
      return /(prodej|pronajem|pronaj|hledani|vyhledavani|search|byty|domy|pozemk|garaz|chat|chalup|komerc)/i.test(
        path,
      );
    } catch {
      const low = url.toLowerCase();
      if (/^https?:\/\/(www\.)?reality\.cz\/?$/i.test(low)) return false;
      return /(prodej|pronajem|pronaj|hledani|vyhledavani|search|byty|domy|pozemk|garaz|chat|chalup|komerc)/i.test(
        low,
      );
    }
  }

  private async fetchRows(
    ctx: ImportExecutionContext,
    onProgress?: (e: Partial<ImportRunProgressPayload>) => void,
  ): Promise<{
    rows: ImportedListingDraft[];
    scraperMeta?: RealityCzScraperFetchOutcome['meta'] | Century21ScraperFetchMeta;
  }> {
    if (ctx.method === ListingImportMethod.soap) {
      if (ctx.portal !== ListingImportPortal.reality_cz) {
        throw new BadRequestException('SOAP je podporovaný jen pro Reality.cz.');
      }
      if (!this.soapImporter.supportsConfiguredRun()) {
        throw new BadRequestException('SOAP není nakonfigurovaný (REALITY_CZ_* env)');
      }
      onProgress?.({ percent: 12, message: 'Stahuji inzeráty přes Reality.cz SOAP…' });
      const rows = await this.soapImporter.fetch(ctx.limitPerRun);
      onProgress?.({ percent: 62, message: `SOAP: načteno ${rows.length} záznamů…` });
      return { rows };
    }
    if (ctx.method === ListingImportMethod.scraper) {
      if (ctx.portal === ListingImportPortal.reality_cz) {
        const startUrl = this.resolveRealityCzScraperStartUrl(ctx);
        this.logger.log(`Reality.cz scraper: používám start URL ${startUrl}`);
        const outcome = await this.scraperImporter.fetch(
          ctx.limitPerRun,
          startUrl,
          ctx.settingsJson,
          onProgress,
        );
        return { rows: outcome.rows, scraperMeta: outcome.meta };
      }
      if (ctx.portal === ListingImportPortal.century21_cz) {
        const startUrl = this.resolveCentury21ScraperStartUrl(ctx);
        this.logger.log(`CENTURY21 scraper: používám start URL ${startUrl}`);
        const outcome = await this.century21ScraperImporter.fetch(
          ctx.limitPerRun,
          startUrl,
          ctx.settingsJson,
          onProgress,
        );
        return { rows: outcome.rows, scraperMeta: outcome.meta };
      }
      throw new BadRequestException(`Portal ${ctx.portal} nemá scraper implementaci.`);
    }
    throw new BadRequestException(`Nepodporovaná metoda importu: ${ctx.method}`);
  }

  private importFacetPayload(
    ctx: ImportExecutionContext,
    row: ImportedListingDraft,
  ) {
    const fallback = portalKeyLabelForEnum(ctx.portal);
    const sourcePortalKey = (ctx.portalKey?.trim() || fallback.sourcePortalKey).slice(0, 64);
    const sourcePortalLabel = (ctx.portalLabel?.trim() || fallback.sourcePortalLabel).slice(
      0,
      120,
    );
    const importCategoryKey = (ctx.categoryKey?.trim() || DEFAULT_CATEGORY_KEY).slice(0, 64);
    const importCategoryLabel = (ctx.categoryLabel?.trim() || DEFAULT_CATEGORY_LABEL).slice(
      0,
      120,
    );
    const categoryHint = [ctx.categoryLabel, row.propertyType].filter(Boolean).join(' ');
    const detected = detectPropertyType({
      title: row.title,
      description: row.description,
      sourceUrl: row.sourceUrl,
      category: categoryHint || null,
    });
    const shorts = computeShortsSourceForImport(ctx.portal, row);
    return {
      sourcePortalKey,
      sourcePortalLabel,
      propertyTypeKey: detected.key,
      propertyTypeLabel: detected.label,
      importCategoryKey,
      importCategoryLabel,
      canGenerateShorts: shorts.canGenerateShorts,
      shortsSourceType: shorts.shortsSourceType,
    };
  }

  private dedupeImportedRows(rows: ImportedListingDraft[]): ImportedListingDraft[] {
    const map = new Map<string, ImportedListingDraft>();
    for (const row of rows) {
      const id =
        (row.externalId ?? '').trim().toUpperCase() ||
        resolveRealityListingExternalId({
          sourceUrl: row.sourceUrl,
          externalId: row.externalId,
        }) ||
        '';
      if (!id) continue;
      const prev = map.get(id);
      if (
        !prev ||
        (row.description?.length ?? 0) > (prev.description?.length ?? 0) ||
        (row.images?.length ?? 0) > (prev.images?.length ?? 0)
      ) {
        map.set(id, { ...row, externalId: id });
      }
    }
    return [...map.values()];
  }

  /** Najde záznam podle (portál + externalId) nebo podle URL u stejného portálu. */
  private async findImportPropertyForPersistence(
    ctx: ImportExecutionContext,
    externalId: string,
    sourceUrl?: string | null,
  ) {
    const eid = externalId.trim().toUpperCase();
    const byKey = await this.prisma.property.findUnique({
      where: {
        importSource_importExternalId: {
          importSource: ctx.portal,
          importExternalId: eid,
        },
      },
    });
    if (byKey) return byKey;
    const u = (sourceUrl ?? '').trim();
    if (!u) return null;
    return this.prisma.property.findFirst({
      where: {
        importSource: ctx.portal,
        importSourceUrl: u,
        importDisabled: false,
      },
    });
  }

  /**
   * Označí dříve importované záznamy jako neaktivní, pokud už se v aktuálním běhu neobjevily.
   * Fyzicky nemažeme, jen synchronizujeme aktivitu vůči aktuálnímu výpisu portálu.
   */
  private async deactivateMissingImportedListings(
    ctx: ImportExecutionContext,
    rows: ImportedListingDraft[],
  ): Promise<number> {
    const seen = rows
      .map((r) => (r.sourceUrl ?? '').trim())
      .filter((u): u is string => !!u);
    if (seen.length === 0) return 0;
    const uniqueSeen = [...new Set(seen)];
    const upd = await this.prisma.property.updateMany({
      where: {
        importSource: ctx.portal,
        importMethod: ctx.method,
        importDisabled: false,
        isActive: true,
        importSourceUrl: { notIn: uniqueSeen },
      },
      data: { isActive: false, lastSyncedAt: new Date() },
    });
    return upd.count;
  }

  /** Bezpečné hodnoty pro Prisma create/update — žádné undefined na povinných polích. */
  private sanitizeImportedListingDraft(
    row: ImportedListingDraft,
    externalId: string,
  ): ImportedListingDraft {
    const eid = externalId.trim().toUpperCase();
    const title =
      String(row.title ?? '')
        .trim()
        .slice(0, 400) || `Inzerát ${eid}`.slice(0, 400);
    const description =
      String(row.description ?? '').trim().slice(0, 60_000) ||
      'Importovaný inzerát — popis doplníme z detailu nebo ručně v administraci.';
    const city = String(row.city ?? '').trim().slice(0, 120) || 'Neuvedeno';
    const address = String(row.address ?? '').trim().slice(0, 500) || city;
    const images = Array.isArray(row.images)
      ? row.images.filter((u): u is string => typeof u === 'string' && u.trim().length > 4)
      : [];
    return {
      ...row,
      externalId: eid,
      title,
      description,
      city,
      address,
      images,
      offerType: String(row.offerType ?? 'prodej').trim().slice(0, 40) || 'prodej',
      propertyType: String(row.propertyType ?? 'byt').trim().slice(0, 40) || 'byt',
      region: String(row.region ?? '').trim().slice(0, 200),
      district: String(row.district ?? '').trim().slice(0, 200),
      contactPhone: String(row.contactPhone ?? '').trim().slice(0, 40),
      contactEmail: String(row.contactEmail ?? '').trim().toLowerCase().slice(0, 120),
    };
  }

  /**
   * Fotky z Reality.cz stáhneme a nahrajeme stejným storage jako uživatelské inzeráty (Cloudinary / lokální uploads).
   */
  private formatImportedContactNameForDb(row: ImportedListingDraft): string | null {
    const name = (row.contactName ?? '').trim();
    const co = (row.contactCompany ?? '').trim();
    if (!name && !co) return null;
    if (name && co) return `${name} · ${co}`.slice(0, 200);
    return (name || co).slice(0, 200);
  }

  private async resolveImportedPropertyImagesForDb(
    ctx: ImportExecutionContext,
    row: ImportedListingDraft,
    externalId: string,
    existingPropertyId: string | null,
    mirrorStats?: { mirroredSuccess?: number },
  ): Promise<Array<{ originalUrl: string; watermarkedUrl: string | null }>> {
    try {
      const normalized = normalizeStoredImageUrlList(row.images);
      if (normalized.length === 0) return [];
      const portalKeyRaw = (ctx.portalKey ?? String(ctx.portal)).trim() || 'import';
      const sourcePortalKey = portalKeyRaw.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 64) || 'import';
      const propertyIdForMirror =
        existingPropertyId ?? `staging-${externalId.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 80)}`;
      return await this.importImageService.mirrorRealityListingImageVariants({
        urls: normalized,
        propertyId: propertyIdForMirror,
        sourcePortalKey,
        stats: mirrorStats,
      });
    } catch (e) {
      this.logger.warn(
        `resolveImportedPropertyImagesForDb failed ext=${externalId}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return [];
    }
  }

  /**
   * Zápis PropertyMedia — plná sada polí dle Prisma; při chybějících sloupcích v DB (mismatch) opakování bez originalUrl/watermarkedUrl.
   */
  private async persistImportedPropertyMediaRows(params: {
    propertyId: string;
    imageVariants: Array<{ originalUrl: string; watermarkedUrl: string | null }>;
    wmSettings: { enabled: boolean };
    replaceExistingImages: boolean;
  }): Promise<
    { ok: true } | { ok: false; category: ImportErrorCategory; message: string }
  > {
    const { propertyId, imageVariants, wmSettings, replaceExistingImages } = params;
    if (imageVariants.length === 0) return { ok: true };

    const pickDisplayUrl = (v: {
      originalUrl: string;
      watermarkedUrl: string | null;
    }): string =>
      wmSettings.enabled && v.watermarkedUrl ? v.watermarkedUrl : v.originalUrl;

    if (replaceExistingImages) {
      await this.prisma.propertyMedia.deleteMany({
        where: { propertyId, type: 'image' },
      });
    }

    const fullData = imageVariants.map((v, idx) => ({
      propertyId,
      url: pickDisplayUrl(v),
      originalUrl: v.originalUrl,
      watermarkedUrl: v.watermarkedUrl ?? null,
      type: 'image' as const,
      sortOrder: idx + 1,
    }));

    try {
      await this.prisma.propertyMedia.createMany({ data: fullData });
      return { ok: true };
    } catch (firstErr: unknown) {
      const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
      if (!isDbSchemaMismatchMessage(msg)) {
        return {
          ok: false,
          category: categorizeImportMediaError(firstErr),
          message: msg,
        };
      }
      try {
        const slimData = imageVariants.map((v, idx) => ({
          propertyId,
          url: pickDisplayUrl(v),
          type: 'image' as const,
          sortOrder: idx + 1,
        }));
        await this.prisma.propertyMedia.createMany({ data: slimData });
        return { ok: true };
      } catch (secondErr: unknown) {
        return {
          ok: false,
          category: categorizeImportMediaError(secondErr),
          message: secondErr instanceof Error ? secondErr.message : String(secondErr),
        };
      }
    }
  }

  private async importListingShells(
    ctx: ImportExecutionContext,
    actorUserId: string,
    rows: ImportedListingDraft[],
    onProgress?: (patch: Partial<ImportRunProgressPayload>) => void,
  ): Promise<ImportRunResult> {
    let importedNew = 0;
    let importedUpdated = 0;
    let skipped = 0;
    let skippedInvalid = 0;
    let failed = 0;
    let disabled = 0;
    const errors: string[] = [];
    const itemErrors: ImportRunItemError[] = [];
    let brokersCreated = 0;
    let brokersUpdated = 0;
    let imagesMirrored = 0;
    let imagesDiscovered = 0;
    let imagesSaved = 0;
    let mediaPersistFailures = 0;

    const pushItemError = (e: ImportRunItemError) => {
      itemErrors.push(e);
      if (itemErrors.length > MAX_ITEM_ERROR_LOG) itemErrors.shift();
      errors.push(`[${e.category}] ${e.externalId}: ${e.message}`);
      const tail = itemErrors.slice(-MAX_ITEM_ERROR_LIVE_TAIL);
      onProgress?.({
        lastProcessedSourceUrl: e.sourceUrl ?? null,
        lastItemErrorMessage: e.message,
        lastItemErrorCategory: e.category,
        lastItemErrorExternalId: e.externalId,
        itemErrorLog: tail,
        errorCount: errors.length,
        failedCount: failed,
        skippedCount: skipped,
      });
    };

    const sliceCap = Math.max(1, Math.min(5000, ctx.limitPerRun));
    const sliced = rows.slice(0, sliceCap);
    const batch = this.dedupeImportedRows(sliced);
    if (sliced.length !== batch.length) {
      // eslint-disable-next-line no-console
      console.log('[IMPORT] internal id-dedupe', {
        before: sliced.length,
        after: batch.length,
        dropped: sliced.length - batch.length,
      });
    }

    onProgress?.({
      percent: 12,
      phase: 'listing',
      totalListings: batch.length,
      processedListings: 0,
      failedCount: 0,
      itemErrorLog: [],
      message: `Ukládám ${batch.length} inzerátů do databáze…`,
    });

    if (ctx.portal === ListingImportPortal.reality_cz) {
      const healed = await this.prisma.property.updateMany({
        where: {
          importSource: ListingImportPortal.reality_cz,
          OR: [{ listingType: { not: 'CLASSIC' } }, { videoUrl: { not: null } }],
        },
        data: { listingType: 'CLASSIC', videoUrl: null },
      });
      if (healed.count > 0) {
        this.logger.log(
          `Reality.cz heal: ${healed.count} importovaných záznamů přepnuto na CLASSIC a videoUrl vymazáno (Klasik feed).`,
        );
      }
    }

    const createdDiagnostics: Array<{
      id: string;
      externalId: string;
      listingType: string;
      approved: boolean;
      isActive: boolean;
      importDisabled: boolean;
    }> = [];

    for (let i = 0; i < batch.length; i += 1) {
      const rowRaw = batch[i]!;
      const resolvedId =
        (rowRaw.externalId ?? '').trim().toUpperCase() ||
        resolveRealityListingExternalId({
          sourceUrl: rowRaw.sourceUrl,
          externalId: rowRaw.externalId,
        }) ||
        '';

      onProgress?.({
        phase: 'listing',
        processedListings: i + 1,
        totalListings: batch.length,
        savedCount: importedNew,
        updatedCount: importedUpdated,
        skippedCount: skipped,
        failedCount: failed,
        errorCount: errors.length,
        percent: 10 + Math.floor((30 * (i + 1)) / Math.max(1, batch.length)),
        message: `Ukládám výpis ${i + 1}/${batch.length}…`,
        lastProcessedSourceUrl: rowRaw.sourceUrl?.trim() ?? null,
      });

      if (!resolvedId) {
        skipped += 1;
        skippedInvalid += 1;
        pushItemError({
          at: new Date().toISOString(),
          externalId: '(empty)',
          sourceUrl: rowRaw.sourceUrl ?? null,
          title: (rowRaw.title as string | null) ?? null,
          price: rowRaw.price ?? null,
          imagesCount: Array.isArray(rowRaw.images) ? rowRaw.images.length : 0,
          contactEmail: rowRaw.contactEmail ?? null,
          contactPhone: rowRaw.contactPhone ?? null,
          saveStatus: 'skipped_invalid',
          category: 'UNKNOWN',
          message: 'Nelze odvodit kód inzerátu (externalId ani kód Reality z URL).',
        });
        this.logger.warn(`[IMPORT] skipped_invalid empty id title=${String(rowRaw.title).slice(0, 80)}`);
        continue;
      }

      const row = this.sanitizeImportedListingDraft(
        { ...rowRaw, externalId: resolvedId },
        resolvedId,
      );
      imagesDiscovered += Array.isArray(row.images) ? row.images.length : 0;
      const hasTitle = row.title.trim().length > 0;
      const hasUrl = Boolean(row.sourceUrl?.trim());
      if (!hasTitle && !hasUrl) {
        skipped += 1;
        skippedInvalid += 1;
        pushItemError({
          at: new Date().toISOString(),
          externalId: resolvedId,
          sourceUrl: row.sourceUrl ?? null,
          title: row.title,
          price: row.price ?? null,
          imagesCount: row.images.length,
          contactEmail: row.contactEmail || null,
          contactPhone: row.contactPhone || null,
          saveStatus: 'skipped_invalid',
          category: 'UNKNOWN',
          message: 'Chybí titul i zdrojová URL — inzerát nelze bezpečně uložit.',
        });
        continue;
      }

      let wmSettings: { enabled: boolean } = { enabled: false };
      try {
        wmSettings = await this.watermarkSettings.getSettings();
      } catch (we) {
        this.logger.warn(
          `[IMPORT] watermark settings fallback: ${we instanceof Error ? we.message : String(we)}`,
        );
      }

      let existing: Awaited<ReturnType<typeof this.prisma.property.findUnique>> = null;
      try {
        existing = await this.findImportPropertyForPersistence(ctx, resolvedId, row.sourceUrl);
      } catch (fe) {
        failed += 1;
        const cat = categorizeImportRowError(fe);
        pushItemError({
          at: new Date().toISOString(),
          externalId: resolvedId,
          sourceUrl: row.sourceUrl ?? null,
          title: row.title,
          price: row.price ?? null,
          imagesCount: row.images.length,
          contactEmail: row.contactEmail || null,
          contactPhone: row.contactPhone || null,
          saveStatus: 'failed',
          category: cat,
          message: fe instanceof Error ? fe.message : String(fe),
          stack: errStack(fe),
        });
        continue;
      }

      const mirrorStats = { mirroredSuccess: 0 };
      let imageVariants: Array<{ originalUrl: string; watermarkedUrl: string | null }> = [];
      try {
        imageVariants = await this.resolveImportedPropertyImagesForDb(
          ctx,
          row,
          resolvedId,
          existing?.id ?? null,
          mirrorStats,
        );
      } catch (imgErr) {
        this.logger.warn(
          `[IMPORT] images ext=${resolvedId}: ${imgErr instanceof Error ? imgErr.message : String(imgErr)}`,
        );
      }
      imagesMirrored += mirrorStats.mirroredSuccess ?? 0;

      const imagesForDb = imageVariants
        .map((v) => (wmSettings.enabled && v.watermarkedUrl ? v.watermarkedUrl : v.originalUrl))
        .filter((u): u is string => typeof u === 'string' && u.trim().length > 0);
      imagesSaved += imagesForDb.length;

      const facet = this.importFacetPayload(ctx, row);

      if (!existing) {
        const { videoUrl, listingType } = resolveImportedListingVideoAndType(ctx.portal, row.videoUrl);
        try {
          const created = await this.prisma.property.create({
            data: {
              userId: actorUserId,
              title: row.title,
              description: row.description,
              price: row.price != null && row.price > 0 ? Math.trunc(row.price) : null,
              city: row.city,
              address: row.address?.trim() || row.city,
              region: row.region?.trim() ?? '',
              district: row.district?.trim() ?? '',
              area: row.area ?? null,
              floor: row.floor ?? null,
              totalFloors: row.totalFloors ?? null,
              condition: row.condition?.trim() || null,
              ownership: row.ownership?.trim() || null,
              currency: 'CZK',
              offerType: row.offerType?.trim() || 'prodej',
              propertyType: row.propertyType?.trim() || 'byt',
              subType: '',
              images: imagesForDb,
              videoUrl,
              contactName: (
                this.formatImportedContactNameForDb(row) ?? 'Reality.cz import'
              ).slice(0, 200),
              contactPhone: (row.contactPhone ?? '').trim().slice(0, 40),
              contactEmail: (row.contactEmail ?? '').trim().toLowerCase().slice(0, 120),
              approved: true,
              status: 'APPROVED',
              isActive: true,
              listingType,
              importSource: ctx.portal,
              importMethod: ctx.method,
              importExternalId: resolvedId,
              importSourceUrl: row.sourceUrl?.trim() || null,
              importedAt: new Date(),
              lastSyncedAt: new Date(),
              importDisabled: false,
              ...facet,
            },
          });
          if (imageVariants.length > 0) {
            const mediaRes = await this.persistImportedPropertyMediaRows({
              propertyId: created.id,
              imageVariants,
              wmSettings,
              replaceExistingImages: false,
            });
            if (!mediaRes.ok) {
              mediaPersistFailures += 1;
              this.logger.warn(
                `[IMPORT] propertyMedia (new) property=${created.id} [${mediaRes.category}]: ${mediaRes.message}`,
              );
              pushItemError({
                at: new Date().toISOString(),
                externalId: resolvedId,
                sourceUrl: row.sourceUrl ?? null,
                title: row.title,
                price: row.price ?? null,
                imagesCount: row.images.length,
                contactEmail: row.contactEmail || null,
                contactPhone: row.contactPhone || null,
                saveStatus: 'failed',
                category: mediaRes.category,
                message: `PropertyMedia (create): ${mediaRes.message}`,
              });
            }
          }
          createdDiagnostics.push({
            id: created.id,
            externalId: resolvedId,
            listingType: created.listingType,
            approved: created.approved,
            isActive: created.isActive,
            importDisabled: created.importDisabled,
          });
          importedNew += 1;
          this.logger.log(`[IMPORT] CREATED ${resolvedId} ${row.title.slice(0, 80)}`);
          try {
            const br = await this.importedBrokerContacts.syncFromImportedProperty(created.id);
            if (br === 'created') brokersCreated += 1;
            else if (br === 'updated') brokersUpdated += 1;
          } catch (brErr) {
            this.logger.warn(
              `[IMPORT] broker sync (ignored) property=${created.id}: ${
                brErr instanceof Error ? brErr.message : String(brErr)
              }`,
            );
          }
        } catch (createErr: unknown) {
          if (
            createErr instanceof Prisma.PrismaClientKnownRequestError &&
            createErr.code === 'P2002'
          ) {
            const again = await this.findImportPropertyForPersistence(ctx, resolvedId, row.sourceUrl);
            if (again && !again.importDisabled) {
              try {
                await this.runImportPropertyUpdateBranch({
                  ctx,
                  row,
                  resolvedId,
                  existing: again,
                  wmSettings,
                  imageVariants,
                  imagesForDb,
                  facet,
                  pushItemError,
                  onMediaPersistFailure: () => {
                    mediaPersistFailures += 1;
                  },
                });
                importedUpdated += 1;
                this.logger.log(`[IMPORT] UPDATED_AFTER_P2002 ${resolvedId}`);
                try {
                  const br = await this.importedBrokerContacts.syncFromImportedProperty(again.id);
                  if (br === 'created') brokersCreated += 1;
                  else if (br === 'updated') brokersUpdated += 1;
                } catch {
                  /* ignore */
                }
              } catch (upErr) {
                failed += 1;
                pushItemError({
                  at: new Date().toISOString(),
                  externalId: resolvedId,
                  sourceUrl: row.sourceUrl ?? null,
                  title: row.title,
                  price: row.price ?? null,
                  imagesCount: row.images.length,
                  contactEmail: row.contactEmail || null,
                  contactPhone: row.contactPhone || null,
                  saveStatus: 'failed',
                  category: categorizeImportRowError(upErr),
                  message: upErr instanceof Error ? upErr.message : String(upErr),
                  stack: errStack(upErr),
                });
              }
            } else {
              failed += 1;
              pushItemError({
                at: new Date().toISOString(),
                externalId: resolvedId,
                sourceUrl: row.sourceUrl ?? null,
                title: row.title,
                price: row.price ?? null,
                imagesCount: row.images.length,
                contactEmail: row.contactEmail || null,
                contactPhone: row.contactPhone || null,
                saveStatus: 'failed',
                category: 'DB_CONSTRAINT_ERROR',
                message: createErr instanceof Error ? createErr.message : String(createErr),
                stack: errStack(createErr),
              });
            }
          } else {
            failed += 1;
            pushItemError({
              at: new Date().toISOString(),
              externalId: resolvedId,
              sourceUrl: row.sourceUrl ?? null,
              title: row.title,
              price: row.price ?? null,
              imagesCount: row.images.length,
              contactEmail: row.contactEmail || null,
              contactPhone: row.contactPhone || null,
              saveStatus: 'failed',
              category: categorizeImportRowError(createErr),
              message: createErr instanceof Error ? createErr.message : String(createErr),
              stack: errStack(createErr),
            });
          }
        }
        continue;
      }

      if (existing.importDisabled) {
        disabled += 1;
        this.logger.log(
          `[IMPORT] SKIPPED_DISABLED ${resolvedId} ${row.title.slice(0, 60)} propertyId=${existing.id}`,
        );
        continue;
      }

      try {
        await this.runImportPropertyUpdateBranch({
          ctx,
          row,
          resolvedId,
          existing,
          wmSettings,
          imageVariants,
          imagesForDb,
          facet,
          pushItemError,
          onMediaPersistFailure: () => {
            mediaPersistFailures += 1;
          },
        });
        importedUpdated += 1;
        this.logger.log(`[IMPORT] UPDATED ${resolvedId} ${row.title.slice(0, 80)}`);
        try {
          const br = await this.importedBrokerContacts.syncFromImportedProperty(existing.id);
          if (br === 'created') brokersCreated += 1;
          else if (br === 'updated') brokersUpdated += 1;
        } catch (brErr) {
          this.logger.warn(
            `[IMPORT] broker sync (ignored) property=${existing.id}: ${
              brErr instanceof Error ? brErr.message : String(brErr)
            }`,
          );
        }
      } catch (upErr: unknown) {
        failed += 1;
        pushItemError({
          at: new Date().toISOString(),
          externalId: resolvedId,
          sourceUrl: row.sourceUrl ?? null,
          title: row.title,
          price: row.price ?? null,
          imagesCount: row.images.length,
          contactEmail: row.contactEmail || null,
          contactPhone: row.contactPhone || null,
          saveStatus: 'failed',
          category: categorizeImportRowError(upErr),
          message: upErr instanceof Error ? upErr.message : String(upErr),
          stack: errStack(upErr),
        });
      }
    }

    if (createdDiagnostics.length > 0) {
      const preview = createdDiagnostics.slice(0, 30);
      this.logger.log(
        `Import: vytvořené listingy (${createdDiagnostics.length}) — ukázka: ${JSON.stringify(preview)}`,
      );
    }

    this.logger.log(
      `[IMPORT] shell done new=${importedNew} updated=${importedUpdated} skipped=${skipped} skippedInvalid=${skippedInvalid} failed=${failed} disabled=${disabled} itemErrors=${itemErrors.length}`,
    );

    return {
      importedNew,
      importedUpdated,
      skipped,
      skippedInvalid,
      failed,
      disabled,
      errors,
      itemErrors,
      stats: {
        brokersCreated,
        brokersUpdated,
        imagesMirrored,
        imagesDownloaded: imagesMirrored,
        imagesDiscovered,
        imagesSaved,
        mediaPersistFailures,
        importFailed: failed,
        importSkippedInvalid: skippedInvalid,
      },
    };
  }

  private async runImportPropertyUpdateBranch(params: {
    ctx: ImportExecutionContext;
    row: ImportedListingDraft;
    resolvedId: string;
    existing: Property;
    wmSettings: { enabled: boolean };
    imageVariants: Array<{ originalUrl: string; watermarkedUrl: string | null }>;
    imagesForDb: string[];
    facet: {
      sourcePortalKey: string;
      sourcePortalLabel: string;
      propertyTypeKey: string;
      propertyTypeLabel: string;
      importCategoryKey: string;
      importCategoryLabel: string;
      canGenerateShorts: boolean;
      shortsSourceType: PropertyShortsSourceType;
    };
    pushItemError: (e: ImportRunItemError) => void;
    onMediaPersistFailure?: () => void;
  }): Promise<void> {
    const {
      ctx,
      row,
      resolvedId,
      existing,
      wmSettings,
      imageVariants,
      imagesForDb,
      facet,
      pushItemError,
      onMediaPersistFailure,
    } = params;
    const { videoUrl, listingType } = resolveVideoForImportUpdate(
      ctx.portal,
      row.videoUrl,
      existing.videoUrl,
    );
    await this.prisma.property.update({
      where: { id: existing.id },
      data: {
        title: row.title,
        description:
          (row.description?.length ?? 0) >= (existing.description?.length ?? 0)
            ? row.description
            : existing.description,
        price:
          row.price != null && row.price > 0
            ? Math.trunc(row.price)
            : existing.price != null && existing.price > 0
              ? existing.price
              : null,
        city: row.city,
        address: (row.address?.trim() || existing.address?.trim() || row.city).slice(0, 500),
        region: row.region?.trim() ?? existing.region,
        district: row.district?.trim() ?? existing.district,
        area: row.area ?? existing.area,
        floor: row.floor ?? existing.floor,
        totalFloors: row.totalFloors ?? existing.totalFloors,
        condition: row.condition?.trim() ?? existing.condition,
        ownership: row.ownership?.trim() ?? existing.ownership,
        offerType: row.offerType?.trim() || existing.offerType,
        propertyType: row.propertyType?.trim() || existing.propertyType,
        images: imagesForDb.length > 0 ? imagesForDb : existing.images,
        videoUrl,
        listingType,
        contactName: (
          this.formatImportedContactNameForDb(row) ??
          existing.contactName?.trim() ??
          'Reality.cz import'
        ).slice(0, 200),
        contactPhone: (row.contactPhone?.trim() || existing.contactPhone || '').slice(0, 40),
        contactEmail: (row.contactEmail?.trim() || existing.contactEmail || '')
          .toLowerCase()
          .slice(0, 120),
        importSourceUrl: row.sourceUrl?.trim() || existing.importSourceUrl,
        importExternalId: resolvedId,
        lastSyncedAt: new Date(),
        ...facet,
      },
    });
    if (imageVariants.length > 0) {
      const mediaRes = await this.persistImportedPropertyMediaRows({
        propertyId: existing.id,
        imageVariants,
        wmSettings,
        replaceExistingImages: true,
      });
      if (!mediaRes.ok) {
        onMediaPersistFailure?.();
        this.logger.warn(
          `[IMPORT] propertyMedia update property=${existing.id} [${mediaRes.category}]: ${mediaRes.message}`,
        );
        pushItemError({
          at: new Date().toISOString(),
          externalId: resolvedId,
          sourceUrl: row.sourceUrl ?? null,
          title: row.title,
          price: row.price ?? null,
          imagesCount: row.images.length,
          contactEmail: row.contactEmail || null,
          contactPhone: row.contactPhone || null,
          saveStatus: 'failed',
          category: mediaRes.category,
          message: `PropertyMedia (update): ${mediaRes.message}`,
        });
      }
    }
  }
}

