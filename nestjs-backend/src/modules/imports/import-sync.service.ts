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
import { RealityCzScraperImporter } from './reality-cz-scraper-importer.service';

type ImportSourcePatch = {
  enabled?: boolean;
  intervalMinutes?: number;
  limitPerRun?: number;
  endpointUrl?: string | null;
  credentialsJson?: Record<string, unknown> | null;
  settingsJson?: Record<string, unknown> | null;
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
        endpointUrl: 'https://www.reality.cz/',
      },
      update: {},
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
    if (patch.credentialsJson !== undefined) data.credentialsJson = patch.credentialsJson;
    if (patch.settingsJson !== undefined) data.settingsJson = patch.settingsJson;
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
    try {
      const rows = await this.fetchRows(ctx);
      result = await this.importRows(ctx, actorUserId, rows);
      await this.prisma.importSource.update({
        where: { id: ctx.sourceId },
        data: { lastRunAt: new Date(), lastStatus: 'ok' },
      });
      return result;
    } catch (error: unknown) {
      errorMessage = error instanceof Error ? error.message : 'Neznámá chyba importu';
      this.logger.error(`Import ${ctx.portal}/${ctx.method} failed: ${errorMessage}`);
      await this.prisma.importSource.update({
        where: { id: ctx.sourceId },
        data: { lastRunAt: new Date(), lastStatus: `error: ${errorMessage}` },
      });
      throw new BadRequestException(errorMessage);
    } finally {
      await this.prisma.importLog.create({
        data: {
          sourceId: ctx.sourceId,
          portal: ctx.portal,
          method: ctx.method,
          status: errorMessage ? 'error' : 'ok',
          message: errorMessage ? null : `Import ${ctx.sourceName} dokončen`,
          importedNew: result?.importedNew ?? 0,
          importedUpdated: result?.importedUpdated ?? 0,
          skipped: result?.skipped ?? 0,
          disabled: result?.disabled ?? 0,
          error: errorMessage ?? null,
          payloadJson: {
            startedAt,
            finishedAt: new Date(),
            errors: result?.errors ?? [],
          },
        },
      });
    }
  }

  private async fetchRows(ctx: ImportExecutionContext): Promise<ImportedListingDraft[]> {
    if (ctx.portal !== ListingImportPortal.reality_cz) {
      throw new BadRequestException('Aktuálně je implementovaný Reality.cz import');
    }
    if (ctx.method === ListingImportMethod.soap) {
      if (!this.soapImporter.supportsConfiguredRun()) {
        throw new BadRequestException('SOAP není nakonfigurovaný (REALITY_CZ_* env)');
      }
      return this.soapImporter.fetch(ctx.limitPerRun);
    }
    if (ctx.method === ListingImportMethod.scraper) {
      const startUrl = ctx.endpointUrl || 'https://www.reality.cz/';
      return this.scraperImporter.fetch(ctx.limitPerRun, startUrl);
    }
    throw new BadRequestException(`Nepodporovaná metoda importu: ${ctx.method}`);
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

    for (const row of rows.slice(0, Math.max(1, Math.min(500, ctx.limitPerRun)))) {
      try {
        const externalId = row.externalId.trim();
        if (!externalId) {
          skipped += 1;
          continue;
        }

        const existing = await this.prisma.property.findFirst({
          where: { importSource: ctx.portal, importExternalId: externalId },
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
          continue;
        }

        if (existing.importDisabled) {
          disabled += 1;
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
      } catch (error: unknown) {
        skipped += 1;
        errors.push(error instanceof Error ? error.message : 'Neznámá chyba řádku');
      }
    }

    return { importedNew, importedUpdated, skipped, disabled, errors };
  }
}

