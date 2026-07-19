import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PrismaService } from '../../database/prisma.service';
import { discoverRuianVfrFile } from './ruian-vfr.discovery';
import { extractAllVfrDataFiles, validateDownloadedFile } from './ruian-vfr.archive';
import { formatRuianVfrError, validateVfrImportResult } from './ruian-vfr.errors';
import { downloadToFile, verifyRemoteFileHead } from './ruian-vfr.io';
import { streamParseVfrXmlFile } from './ruian-vfr.stream-parser';
import {
  RUIAN_ADDRESS_ELEMENT_TYPES,
  RUIAN_BATCH_SIZE,
  RUIAN_FULL_ELEMENT_TYPES,
  RUIAN_HEARTBEAT_MS,
  RUIAN_IMPORT_SCOPE,
  RUIAN_JOB_STATUS,
  RUIAN_SEO_ELEMENT_TYPES,
  RUIAN_STALE_JOB_MS,
  RUIAN_WORKER_TICK_MS,
  type RuianImportScope,
  type RuianJobCheckpoint,
  type RuianJobLogEntry,
} from './ruian-import-job.constants';
import { SeoLocationService } from './seo-location.service';
import { SeoLocationSourceService } from './seo-location-source.service';

function memoryMb(): number {
  return Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10;
}

function maskStack(stack?: string): string | null {
  if (!stack) return null;
  return stack.split('\n').slice(0, 8).join('\n');
}

