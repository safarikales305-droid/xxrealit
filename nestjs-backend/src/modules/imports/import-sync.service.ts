import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ListingImportMethod,
  ListingImportPortal,
  Prisma,
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
  ImportExecutionContext,
  ImportSourceBranchRow,
  ImportedListingDraft,
  ImportRunLiveState,
  ImportRunProgressPayload,
  ImportRunResult,
  PortalImportAggregate,
} from './import-types';
import { RealityCzSoapImporter } from './reality-cz-soap-importer.service';
import {
  RealityCzScraperImporter,
  type RealityCzScraperFetchOutcome,
} from './reality-cz-scraper-importer.service';
import { parseRealityCzScraperSettings } from './reality-cz-scraper-settings';
import { normalizeStoredImageUrlList } from './import-image-urls';
import { ImportImageService } from './import-image.service';
import {
  DEFAULT_REALITY_BYTY_START_URL,
  getDefaultRealityStartUrlForCategoryKey,
  resolveRealityScraperStartUrlForCategory,
} from './reality-branch-url.util';
const DEFAULT_CATEGORY_KEY = 'ostatni';
const DEFAULT_CATEGORY_LABEL = 'Ostatní';

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
    scraperRequestDelayMs: 2600,
    scraperMaxRetries: 6,
    scraperBackoffMultiplier: 2,
    scraperBaseBackoffMsOn429: 12_000,
    scraperMaxDetailFetchesPerRun: 200,
    scraperDetailConcurrency: 2,
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
    private readonly importImageService: ImportImageService,
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
    if (input.method === ListingImportMethod.scraper && input.portal === ListingImportPortal.reality_cz) {
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
      ctx.portal === ListingImportPortal.reality_cz &&
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
    let scraperMeta: RealityCzScraperFetchOutcome['meta'] | undefined;
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
      emitProgress({
        totalListings: rows.length,
        message: `Nalezeno ${rows.length} inzerátů ve výpisu…`,
        percent: 10,
        phase: 'listing',
      });

      const settings = parseRealityCzScraperSettings(ctx.settingsJson);
      let rowsForDb = rows;
      if (
        ctx.portal === ListingImportPortal.reality_cz &&
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
        let plannedDetailSlotsForProgress = 1;
        const enr = await this.scraperImporter.enrichDraftsWithDetailsBatched(rows, settings, {
          onPlanned: (n) => {
            plannedDetailSlotsForProgress = Math.max(1, n);
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
            const frac = Math.min(1, tick.detailFetchesCompleted / plannedDetailSlotsForProgress);
            emitProgress({
              phase: 'details',
              processedDetails: tick.detailFetchesCompleted,
              percent: 12 + Math.floor(frac * 78),
              message: tick.message,
            });
          },
        });
        rowsForDb = enr.rows;
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
            ? 'Metoda bez HTTP detailů Reality scraperu.'
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

      const warnings = [...(result.warnings ?? [])];
      if (ctx.method === ListingImportMethod.scraper && scraperMeta) {
        this.logger.log(
          `Scraper metrics: startUrl=${scraperMeta.startUrl} finalUrl=${scraperMeta.finalUrl} raw=${scraperMeta.rawCandidates} valid=${scraperMeta.normalizedValid} parse=${scraperMeta.parseMethod} details=${scraperMeta.detailFetchesCompleted}/${scraperMeta.detailFetchesAttempted} list429=${scraperMeta.listPage429Count} detail429=${scraperMeta.detailPage429Count}`,
        );
        if (scraperMeta.rawCandidates === 0) {
          const msg =
            'Parser nenašel žádné inzeráty na stažené stránce (zkontrolujte, zda start URL vede na výpis nabídek, ne např. jen na titulní stránku).';
          warnings.push(msg);
          this.logger.warn(msg);
        } else if (scraperMeta.normalizedValid === 0) {
          const msg = `Nalezeno ${scraperMeta.rawCandidates} kandidátů z HTML/JSON, ale žádný neprošel validací (chybí cena, titulek nebo ID).`;
          warnings.push(msg);
          this.logger.warn(msg);
        }
        const pageHint = this.describeListingPageMismatch(scraperMeta.finalUrl);
        if (pageHint) {
          warnings.push(pageHint);
          this.logger.warn(pageHint);
        }
      }
      const summaryParts: string[] = [];
      if (result.importedNew || result.importedUpdated) {
        summaryParts.push(
          `nové ${result.importedNew}, aktualizované ${result.importedUpdated}, přeskočeno ${result.skipped}, ručně vypnuté ${result.disabled}`,
        );
      } else if (!errorMessage) {
        summaryParts.push(
          `žádné změny v DB (nové 0, aktualizované 0, přeskočeno ${result.skipped}, ručně vypnuté ${result.disabled})`,
        );
      }
      if (warnings.length) {
        summaryParts.push(`Varování: ${warnings.join(' | ')}`);
      }
      result.warnings = warnings;
      result.summary = summaryParts.join('. ') || null;
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
        scraperSettings: scraperMeta?.settings,
        detailPhaseDbUpdates: result.importedNew + result.importedUpdated,
        detailPhaseDbErrors: 0,
      };

      const hasProblem =
        warnings.length > 0 && result.importedNew === 0 && result.importedUpdated === 0;
      await this.prisma.importSource.update({
        where: { id: ctx.sourceId },
        data: {
          lastRunAt: new Date(),
          lastStatus: errorMessage
            ? `error: ${errorMessage}`
            : hasProblem
              ? `warn: ${warnings[0]?.slice(0, 240) ?? 'viz log'}`
              : 'ok',
        },
      });
      emitProgress({ percent: 100, message: 'Import dokončen.', phase: 'done' });
      return result;
    } catch (error: unknown) {
      errorMessage = error instanceof Error ? error.message : 'Neznámá chyba importu';
      if (
        ctx.method === ListingImportMethod.scraper &&
        /429|Too Many Requests/i.test(errorMessage)
      ) {
        errorMessage = `Web Reality.cz blokuje příliš rychlé dotazy (HTTP 429). V administraci Importy zvětšete prodlevu mezi požadavky, snižte počet detailů na běh nebo nechte zapnutý režim „jen výpis“. Technická hláška: ${errorMessage}`;
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
      const warnOutcome =
        !errorMessage &&
        !!result &&
        (result.warnings?.length ?? 0) > 0 &&
        result.importedNew === 0 &&
        result.importedUpdated === 0;
      const logStatus = errorMessage ? 'error' : warnOutcome ? 'warn' : 'ok';
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
    scraperMeta?: RealityCzScraperFetchOutcome['meta'];
  }> {
    if (ctx.portal !== ListingImportPortal.reality_cz) {
      throw new BadRequestException('Aktuálně je implementovaný Reality.cz import');
    }
    if (ctx.method === ListingImportMethod.soap) {
      if (!this.soapImporter.supportsConfiguredRun()) {
        throw new BadRequestException('SOAP není nakonfigurovaný (REALITY_CZ_* env)');
      }
      onProgress?.({ percent: 12, message: 'Stahuji inzeráty přes Reality.cz SOAP…' });
      const rows = await this.soapImporter.fetch(ctx.limitPerRun);
      onProgress?.({ percent: 62, message: `SOAP: načteno ${rows.length} záznamů…` });
      return { rows };
    }
    if (ctx.method === ListingImportMethod.scraper) {
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
      const id = (row.externalId ?? '').trim().toUpperCase();
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

  /**
   * Fotky z Reality.cz stáhneme a nahrajeme stejným storage jako uživatelské inzeráty (Cloudinary / lokální uploads).
   */
  private async resolveImportedPropertyImagesForDb(
    ctx: ImportExecutionContext,
    row: ImportedListingDraft,
    externalId: string,
    existingPropertyId: string | null,
  ): Promise<string[]> {
    const normalized = normalizeStoredImageUrlList(row.images);
    if (normalized.length === 0) return [];
    const portalKeyRaw = (ctx.portalKey ?? String(ctx.portal)).trim() || 'import';
    const sourcePortalKey = portalKeyRaw.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 64) || 'import';
    const propertyIdForMirror =
      existingPropertyId ?? `staging-${externalId.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 80)}`;
    return this.importImageService.mirrorRealityListingImages({
      urls: normalized,
      propertyId: propertyIdForMirror,
      sourcePortalKey,
    });
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
    let disabled = 0;
    const errors: string[] = [];

    const batch = this.dedupeImportedRows(
      rows.slice(0, Math.max(1, Math.min(500, ctx.limitPerRun))),
    );

    onProgress?.({
      percent: 12,
      phase: 'listing',
      totalListings: batch.length,
      processedListings: 0,
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
      const row = batch[i];
      try {
        onProgress?.({
          phase: 'listing',
          processedListings: i + 1,
          totalListings: batch.length,
          savedCount: importedNew,
          updatedCount: importedUpdated,
          skippedCount: skipped,
          errorCount: errors.length,
          percent: 10 + Math.floor((30 * (i + 1)) / Math.max(1, batch.length)),
          message: `Ukládám výpis ${i + 1}/${batch.length}…`,
        });
        const externalId = row.externalId.trim().toUpperCase();
        if (!externalId) {
          skipped += 1;
          // eslint-disable-next-line no-console
          console.log('[IMPORT]', '(empty)', (row.title ?? '').slice(0, 60), 'SKIPPED');
          continue;
        }

        const existing = await this.prisma.property.findUnique({
          where: {
            importSource_importExternalId: {
              importSource: ctx.portal,
              importExternalId: externalId,
            },
          },
        });
        if (!existing) {
          const { videoUrl, listingType } = resolveImportedListingVideoAndType(
            ctx.portal,
            row.videoUrl,
          );
          const facet = this.importFacetPayload(ctx, row);
          const imagesForDb = await this.resolveImportedPropertyImagesForDb(
            ctx,
            row,
            externalId,
            null,
          );
          const created = await this.prisma.property.create({
            data: {
              userId: actorUserId,
              title: row.title,
              description: row.description,
              price:
                row.price != null && row.price > 0 ? Math.trunc(row.price) : null,
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
              contactName: 'Reality.cz import',
              contactPhone: '',
              contactEmail: '',
              approved: true,
              status: 'APPROVED',
              isActive: true,
              listingType,
              importSource: ctx.portal,
              importMethod: ctx.method,
              importExternalId: externalId,
              importSourceUrl: row.sourceUrl?.trim() || null,
              importedAt: new Date(),
              lastSyncedAt: new Date(),
              importDisabled: false,
              ...facet,
            },
          });
          // eslint-disable-next-line no-console
          console.log('REALITY SAVED PROPERTY IMAGE FIELDS', {
            id: created.id,
            title: created.title,
            coverImage: (created as unknown as Record<string, unknown>).coverImage ?? null,
            imageUrl: (created as unknown as Record<string, unknown>).imageUrl ?? null,
            thumbnail: (created as unknown as Record<string, unknown>).thumbnail ?? null,
            photos: (created as unknown as Record<string, unknown>).photos ?? null,
            gallery: (created as unknown as Record<string, unknown>).gallery ?? null,
            images: created.images,
          });
          createdDiagnostics.push({
            id: created.id,
            externalId,
            listingType: created.listingType,
            approved: created.approved,
            isActive: created.isActive,
            importDisabled: created.importDisabled,
          });
          importedNew += 1;
          // eslint-disable-next-line no-console
          console.log('[IMPORT]', externalId, (row.title ?? '').slice(0, 80), 'CREATED');
          continue;
        }

        if (existing.importDisabled) {
          disabled += 1;
          // eslint-disable-next-line no-console
          console.log('[IMPORT]', externalId, (row.title ?? '').slice(0, 80), 'SKIPPED_DISABLED');
          continue;
        }

        const { videoUrl, listingType } = resolveVideoForImportUpdate(
          ctx.portal,
          row.videoUrl,
          existing.videoUrl,
        );
        const facet = this.importFacetPayload(ctx, row);
        const imagesForDb = await this.resolveImportedPropertyImagesForDb(
          ctx,
          row,
          externalId,
          existing.id,
        );
        const updated = await this.prisma.property.update({
          where: { id: existing.id },
          data: {
            title: row.title,
            description: row.description,
            price:
              row.price != null && row.price > 0 ? Math.trunc(row.price) : null,
            city: row.city,
            address: row.address?.trim() || row.city,
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
            importSourceUrl: row.sourceUrl?.trim() || existing.importSourceUrl,
            lastSyncedAt: new Date(),
            ...facet,
          },
        });
        // eslint-disable-next-line no-console
        console.log('REALITY SAVED PROPERTY IMAGE FIELDS', {
          id: updated.id,
          title: updated.title,
          coverImage: (updated as unknown as Record<string, unknown>).coverImage ?? null,
          imageUrl: (updated as unknown as Record<string, unknown>).imageUrl ?? null,
          thumbnail: (updated as unknown as Record<string, unknown>).thumbnail ?? null,
          photos: (updated as unknown as Record<string, unknown>).photos ?? null,
          gallery: (updated as unknown as Record<string, unknown>).gallery ?? null,
          images: updated.images,
        });
        importedUpdated += 1;
        // eslint-disable-next-line no-console
        console.log('[IMPORT]', externalId, (row.title ?? '').slice(0, 80), 'UPDATED');
      } catch (error: unknown) {
        skipped += 1;
        errors.push(error instanceof Error ? error.message : 'Neznámá chyba řádku');
        // eslint-disable-next-line no-console
        console.log(
          '[IMPORT]',
          (row.externalId ?? '').trim(),
          (row.title ?? '').slice(0, 80),
          'SKIPPED_ERROR',
          error instanceof Error ? error.message : error,
        );
      }
    }

    if (createdDiagnostics.length > 0) {
      const preview = createdDiagnostics.slice(0, 30);
      this.logger.log(
        `Import: vytvořené listingy (${createdDiagnostics.length}) — ukázka: ${JSON.stringify(preview)}`,
      );
    }

    return { importedNew, importedUpdated, skipped, disabled, errors };
  }
}

