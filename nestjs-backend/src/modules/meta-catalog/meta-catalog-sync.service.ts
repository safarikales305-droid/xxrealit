import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { MetaCenterService } from '../meta-center/meta-center.service';
import { SYNC_INTERVAL_OPTIONS } from './meta-catalog.fields';
import { MetaCatalogFeedService } from './meta-catalog-feed.service';
import { MetaCatalogLogService } from './meta-catalog-log.service';
import { MetaCatalogQualityService } from './meta-catalog-quality.service';
import { MetaCatalogImageVerifyService } from './meta-catalog-image-verify.service';

const SETTINGS_ID = 'default';

export type SyncMode =
  | 'full'
  | 'delta'
  | 'repair'
  | 'refresh'
  | 'clear-cache'
  | 'regenerate'
  | 'restart';

@Injectable()
export class MetaCatalogSyncService {
  private readonly logger = new Logger(MetaCatalogSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly feed: MetaCatalogFeedService,
    private readonly quality: MetaCatalogQualityService,
    private readonly imageVerify: MetaCatalogImageVerifyService,
    private readonly logService: MetaCatalogLogService,
    @Inject(forwardRef(() => MetaCenterService))
    private readonly metaCenter: MetaCenterService,
  ) {}

  private async getSettings() {
    const row = await this.prisma.metaCatalogSetting.findUnique({
      where: { id: SETTINGS_ID },
    });
    if (row) return row;
    return this.prisma.metaCatalogSetting.create({ data: { id: SETTINGS_ID } });
  }

  computeNextSync(from: Date, intervalMinutes: number): Date {
    const mins = SYNC_INTERVAL_OPTIONS.includes(intervalMinutes as (typeof SYNC_INTERVAL_OPTIONS)[number])
      ? intervalMinutes
      : 15;
    return new Date(from.getTime() + mins * 60_000);
  }

  async markListingDirty(propertyId: string) {
    await this.prisma.metaCatalogExportItem.upsert({
      where: { propertyId },
      create: { propertyId, exportStatus: 'pending', lastChangedAt: new Date() },
      update: { exportStatus: 'pending', lastChangedAt: new Date(), synced: false },
    });
    void this.logService.log('listing_dirty', 'Změna inzerátu — čeká na synchronizaci', {
      propertyId,
    });
  }