export function createRuianJobWorkDir(jobId: string): string {
  const dir = path.join(os.tmpdir(), 'xxrealit-ruian', jobId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function cleanupRuianJobWorkDir(jobId: string): void {
  const dir = path.join(os.tmpdir(), 'xxrealit-ruian', jobId);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

@Injectable()
export class RuianImportJobService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(RuianImportJobService.name);
  private workerTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private processing = false;
  private activeJobId: string | null = null;
  private cancelRequested = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: SeoLocationService,
    private readonly sourceService: SeoLocationSourceService,
  ) {}

  onModuleInit(): void {
    this.workerTimer = setInterval(() => void this.tick(), RUIAN_WORKER_TICK_MS);
    process.on('uncaughtException', (err) => void this.handleProcessCrash('uncaughtException', err));
    process.on('unhandledRejection', (reason) =>
      void this.handleProcessCrash('unhandledRejection', reason),
    );
    void this.recoverStaleJobs();
  }

  onModuleDestroy(): void {
    if (this.workerTimer) clearInterval(this.workerTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
  }

  async getActiveJob() {
    return this.prisma.seoLocationImportRun.findFirst({
      where: {
        sourceLabel: 'RUIAN_VFR',
        status: {
          in: [
            RUIAN_JOB_STATUS.QUEUED,
            RUIAN_JOB_STATUS.DISCOVERING,
            RUIAN_JOB_STATUS.DOWNLOADING,
            RUIAN_JOB_STATUS.EXTRACTING,
            RUIAN_JOB_STATUS.PARSING,
            RUIAN_JOB_STATUS.SAVING,
          ],
        },
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  async getJob(jobId: string) {
    const job = await this.prisma.seoLocationImportRun.findUnique({ where: { id: jobId } });
    if (!job) return null;
    const meta = (job.jobMeta ?? {}) as {
      logs?: RuianJobLogEntry[];
      preview?: Array<{
        officialCode: string;
        name: string;
        districtOfficialCode?: string | null;
        regionOfficialCode?: string | null;
      }>;
      dryRun?: boolean;
      xmlFiles?: number;
      memoryMb?: number;
    };
    return {
      jobId: job.id,
      status: job.status,
      phase: job.phase,
      message: job.message,
      progress: job.progressPct,
      importScope: job.importScope,
      sourceUrl: job.sourceUrl,
      sourceFilename: job.filename,
      sourceFileSize: job.sourceFileSize?.toString() ?? null,
      currentFile: job.currentFile,
      bytesRead: job.bytesRead?.toString() ?? '0',
      totalBytes: job.totalBytes?.toString() ?? null,
      parsedRows: job.totalRows,
      insertedRows: job.inserted,
      updatedRows: job.updated,
      skippedRows: job.skipped,
      errorRows: job.errorCount,
      heartbeatAt: job.heartbeatAt?.toISOString() ?? null,
      lastCheckpointAt: job.lastCheckpointAt?.toISOString() ?? null,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
      startedAt: job.startedAt.toISOString(),
      finishedAt: job.finishedAt?.toISOString() ?? null,
      memoryMb: meta.memoryMb ?? null,
      preview: meta.preview,
      dryRun: meta.dryRun,
      xmlFiles: meta.xmlFiles,
      logs: meta.logs ?? [],
      stats: (job.logJson as { stats?: Record<string, number> })?.stats ?? {},
    };
  }

  async getJobLogs(jobId: string) {
    const job = await this.getJob(jobId);
    return job ? { ...job } : null;
  }

  async enqueueImport(scope: RuianImportScope = RUIAN_IMPORT_SCOPE.SEO) {
    const active = await this.getActiveJob();
    if (active) {
      return {
        success: false as const,
        error: 'RÚIAN import již běží.',
        jobId: active.id,
        status: active.status,
      };
    }

    await this.sourceService.ensureDefaultSources();
    const source = await this.prisma.seoLocationSource.findFirst({ where: { type: 'RUIAN' } });

    const job = await this.prisma.seoLocationImportRun.create({
      data: {
        sourceId: source?.id,
        sourceLabel: 'RUIAN_VFR',
        status: RUIAN_JOB_STATUS.QUEUED,
        mode: scope === RUIAN_IMPORT_SCOPE.ADDRESSES ? 'addresses' : 'full',
        importScope: scope,
        phase: 'queued',
        message: 'Čeká ve frontě',
        progressPct: 0,
        logJson: { logs: [], stats: {} } as Prisma.InputJsonValue,
        jobMeta: { logs: [], checkpoint: {} } as Prisma.InputJsonValue,
      },
    });

    this.log.log(`RÚIAN job enqueued: ${job.id} scope=${scope}`);
    void this.tick();

    return { success: true as const, jobId: job.id, status: RUIAN_JOB_STATUS.QUEUED };
  }

  async enqueueTestImport(limit = 100) {
    const active = await this.getActiveJob();
    if (active) {
      return { success: false as const, error: 'RÚIAN import již běží.', jobId: active.id };
    }

    const source = await this.prisma.seoLocationSource.findFirst({ where: { type: 'RUIAN' } });
    const job = await this.prisma.seoLocationImportRun.create({
      data: {
        sourceId: source?.id,
        sourceLabel: 'RUIAN_VFR',
        status: RUIAN_JOB_STATUS.QUEUED,
        mode: 'test',
        importScope: RUIAN_IMPORT_SCOPE.SEO,
        phase: 'queued',
        message: `Test import ${limit} obcí`,
        jobMeta: { logs: [], testLimit: limit, dryRun: true } as Prisma.InputJsonValue,
      },
    });

    void this.tick();
    return { success: true as const, jobId: job.id, status: RUIAN_JOB_STATUS.QUEUED };
  }

  async cancelJob(jobId: string) {
    if (this.activeJobId === jobId) this.cancelRequested = true;
    await this.prisma.seoLocationImportRun.update({
      where: { id: jobId },
      data: {
        status: RUIAN_JOB_STATUS.CANCELLED,
        message: 'Zrušeno uživatelem',
        finishedAt: new Date(),
      },
    });
    return { success: true, jobId, status: RUIAN_JOB_STATUS.CANCELLED };
  }

  async resumeJob(jobId: string) {
    const job = await this.prisma.seoLocationImportRun.findUnique({ where: { id: jobId } });
    if (!job) return { success: false, error: 'Job nenalezen.' };
    if (![RUIAN_JOB_STATUS.INTERRUPTED, RUIAN_JOB_STATUS.FAILED].includes(job.status as 'INTERRUPTED')) {
      return { success: false, error: `Job nelze obnovit ze stavu ${job.status}.` };
    }
    await this.prisma.seoLocationImportRun.update({
      where: { id: jobId },
      data: {
        status: RUIAN_JOB_STATUS.QUEUED,
        message: 'Obnovení importu',
        finishedAt: null,
        errorCode: null,
        errorMessage: null,
      },
    });
    void this.tick();
    return { success: true, jobId, status: RUIAN_JOB_STATUS.QUEUED };
  }

  private async tick(): Promise<void> {
    if (this.processing) return;
    const job = await this.prisma.seoLocationImportRun.findFirst({
      where: { sourceLabel: 'RUIAN_VFR', status: RUIAN_JOB_STATUS.QUEUED },
      orderBy: { startedAt: 'asc' },
    });
    if (!job) return;

    this.processing = true;
    this.activeJobId = job.id;
    this.cancelRequested = false;

    try {
      await this.runJob(job.id);
    } catch (err) {
      this.log.error(`Job ${job.id} crashed: ${formatRuianVfrError(err).message}`);
    } finally {
      this.processing = false;
      this.activeJobId = null;
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
    }
  }

  private async runJob(jobId: string): Promise<void> {
    const job = await this.prisma.seoLocationImportRun.findUnique({ where: { id: jobId } });
    if (!job) return;

    const meta = (job.jobMeta ?? {}) as { logs?: RuianJobLogEntry[]; testLimit?: number; dryRun?: boolean };
    const dryRun = Boolean(meta.dryRun);
    const testLimit = meta.testLimit;
    const scope = (job.importScope as RuianImportScope) ?? RUIAN_IMPORT_SCOPE.SEO;
    const allowedElements =
      scope === RUIAN_IMPORT_SCOPE.ADDRESSES
        ? RUIAN_ADDRESS_ELEMENT_TYPES
        : scope === RUIAN_IMPORT_SCOPE.FULL
          ? RUIAN_FULL_ELEMENT_TYPES
          : RUIAN_SEO_ELEMENT_TYPES;

    const workDir = createRuianJobWorkDir(jobId);
    let heartbeatFailures = 0;

    this.heartbeatTimer = setInterval(() => {
      void this.heartbeat(jobId).catch(() => {
        heartbeatFailures += 1;
      });
    }, RUIAN_HEARTBEAT_MS);

    try {
      await this.updateJob(jobId, {
        status: RUIAN_JOB_STATUS.DISCOVERING,
        phase: 'discover',
        message: 'Hledám stavový VFR soubor',
      });
      await this.appendLog(jobId, 'discover', 'Soubor nalezen — vyhledávám na ČÚZK');

      const file = await discoverRuianVfrFile('full');
      if (!file?.url) throw Object.assign(new Error('Nebyl nalezen žádný stavový VFR soubor.'), { code: 'NOT_FOUND' });

      await this.updateJob(jobId, {
        sourceUrl: file.url,
        filename: file.filename,
        message: `Soubor nalezen: ${file.filename}`,
      });
      await this.appendLog(jobId, 'verify', `Soubor nalezen: ${file.url}`);

      if (this.cancelRequested) throw new Error('Zrušeno uživatelem');

      const head = await verifyRemoteFileHead(file.url);
      if (!head.ok) throw new Error(head.userMessage ?? 'Soubor není dostupný');

      await this.updateJob(jobId, {
        status: RUIAN_JOB_STATUS.DOWNLOADING,
        phase: 'download',
        message: 'Stahuji archiv…',
      });

      const zipPath = path.join(workDir, file.filename);
      const downloadSize = await downloadToFile(file.url, zipPath, 600000);
      validateDownloadedFile(zipPath);

      await this.updateJob(jobId, {
        sourceFileSize: BigInt(downloadSize),
        message: `Soubor stažen (${Math.round(downloadSize / 1024 / 1024)} MB)`,
        progressPct: 10,
      });
      await this.appendLog(jobId, 'download', `Soubor stažen: ${file.filename}, ${downloadSize} B`);

      if (this.cancelRequested) throw new Error('Zrušeno uživatelem');

      await this.updateJob(jobId, {
        status: RUIAN_JOB_STATUS.EXTRACTING,
        phase: 'extract',
        message: 'Rozbaluji archiv…',
        progressPct: 15,
      });

      const dataFiles = await extractAllVfrDataFiles(zipPath, workDir, (msg, m) => {
        this.log.log(`[${jobId}] ${msg} ${m ? JSON.stringify(m) : ''}`);
      }, 0, async (msg, m) => {
        await this.appendLog(jobId, 'extract', msg, m);
      });

      await this.updateJob(jobId, {
        message: `Archiv rozbalen — ${dataFiles.length} XML/GML souborů`,
        progressPct: 20,
      });
      await this.appendLog(jobId, 'extract', `Nalezeno ${dataFiles.length} XML souborů`, {
        files: dataFiles.map((f) => ({ name: f.archivePath, sizeMb: Math.round(f.size / 1024 / 1024), ext: f.ext })),
      });

      if (!dataFiles.length) throw new Error('Archiv neobsahuje XML/GML soubory.');

      let totalInserted = 0;
      let totalUpdated = 0;
      let totalSkipped = 0;
      let totalParsed = 0;
      let totalErrors = 0;
      const stats: Record<string, number> = {};
      const preview: Array<{ officialCode: string; name: string; districtOfficialCode?: string | null; regionOfficialCode?: string | null }> = [];

      for (const dataFile of dataFiles) {
        if (this.cancelRequested) throw new Error('Zrušeno uživatelem');

        const fileSize = dataFile.size;
        await this.updateJob(jobId, {
          status: RUIAN_JOB_STATUS.PARSING,
          phase: 'parse',
          currentFile: dataFile.archivePath,
          totalBytes: BigInt(fileSize),
          bytesRead: BigInt(0),
          message: `Parsuji ${dataFile.archivePath} (${Math.round(fileSize / 1024 / 1024)} MB)`,
        });
        await this.appendLog(jobId, 'parse_start', `Začínám parser: ${dataFile.archivePath}`);

        const parseResult = await streamParseVfrXmlFile(
          dataFile.absolutePath,
          async (rows) => {
            totalParsed += rows.length;

            if (dryRun) {
              for (const r of rows) {
                if (preview.length < (testLimit ?? 100)) {
                  preview.push({
                    officialCode: r.officialCode,
                    name: r.name,
                    districtOfficialCode: r.districtOfficialCode,
                    regionOfficialCode: r.regionOfficialCode,
                  });
                }
              }
              return;
            }

            await this.updateJob(jobId, { status: RUIAN_JOB_STATUS.SAVING, phase: 'save', message: 'Ukládám dávku do DB…' });
            const res = await this.locations.importVfrBatch(rows, {
              sourceId: job.sourceId ?? undefined,
              dataSource: 'RUIAN',
              existingRunId: jobId,
            });
            totalInserted += res.inserted;
            totalUpdated += res.updated;
            totalSkipped += res.skipped;
            totalErrors += res.errorCount;

            await this.updateJob(jobId, {
              totalRows: totalParsed,
              inserted: totalInserted,
              updated: totalUpdated,
              skipped: totalSkipped,
              errorCount: totalErrors,
              lastCheckpointAt: new Date(),
            });
            await this.updateJobMeta(jobId, {
              checkpoint: { parsedRecords: totalParsed, memoryMb: memoryMb() } satisfies RuianJobCheckpoint,
            });
          },
          {
            batchSize: RUIAN_BATCH_SIZE,
            allowedElementTypes: allowedElements,
            skipGeometry: scope === RUIAN_IMPORT_SCOPE.SEO,
            maxRecords: testLimit,
            filterElementType: testLimit ? 'Obec' : undefined,
            onBytesRead: (read, total) => {
              const pct = 20 + (read / Math.max(total, 1)) * 75;
              void this.updateJobMeta(jobId, { memoryMb: memoryMb() });
              void this.updateJob(jobId, {
                bytesRead: BigInt(read),
                totalBytes: BigInt(total),
                progressPct: Math.min(95, pct),
                message: `Parsování ${dataFile.archivePath}: ${Math.round(read / 1024 / 1024)} / ${Math.round(total / 1024 / 1024)} MB`,
              });
            },
            shouldStop: () => this.cancelRequested,
          },
        );

        for (const [k, v] of Object.entries(parseResult.stats)) {
          stats[k] = (stats[k] ?? 0) + (v ?? 0);
        }

        await this.appendLog(jobId, 'parse_done', `Parser dokončen — obce ${parseResult.diagnostics.parsedMunicipalities}, přeskočeno elementů ${parseResult.diagnostics.skippedElements}`, {
          diagnostics: parseResult.diagnostics,
          bytesRead: parseResult.bytesRead,
        });

        if (testLimit && totalParsed >= testLimit) break;
      }

      if (dryRun) {
        await this.finishJob(jobId, {
          status: RUIAN_JOB_STATUS.COMPLETED,
          message: `Test: ${preview.length} obcí`,
          progressPct: 100,
          logJson: { stats },
        });
        await this.updateJobMeta(jobId, { preview, xmlFiles: dataFiles.length, dryRun: true });
        return;
      }

      const validation = validateVfrImportResult({
        parsed: totalParsed,
        inserted: totalInserted,
        updated: totalUpdated,
        skipped: totalSkipped,
      });

      if (!validation.ok) {
        await this.failJob(jobId, validation.error, validation.status, 'parse');
        return;
      }

      await this.finishJob(jobId, {
        status: RUIAN_JOB_STATUS.COMPLETED,
        message: `Hotovo — +${totalInserted} nových, ${totalUpdated} aktualizovaných`,
        progressPct: 100,
        totalRows: totalParsed,
        inserted: totalInserted,
        updated: totalUpdated,
        logJson: { stats },
      });

      const source = await this.prisma.seoLocationSource.findFirst({ where: { type: 'RUIAN' } });
      if (source) {
        await this.prisma.seoLocationSource.update({
          where: { id: source.id },
          data: {
            lastStatus: 'ok',
            lastSyncAt: new Date(),
            lastError: null,
            importedCount: { increment: totalInserted },
            updatedCount: { increment: totalUpdated },
            configJson: {
              ...((source.configJson as object) ?? {}),
              vfr: { stats, progressPct: 100, lastImportedFile: file.filename },
            } as Prisma.InputJsonValue,
          },
        });
      }
    } catch (err) {
      const info = formatRuianVfrError(err);
      const jobNow = await this.prisma.seoLocationImportRun.findUnique({ where: { id: jobId } });
      const phase = jobNow?.phase ?? 'unknown';
      const bytes = jobNow?.bytesRead?.toString() ?? '0';
      const total = jobNow?.totalBytes?.toString() ?? '?';
      const msg = `Worker selhal během fáze ${phase}. Přečteno ${bytes} / ${total} B. RAM ${memoryMb()} MB. ${info.userMessage}`;
      await this.failJob(jobId, msg, RUIAN_JOB_STATUS.FAILED, phase, info.code, err);
    } finally {
      cleanupRuianJobWorkDir(jobId);
    }
  }

  private async heartbeat(jobId: string): Promise<void> {
    await this.updateJobMeta(jobId, { memoryMb: memoryMb(), pid: process.pid });
    await this.prisma.seoLocationImportRun.update({
      where: { id: jobId },
      data: { heartbeatAt: new Date() },
    });
  }

  private async updateJobMeta(jobId: string, patch: Record<string, unknown>): Promise<void> {
    const job = await this.prisma.seoLocationImportRun.findUnique({
      where: { id: jobId },
      select: { jobMeta: true },
    });
    const current = (job?.jobMeta ?? {}) as Record<string, unknown>;
    await this.prisma.seoLocationImportRun.update({
      where: { id: jobId },
      data: { jobMeta: { ...current, ...patch } as Prisma.InputJsonValue },
    });
  }

  private async recoverStaleJobs(): Promise<void> {
    const staleBefore = new Date(Date.now() - RUIAN_STALE_JOB_MS);
    const stale = await this.prisma.seoLocationImportRun.findMany({
      where: {
        sourceLabel: 'RUIAN_VFR',
        status: {
          in: [
            RUIAN_JOB_STATUS.DISCOVERING,
            RUIAN_JOB_STATUS.DOWNLOADING,
            RUIAN_JOB_STATUS.EXTRACTING,
            RUIAN_JOB_STATUS.PARSING,
            RUIAN_JOB_STATUS.SAVING,
          ],
        },
        OR: [{ heartbeatAt: { lt: staleBefore } }, { heartbeatAt: null }],
      },
    });
    for (const job of stale) {
      await this.prisma.seoLocationImportRun.update({
        where: { id: job.id },
        data: {
          status: RUIAN_JOB_STATUS.INTERRUPTED,
          message: `Job přerušen (heartbeat starší než ${RUIAN_STALE_JOB_MS / 1000}s). Lze obnovit.`,
          finishedAt: new Date(),
        },
      });
    }
  }

  private async handleProcessCrash(kind: string, err: unknown): Promise<void> {
    if (!this.activeJobId) return;
    const info = formatRuianVfrError(err);
    await this.failJob(
      this.activeJobId,
      `Proces spadl (${kind}): ${info.userMessage}`,
      RUIAN_JOB_STATUS.INTERRUPTED,
      'crash',
      kind,
      err,
    );
  }

  private async updateJob(jobId: string, data: Prisma.SeoLocationImportRunUpdateInput): Promise<void> {
    await this.prisma.seoLocationImportRun.update({ where: { id: jobId }, data });
  }

  private async appendLog(
    jobId: string,
    step: string,
    message: string,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    const job = await this.prisma.seoLocationImportRun.findUnique({ where: { id: jobId }, select: { jobMeta: true } });
    const metaObj = (job?.jobMeta ?? {}) as { logs?: RuianJobLogEntry[] };
    const logs = metaObj.logs ?? [];
    logs.push({ at: new Date().toISOString(), level: 'info', step, message, meta });
    if (logs.length > 500) logs.splice(0, logs.length - 500);
    await this.prisma.seoLocationImportRun.update({
      where: { id: jobId },
      data: { jobMeta: { ...metaObj, logs } as Prisma.InputJsonValue, message },
    });
  }

  private async finishJob(jobId: string, data: Prisma.SeoLocationImportRunUpdateInput): Promise<void> {
    await this.prisma.seoLocationImportRun.update({
      where: { id: jobId },
      data: { ...data, finishedAt: new Date(), heartbeatAt: new Date() },
    });
  }

  private async failJob(
    jobId: string,
    errorMessage: string,
    status: string,
    phase: string,
    errorCode?: string,
    err?: unknown,
  ): Promise<void> {
    const stack = err instanceof Error ? err.stack : undefined;
    await this.prisma.seoLocationImportRun.update({
      where: { id: jobId },
      data: {
        status,
        phase,
        errorMessage,
        errorCode: errorCode ?? 'IMPORT_ERROR',
        errorStackMasked: maskStack(stack),
        message: errorMessage,
        finishedAt: new Date(),
      },
    });
    await this.updateJobMeta(jobId, { memoryMb: memoryMb() });
    const source = await this.prisma.seoLocationSource.findFirst({ where: { type: 'RUIAN' } });
    if (source) {
      await this.prisma.seoLocationSource.update({
        where: { id: source.id },
        data: { lastStatus: 'error', lastError: errorMessage },
      });
    }
  }
}
