import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ListingImportMethod,
  ListingImportPortal,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type {
  ImportExecutionContext,
  ImportedListingDraft,
  ImportRunResult,
} from './import-types';
import { RealityCzSoapImporter } from './reality-cz-soap-importer.service';
import {
  RealityCzScraperImporter,
  type RealityCzScraperFetchOutcome,
} from './reality-cz-scraper-importer.service';

type ImportSourcePatch = {
  enabled?: boolean;
  intervalMinutes?: number;
  limitPerRun?: number;
  endpointUrl?: string | null;
  credentialsJson?: Prisma.InputJsonValue | null;
  settingsJson?: Prisma.InputJsonValue | null;
};

@Injectable()
export class ImportSyncService {
  private readonly logger = new Logger(ImportSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly soapImporter: RealityCzSoapImporter,
    private readonly scraperImporter: RealityCzScraperImporter,
  ) {}

  async ensureDefaultSources() {
    await this.prisma.importSource.upsert({
      where: {
        portal_method: { portal: ListingImportPortal.reality_cz, method: ListingImportMethod.soap },
      },
      create: {
        portal: ListingImportPortal.reality_cz,
        method: ListingImportMethod.soap,
        name: 'Reality.cz SOAP',
        enabled: false,
        intervalMinutes: 60,
        limitPerRun: 150,
      },
      update: {},
    });
    await this.prisma.importSource.upsert({
      where: {
        portal_method: {
          portal: ListingImportPortal.reality_cz,
          method: ListingImportMethod.scraper,
        },
      },
      create: {
        portal: ListingImportPortal.reality_cz,
        method: ListingImportMethod.scraper,
        name: 'Reality.cz Scraper',
        enabled: false,
        intervalMinutes: 120,
        limitPerRun: 100,
        endpointUrl: 'https://www.reality.cz/prodej/byty/',
        settingsJson: {
          scraperListOnlyImport: true,
          scraperRequestDelayMs: 3500,
          scraperMaxRetries: 6,
          scraperBackoffMultiplier: 2,
          scraperBaseBackoffMsOn429: 12_000,
          scraperMaxDetailFetchesPerRun: 0,
        },
      },
      update: {},
    });
    await this.prisma.importSource.updateMany({
      where: {
        portal: ListingImportPortal.reality_cz,
        method: ListingImportMethod.scraper,
        OR: [{ endpointUrl: null }, { endpointUrl: '' }],
      },
      data: { endpointUrl: 'https://www.reality.cz/prodej/byty/' },
    });
    await this.prisma.importSource.upsert({
      where: {
        portal_method: {
          portal: ListingImportPortal.xml_feed,
          method: ListingImportMethod.xml,
        },
      },
      create: {
        portal: ListingImportPortal.xml_feed,
        method: ListingImportMethod.xml,
        name: 'XML feed',
        enabled: false,
        intervalMinutes: 120,
        limitPerRun: 200,
      },
      update: {},
    });
    await this.prisma.importSource.upsert({
      where: {
        portal_method: {
          portal: ListingImportPortal.csv_feed,
          method: ListingImportMethod.csv,
        },
      },
      create: {
        portal: ListingImportPortal.csv_feed,
        method: ListingImportMethod.csv,
        name: 'CSV',
        enabled: false,
        intervalMinutes: 180,
        limitPerRun: 200,
      },
      update: {},
    });
  }

  async listSources() {
    await this.ensureDefaultSources();
    return this.prisma.importSource.findMany({
      orderBy: [{ portal: 'asc' }, { method: 'asc' }],
    });
  }

  async updateSource(sourceId: string, patch: ImportSourcePatch) {
    const current = await this.prisma.importSource.findUnique({ where: { id: sourceId } });
    if (!current) throw new NotFoundException('Import source nenalezen');
    const data: Prisma.ImportSourceUpdateInput = {};
    if (typeof patch.enabled === 'boolean') data.enabled = patch.enabled;
    if (typeof patch.intervalMinutes === 'number') data.intervalMinutes = Math.max(1, Math.trunc(patch.intervalMinutes));
    if (typeof patch.limitPerRun === 'number') data.limitPerRun = Math.max(1, Math.trunc(patch.limitPerRun));
    if (patch.endpointUrl !== undefined) data.endpointUrl = patch.endpointUrl ? patch.endpointUrl.trim() : null;
    if (patch.credentialsJson !== undefined) {
      data.credentialsJson = patch.credentialsJson ?? Prisma.JsonNull;
    }
    if (patch.settingsJson !== undefined) {
      data.settingsJson = patch.settingsJson ?? Prisma.JsonNull;
    }
    return this.prisma.importSource.update({ where: { id: sourceId }, data });
  }