  async runSync(mode: SyncMode = 'full') {
    const settings = await this.getSettings();
    if (settings.syncRunning && mode !== 'clear-cache') {
      return { ok: false, error: 'Synchronizace již běží.' };
    }

    if (mode === 'clear-cache') {
      this.feed.clearCache();
      await this.prisma.metaCatalogSetting.update({
        where: { id: SETTINGS_ID },
        data: { feedCacheClearedAt: new Date() },
      });
      await this.logService.log('cache_cleared', 'Cache feedu vymazána');
      return { ok: true, message: 'Cache vymazána.' };
    }

    const started = Date.now();
    const run = await this.prisma.metaCatalogSyncRun.create({
      data: { mode, result: 'running' },
    });

    await this.prisma.metaCatalogSetting.update({
      where: { id: SETTINGS_ID },
      data: { syncRunning: true },
    });

    let exportedCount = 0;
    let changedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    try {
      if (mode === 'restart') {
        await this.prisma.metaCatalogExportItem.updateMany({
          data: { exportStatus: 'pending', synced: false },
        });
      }

      const ctx = await this.feed.getFeedContext();
      let built = await this.feed.buildExportRecords();

      if (mode === 'delta') {
        const pending = await this.prisma.metaCatalogExportItem.findMany({
          where: { exportStatus: { in: ['pending', 'error'] } },
          select: { propertyId: true },
        });
        const pendingIds = new Set(pending.map((p) => p.propertyId));
        built = built.filter(
          (b) =>
            pendingIds.has(b.id) ||
            !pendingIds.size, // fallback full if no pending tracked yet
        );
        if (pendingIds.size > 0) {
          built = built.filter((b) => pendingIds.has(b.id));
        }
      }

      for (const item of built) {
        const validation = this.feed.validateRecord(item.record, ctx, item.id);
        if (!validation.ok) {
          errorCount += 1;
          errors.push(...validation.errors.map((e) => `${item.id}: ${e}`));
          await this.prisma.metaCatalogExportItem.upsert({
            where: { propertyId: item.id },
            create: {
              propertyId: item.id,
              exportStatus: 'error',
              lastError: validation.errors.join('; '),
              payloadHash: item.hash,
              lastChangedAt: new Date(),
            },
            update: {
              exportStatus: 'error',
              lastError: validation.errors.join('; '),
              payloadHash: item.hash,
              synced: false,
            },
          });
          continue;
        }

        const existing = await this.prisma.metaCatalogExportItem.findUnique({
          where: { propertyId: item.id },
        });
        const changed = !existing || existing.payloadHash !== item.hash;
        if (changed) changedCount += 1;

        await this.prisma.metaCatalogExportItem.upsert({
          where: { propertyId: item.id },
          create: {
            propertyId: item.id,
            metaProductId: `xxrealit_${item.id}`,
            exportStatus: 'exported',
            lastExportedAt: new Date(),
            lastChangedAt: new Date(),
            payloadHash: item.hash,
            synced: true,
            pixelStatus: 'ready',
          },
          update: {
            exportStatus: 'exported',
            lastExportedAt: new Date(),
            lastError: null,
            payloadHash: item.hash,
            synced: true,
            metaProductId: existing?.metaProductId ?? `xxrealit_${item.id}`,
            pixelStatus: 'ready',
          },
        });
        exportedCount += 1;
      }

      if (mode === 'repair' || mode === 'refresh' || mode === 'regenerate' || mode === 'full' || mode === 'delta' || mode === 'restart') {
        this.feed.clearCache();
        const feeds = await this.feed.buildFeeds(false);
        await this.prisma.metaCatalogSetting.update({
          where: { id: SETTINGS_ID },
          data: {
            lastItemCount: feeds.count,
            lastGeneratedAt: new Date(),
            lastError: null,
            lastSyncAt: new Date(),
            nextSyncAt: this.computeNextSync(new Date(), settings.syncIntervalMinutes),
          },
        });
      }

      const durationMs = Date.now() - started;
      const result = errorCount > 0 ? 'partial' : 'ok';
      await this.prisma.metaCatalogSyncRun.update({
        where: { id: run.id },
        data: {
          finishedAt: new Date(),
          exportedCount,
          changedCount,
          errorCount,
          durationMs,
          result,
          errorMessage: errors.length ? errors.slice(0, 20).join('\n') : null,
          details: { errors: errors.slice(0, 50) } as Prisma.InputJsonValue,
        },
      });

      await this.logService.log('sync_completed', `Sync ${mode}: ${exportedCount} exportováno, ${errorCount} chyb`, {
        details: { mode, exportedCount, changedCount, errorCount, durationMs },
      });

      return {
        ok: true,
        runId: run.id,
        exportedCount,
        changedCount,
        errorCount,
        durationMs,
        errors: errors.slice(0, 20),
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await this.prisma.metaCatalogSyncRun.update({
        where: { id: run.id },
        data: {
          finishedAt: new Date(),
          result: 'error',
          errorMessage: message,
          durationMs: Date.now() - started,
        },
      });
      await this.prisma.metaCatalogSetting.update({
        where: { id: SETTINGS_ID },
        data: { lastError: message },
      });
      await this.logService.log('sync_failed', message, { details: { mode } });
      return { ok: false, error: message, runId: run.id };
    } finally {
      await this.prisma.metaCatalogSetting.update({
        where: { id: SETTINGS_ID },
        data: { syncRunning: false },
      });
    }
  }

  async getDashboard() {
    const settings = await this.getSettings();
    const [
      exported,
      pending,
      errors,
      hidden,
      active,
      lastRun,
      metaDiagnostics,
    ] = await Promise.all([
      this.prisma.metaCatalogExportItem.count({ where: { exportStatus: 'exported' } }),
      this.prisma.metaCatalogExportItem.count({ where: { exportStatus: 'pending' } }),
      this.prisma.metaCatalogExportItem.count({ where: { exportStatus: 'error' } }),
      this.prisma.metaCatalogExportItem.count({ where: { exportStatus: 'hidden' } }),
      this.prisma.property.count({ where: this.feed.buildWhere() }),
      this.prisma.metaCatalogSyncRun.findFirst({ orderBy: { startedAt: 'desc' } }),
      this.metaCenter.runDiagnostics().catch(() => ({ items: [], summary: { ok: 0, warning: 0, error: 0 } })),
    ]);

    const feedOk = settings.enabled && !settings.lastError;
    const metaApiOk = metaDiagnostics.summary.error === 0;

    return {
      counts: {
        exported,
        pending,
        errors,
        hidden,
        active,
        lastItemCount: settings.lastItemCount,
      },
      sync: {
        lastSyncAt: settings.lastSyncAt?.toISOString() ?? null,
        nextSyncAt: settings.nextSyncAt?.toISOString() ?? null,
        syncRunning: settings.syncRunning,
        syncIntervalMinutes: settings.syncIntervalMinutes,
        lastRun: lastRun
          ? {
              id: lastRun.id,
              startedAt: lastRun.startedAt.toISOString(),
              result: lastRun.result,
              exportedCount: lastRun.exportedCount,
              errorCount: lastRun.errorCount,
            }
          : null,
      },
      services: {
        metaApi: metaApiOk ? 'online' : 'offline',
        commerceManager: settings.enabled ? 'ready' : 'not_configured',
        pixel: metaApiOk ? 'ready' : 'not_configured',
        capi: metaApiOk ? 'ready' : 'not_configured',
        dataset: metaApiOk ? 'ready' : 'not_configured',
        xmlFeed: feedOk ? 'online' : 'offline',
        jsonFeed: feedOk ? 'online' : 'offline',
        csvFeed: feedOk ? 'online' : 'offline',
      },
      settings: {
        enabled: settings.enabled,
        allowContactExport: settings.allowContactExport,
        lastError: settings.lastError,
        lastGeneratedAt: settings.lastGeneratedAt?.toISOString() ?? null,
      },
    };
  }

  async listExportedListings(filter?: string) {
    const where: Prisma.MetaCatalogExportItemWhereInput = {};
    if (filter && filter !== 'all') {
      where.exportStatus = filter;
    }

    const items = await this.prisma.metaCatalogExportItem.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });

    const propertyIds = items.map((i) => i.propertyId);
    const properties = await this.prisma.property.findMany({
      where: { id: { in: propertyIds } },
      select: {
        id: true,
        title: true,
        city: true,
        price: true,
        currency: true,
        mainImage: true,
        images: true,
        thumbnailUrl: true,
        facebookShareImageUrl: true,
        facebookShareImageAt: true,
        generatedVideoThumbnail: true,
        videoUrl: true,
        slug: true,
      },
    });
    const propMap = new Map(properties.map((p) => [p.id, p]));

    return {
      items: items.map((item) => {
        const p = propMap.get(item.propertyId);
        return {
          propertyId: item.propertyId,
          title: p?.title ?? '—',
          city: p?.city ?? '',
          price: p?.price ?? null,
          currency: p?.currency ?? 'CZK',
          image: p?.mainImage ?? p?.images?.[0] ?? null,
          exportStatus: item.exportStatus,
          lastExportedAt: item.lastExportedAt?.toISOString() ?? null,
          metaProductId: item.metaProductId,
          pixelStatus: item.pixelStatus,
          synced: item.synced,
          lastChangedAt: item.lastChangedAt?.toISOString() ?? null,
          lastError: item.lastError,
        };
      }),
    };
  }

  async getSyncHistory(take = 50) {
    const runs = await this.prisma.metaCatalogSyncRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: Math.min(200, Math.max(1, take)),
    });
    return {
      items: runs.map((r) => ({
        id: r.id,
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
        exportedCount: r.exportedCount,
        changedCount: r.changedCount,
        errorCount: r.errorCount,
        durationMs: r.durationMs,
        result: r.result,
        mode: r.mode,
      })),
    };
  }

  async getSyncRunDetail(id: string) {
    const run = await this.prisma.metaCatalogSyncRun.findUnique({ where: { id } });
    if (!run) return null;
    return {
      id: run.id,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      exportedCount: run.exportedCount,
      changedCount: run.changedCount,
      errorCount: run.errorCount,
      durationMs: run.durationMs,
      result: run.result,
      mode: run.mode,
      errorMessage: run.errorMessage,
      details: run.details,
    };
  }

  async getQualityReport(withHttpProbe = false) {
    const built = await this.feed.buildExportRecords();
    const probes = withHttpProbe
      ? (await this.imageVerify.verifyAllFeedImages()).items
      : undefined;
    return this.quality.runQualityCheck(
      built.map((b) => ({ id: b.id, record: b.record })),
      probes,
    );
  }

  async getStatistics() {
    const eventTypes = [
      'ViewContent',
      'Lead',
      'Contact',
      'Share',
      'Favorite',
      'MessageSeller',
      'PurchaseCredits',
      'CompleteRegistration',
    ];
    const counts: Record<string, number> = {};
    for (const et of eventTypes) {
      counts[et] = await this.prisma.metaCenterEventLog.count({
        where: { eventType: et },
      });
    }
    const productViews = await this.prisma.metaCenterEventLog.count({
      where: { eventType: 'ViewContent' },
    });
    const clicks = await this.prisma.metaCenterEventLog.count({
      where: { OR: [{ eventType: 'Lead' }, { eventType: 'Contact' }] },
    });
    const remarketing = await this.prisma.metaCenterEventLog.count({
      where: { source: 'remarketing' },
    });
    return {
      productViews,
      clicks,
      remarketingAudiences: remarketing,
      events: counts,
    };
  }

  async testMeta() {
    const [diagnostics, testAll] = await Promise.all([
      this.metaCenter.runDiagnostics(),
      this.metaCenter.testAll(),
    ]);
    const feedValidation = await this.feed.buildExportRecords().then((items) => {
      const ctx = this.feed.getFeedContext();
      return ctx.then((c) =>
        this.feed.validateBatch(
          items.map((i) => ({ id: i.id, record: i.record })),
          c,
        ),
      );
    });

    const origin = process.env.FRONTEND_URL || 'https://xxrealit.cz';
    const extraChecks = [
      {
        key: 'xml_feed',
        label: 'XML Feed',
        level: feedValidation.ok ? 'ok' : 'error',
        message: feedValidation.ok ? 'Feed validní' : feedValidation.errors[0] ?? 'Chyba',
      },
      {
        key: 'csv_feed',
        label: 'CSV Feed',
        level: feedValidation.ok ? 'ok' : 'error',
        message: feedValidation.ok ? 'Feed validní' : 'Chyba validace',
      },
      {
        key: 'json_feed',
        label: 'JSON Feed',
        level: feedValidation.ok ? 'ok' : 'error',
        message: feedValidation.ok ? 'Feed validní' : 'Chyba validace',
      },
      {
        key: 'frontend_url',
        label: 'Frontend URL',
        level: origin.startsWith('http') ? 'ok' : 'warning',
        message: origin,
      },
      {
        key: 'callback_url',
        label: 'Callback URL',
        level: 'ok',
        message: `${origin}/api/social/facebook/meta-connect-callback`,
      },
    ];

    return {
      testedAt: new Date().toISOString(),
      diagnostics: {
        items: [...diagnostics.items, ...extraChecks],
        summary: diagnostics.summary,
      },
      services: testAll.services,
    };
  }
}