  async listLogs(sourceId?: string) {
    return this.prisma.importLog.findMany({
      where: sourceId ? { sourceId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 120,
      include: { source: true },
    });
  }

  async runSource(sourceId: string, actorUserId: string) {
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
    };
    return this.runWithLogging(ctx, actorUserId);
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

  private async runWithLogging(ctx: ImportExecutionContext, actorUserId: string) {
    const startedAt = new Date();
    let result: ImportRunResult | null = null;
    let errorMessage: string | null = null;
    let scraperMeta: RealityCzScraperFetchOutcome['meta'] | undefined;
    try {
      const { rows, scraperMeta: sm } = await this.fetchRows(ctx);
      scraperMeta = sm;
      result = await this.importRows(ctx, actorUserId, rows);
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
            errors: result?.errors ?? [],
            warnings: result?.warnings ?? [],
            scraper: scraperMeta
              ? (JSON.parse(JSON.stringify(scraperMeta)) as Prisma.InputJsonValue)
              : null,
          },
        },
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
        path.includes('pozemk');
      if (!looksListing) {
        return `URL „${finalUrl}“ pravděpodobně není stránka se seznamem nabídek (očekávejte cestu s prodej/pronájem nebo typ nemovitosti).`;
      }
    } catch {
      return null;
    }
    return null;
  }

  private resolveRealityCzScraperStartUrl(ctx: ImportExecutionContext): string {
    const fromEndpoint = ctx.endpointUrl?.trim() ?? '';
    const fromSettings =
      ctx.settingsJson &&
      typeof ctx.settingsJson.startUrl === 'string' &&
      ctx.settingsJson.startUrl.trim()
        ? ctx.settingsJson.startUrl.trim()
        : '';
    const candidate = fromEndpoint || fromSettings;
    if (!candidate) {
      throw new BadRequestException(
        'Zadejte start URL pro scraper Reality.cz (pole „Endpoint / start URL“ v administraci Importy musí obsahovat adresu výpisu nabídek, např. https://www.reality.cz/prodej/byty/).',
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
    return candidate;
  }

  private async fetchRows(ctx: ImportExecutionContext): Promise<{
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
      const rows = await this.soapImporter.fetch(ctx.limitPerRun);
      return { rows };
    }
    if (ctx.method === ListingImportMethod.scraper) {
      const startUrl = this.resolveRealityCzScraperStartUrl(ctx);
      this.logger.log(`Reality.cz scraper: používám start URL ${startUrl}`);
      const outcome = await this.scraperImporter.fetch(
        ctx.limitPerRun,
        startUrl,
        ctx.settingsJson,
      );
      return { rows: outcome.rows, scraperMeta: outcome.meta };
    }
    throw new BadRequestException(`Nepodporovaná metoda importu: ${ctx.method}`);
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

  private async importRows(
    ctx: ImportExecutionContext,
    actorUserId: string,
    rows: ImportedListingDraft[],
  ): Promise<ImportRunResult> {
    let importedNew = 0;
    let importedUpdated = 0;
    let skipped = 0;
    let disabled = 0;
    const errors: string[] = [];

    const batch = this.dedupeImportedRows(
      rows.slice(0, Math.max(1, Math.min(500, ctx.limitPerRun))),
    );

    for (const row of batch) {
      try {
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
          await this.prisma.property.create({
            data: {
              userId: actorUserId,
              title: row.title,
              description: row.description,
              price: Math.max(1, Math.trunc(row.price || 1)),
              city: row.city,
              address: row.address?.trim() || row.city,
              currency: 'CZK',
              offerType: row.offerType?.trim() || 'prodej',
              propertyType: row.propertyType?.trim() || 'byt',
              subType: '',
              images: row.images,
              videoUrl: row.videoUrl?.trim() || null,
              contactName: 'Reality.cz import',
              contactPhone: '',
              contactEmail: '',
              approved: true,
              status: 'APPROVED',
              isActive: true,
              listingType: row.videoUrl ? 'SHORTS' : 'CLASSIC',
              importSource: ctx.portal,
              importMethod: ctx.method,
              importExternalId: externalId,
              importSourceUrl: row.sourceUrl?.trim() || null,
              importedAt: new Date(),
              lastSyncedAt: new Date(),
              importDisabled: false,
            },
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

        await this.prisma.property.update({
          where: { id: existing.id },
          data: {
            title: row.title,
            description: row.description,
            price: Math.max(1, Math.trunc(row.price || 1)),
            city: row.city,
            address: row.address?.trim() || row.city,
            offerType: row.offerType?.trim() || existing.offerType,
            propertyType: row.propertyType?.trim() || existing.propertyType,
            images: row.images.length > 0 ? row.images : existing.images,
            videoUrl: row.videoUrl?.trim() || existing.videoUrl,
            listingType: row.videoUrl ? 'SHORTS' : existing.listingType,
            importSourceUrl: row.sourceUrl?.trim() || existing.importSourceUrl,
            lastSyncedAt: new Date(),
          },
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

    return { importedNew, importedUpdated, skipped, disabled, errors };
  }
}

