import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaService } from '../../database/prisma.service';
import { discoverRuianVfrFile, type RuianVfrFileRef } from './ruian-vfr.discovery';
import { formatRuianVfrError, ruianVfrFail, ruianVfrOk, validateVfrImportResult } from './ruian-vfr.errors';
import { extractAllVfrDataFiles, validateDownloadedFile } from './ruian-vfr.archive';
import {
  cleanupDir,
  createRuianWorkDir,
  downloadToFile,
  verifyRemoteFileHead,
  type DownloadLogFn,
} from './ruian-vfr.io';
import {
  mapElementToPhase,
  RuianVfrImportSession,
  type RuianVfrLogEntry,
} from './ruian-vfr.import-session';
import {
  RUIAN_VFR_DAILY_ATOM_URL,
  RUIAN_VFR_MONTHLY_BASE_URL,
  type RuianVfrConnectorConfig,
} from './ruian-vfr.official.constants';
import { streamParseVfrXmlFile, type VfrParseDiagnostics } from './ruian-vfr.stream-parser';
import { SeoLocationSourceService } from './seo-location-source.service';
import { SeoLocationService } from './seo-location.service';
import type { SeoLocationImportRow } from './seo-location.util';

@Injectable()
export class RuianVfrService {
  private readonly log = new Logger(RuianVfrService.name);
  private running = false;
  private activeSession: RuianVfrImportSession | null = null;
  private lastJobResult: Record<string, unknown> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: SeoLocationService,
    private readonly sourceService: SeoLocationSourceService,
  ) {}

  isRunning(): boolean {
    return this.running;
  }

  getPublicStatus() {
    const session = this.activeSession?.snapshot() ?? null;
    const last = this.lastJobResult;
    return {
      running: this.running,
      progressPct: session?.progressPct ?? (last?.progressPct as number) ?? 0,
      currentStep: session?.currentStep ?? (last?.currentStep as string) ?? (this.running ? 'Import probíhá…' : 'Neaktivní'),
      currentPhase: session?.currentPhase ?? (last?.step as string) ?? null,
      runId: session?.runId ?? null,
      lastJobSuccess: last?.success ?? null,
      lastJobError: last?.success === false ? (last.error as string) : null,
    };
  }

  async getImportLogs() {
    const live = this.activeSession?.snapshot() ?? null;
    const latest = await this.prisma.seoLocationImportRun.findFirst({
      where: { sourceLabel: 'RUIAN_VFR' },
      orderBy: { startedAt: 'desc' },
    });
    const persisted =
      latest?.logJson && typeof latest.logJson === 'object'
        ? (latest.logJson as { entries?: RuianVfrLogEntry[] })
        : null;
    return {
      running: this.running,
      live,
      latestRunId: latest?.id ?? null,
      entries: live?.entries ?? persisted?.entries ?? [],
      progressPct: live?.progressPct ?? latest?.progressPct ?? 0,
      currentStep: live?.currentStep ?? latest?.status ?? 'idle',
      lastJobResult: this.lastJobResult,
    };
  }

  async getStatus() {
    const source = await this.getRuianSource();
    const cfg = this.getVfrConfig(source);
    const live = this.activeSession?.snapshot();
    return {
      connector: 'RUIAN_VFR_OFFICIAL',
      apiKeyRequired: false,
      running: this.running,
      mode: cfg.mode ?? 'full',
      sourceUrl: RUIAN_VFR_MONTHLY_BASE_URL,
      dailyAtomUrl: RUIAN_VFR_DAILY_ATOM_URL,
      lastAvailableFile: cfg.lastAvailableFile ?? null,
      lastAvailableUrl: cfg.lastAvailableUrl ?? null,
      lastImportedFile: cfg.lastImportedFile ?? null,
      lastImportedVersion: cfg.lastImportedVersion ?? null,
      lastSyncAt: source?.lastSyncAt?.toISOString() ?? null,
      lastStatus: this.running ? 'syncing' : (source?.lastStatus ?? 'idle'),
      lastError: source?.lastError ?? null,
      progressPct: live?.progressPct ?? cfg.progressPct ?? 0,
      currentStep: live?.currentStep ?? null,
      stats: cfg.stats ?? {},
      provides: [
        'kraje',
        'okresy',
        'ORP',
        'POÚ',
        'obce',
        'části obcí',
        'městské části',
        'katastrální území',
        'ulice',
        'adresní místa',
        'souřadnice',
        'hierarchie parent-child',
      ],
    };
  }

  async discoverLatestSafe(mode: 'full' | 'delta' = 'full') {
    const session = new RuianVfrImportSession();
    try {
      await this.sourceService.ensureDefaultSources();
      session.log('discover', 'Hledám nejnovější stavový VFR soubor...');
      const file = await this.discoverLatest(mode);
      if (!file?.url) {
        return ruianVfrFail('Nebyl nalezen žádný stavový VFR soubor.', session.entries, 'FAILED');
      }
      session.log('verify', `Nalezen: ${file.filename} (${file.url})`);
      return ruianVfrOk({ file }, 'FILE_FOUND');
    } catch (err) {
      this.log.error(`discoverLatestSafe: ${formatRuianVfrError(err).message}`);
      return ruianVfrFail(err, session.entries);
    }
  }

  async runTestImportSafe(opts?: { limit?: number }) {
    if (this.running) {
      return ruianVfrFail('RÚIAN import již běží.', this.activeSession?.entries ?? []);
    }
    const session = new RuianVfrImportSession();
    this.activeSession = session;
    this.running = true;
    this.lastJobResult = null;
    const limit = opts?.limit ?? 100;

    this.scheduleBackgroundJob(async () => {
      let workDir: string | null = null;
      try {
        await this.sourceService.ensureDefaultSources();
        const source = await this.getRuianSource();
        const cfg = this.getVfrConfig(source);
        session.log('discover', 'Test importu — hledám stavový soubor...');
        await this.persistSessionToSource(session);

        const file = await this.resolveVfrFile('full', cfg, session);
        if (!file?.url) {
          throw Object.assign(new Error('Nebyl nalezen žádný stavový VFR soubor.'), { userMessage: 'Nebyl nalezen žádný stavový VFR soubor.' });
        }

        workDir = createRuianWorkDir();
        const ioLog = this.bindSessionLog(session);
        const zipPath = path.join(workDir, file.filename);
        session.log('download', `Stahuji ${file.filename}...`);
        await this.persistSessionToSource(session);
        await downloadToFile(file.url, zipPath, 300000, ioLog);
        validateDownloadedFile(zipPath);
        session.log('download', `Soubor stažen (${file.filename})`);
        await this.persistSessionToSource(session);

        const preview: SeoLocationImportRow[] = [];
        const result = await this.processZipAtPath(zipPath, workDir, 'full', file.filename, 0, session, {
          dryRun: true,
          maxRecords: limit,
          filterElementType: 'Obec',
          onPreview: (rows) => preview.push(...rows),
        });

        session.log('done', `Test: ${preview.length} obcí připraveno k náhledu.`);
        await this.persistSessionToSource(session);

        if (preview.length === 0) {
          this.lastJobResult = {
            success: false,
            status: 'EMPTY_IMPORT',
            step: session.currentPhase,
            error: 'Import nenašel žádné zpracovatelné záznamy.',
            xmlFiles: result.xmlFileCount,
            parsedMunicipalities: result.diagnostics.parsedMunicipalities,
            logs: session.entries,
          };
          return;
        }

        this.lastJobResult = {
          success: true,
          status: 'COMPLETED',
          dryRun: true,
          xmlFiles: result.xmlFileCount,
          parsedMunicipalities: result.diagnostics.parsedMunicipalities,
          preview: preview.slice(0, limit),
          diagnostics: result.diagnostics,
          file: { url: file.url, filename: file.filename, version: file.version },
          logs: session.entries,
          progressPct: 100,
          currentStep: 'Hotovo',
        };
      } catch (err) {
        session.logError(err);
        await this.persistSessionToSource(session);
        const info = formatRuianVfrError(err);
        this.lastJobResult = {
          success: false,
          status: 'FAILED',
          step: session.currentPhase,
          error: info.userMessage,
          detail: info.message,
          logs: session.entries,
        };
        await this.markSourceError(err);
      } finally {
        this.running = false;
        this.activeSession = null;
        if (workDir) cleanupDir(workDir);
      }
    });

    return ruianVfrOk(
      { started: true, running: true, message: 'Test import spuštěn na pozadí.', logs: session.entries },
      'RUNNING',
    );
  }

  async discoverLatest(mode: 'full' | 'delta' = 'full') {
    const file = await discoverRuianVfrFile(mode);
    const source = await this.getRuianSource();
    if (source && file) {
      const cfg = this.getVfrConfig(source);
      await this.prisma.seoLocationSource.update({
        where: { id: source.id },
        data: {
          configJson: {
            ...((source.configJson as object) ?? {}),
            vfr: {
              ...cfg,
              lastAvailableFile: file.filename,
              lastAvailableUrl: file.url,
              lastAvailableVersion: file.version,
            },
          } as Prisma.InputJsonValue,
        },
      });
    }
    return file;
  }

  async runFullImportSafe(opts?: { resume?: boolean }) {
    if (this.running) {
      return ruianVfrFail('RÚIAN import již běží.', this.activeSession?.entries ?? []);
    }
    const session = new RuianVfrImportSession();
    this.activeSession = session;
    this.running = true;
    this.lastJobResult = null;

    this.scheduleBackgroundJob(async () => {
      this.lastJobResult = await this.executeVfrImport('full', session, opts);
    });

    return ruianVfrOk(
      { started: true, running: true, message: 'Plný import spuštěn na pozadí.', logs: session.entries },
      'RUNNING',
    );
  }

  async syncDeltaChangesSafe() {
    if (this.running) {
      return ruianVfrFail('RÚIAN import již běží.', this.activeSession?.entries ?? []);
    }
    const session = new RuianVfrImportSession();
    this.activeSession = session;
    this.running = true;
    this.lastJobResult = null;

    this.scheduleBackgroundJob(async () => {
      this.lastJobResult = await this.executeVfrImport('delta', session);
    });

    return ruianVfrOk(
      { started: true, running: true, message: 'Synchronizace delty spuštěna na pozadí.', logs: session.entries },
      'RUNNING',
    );
  }

  async downloadDailyChangesSafe() {
    try {
      await this.sourceService.ensureDefaultSources();
      const session = new RuianVfrImportSession();
      session.log('discover', 'Načítám denní změnový soubor z ATOM feedu...');
      const file = await this.discoverLatest('delta');
      if (!file?.url) {
        return ruianVfrFail('Denní změnový soubor nenalezen v ATOM feedu.', session.entries);
      }
      session.log('verify', `Soubor nalezen: ${file.filename}`);
      const ioLog = this.bindSessionLog(session);
      const head = await verifyRemoteFileHead(file.url, 30000, ioLog);
      if (!head.ok) {
        return ruianVfrFail(head.userMessage ?? 'Soubor není dostupný.', session.entries);
      }
      session.log('download', 'Stahuji denní změny...');
      const workDir = createRuianWorkDir();
      const zipPath = path.join(workDir, file.filename);
      const size = await downloadToFile(file.url, zipPath, 300000, ioLog);
      const source = await this.getRuianSource();
      if (source) {
        const cfg = this.getVfrConfig(source);
        await this.prisma.seoLocationSource.update({
          where: { id: source.id },
          data: {
            configJson: {
              ...((source.configJson as object) ?? {}),
              vfr: {
                ...cfg,
                pendingDeltaFile: zipPath,
                pendingDeltaMeta: file,
              },
            } as Prisma.InputJsonValue,
          },
        });
      }
      session.log('done', `Staženo ${file.filename} (${size} B)`);
      return ruianVfrOk({
        downloaded: file.filename,
        size,
        logs: session.entries,
      });
    } catch (err) {
      this.log.error(`downloadDailyChangesSafe: ${formatRuianVfrError(err).message}`);
      return ruianVfrFail(err, this.activeSession?.entries ?? []);
    }
  }

  async importUploadedBufferSafe(buffer: Buffer, originalName: string) {
    if (this.running) {
      return ruianVfrFail('RÚIAN import již běží.', this.activeSession?.entries ?? []);
    }
    const session = new RuianVfrImportSession();
    this.activeSession = session;
    this.running = true;
    this.lastJobResult = null;

    this.scheduleBackgroundJob(async () => {
      let workDir: string | null = null;
      try {
        await this.sourceService.ensureDefaultSources();
        workDir = createRuianWorkDir();
        const zipPath = path.join(workDir, originalName);
        session.log('start', `Ruční upload: ${originalName}`);
        fs.writeFileSync(zipPath, buffer);
        session.log('verify', 'Soubor nahrán');
        await this.persistSessionToSource(session);

        const result = await this.processZipAtPath(zipPath, workDir, 'full', originalName, 0, session);
        const validation = validateVfrImportResult({
          parsed: result.total,
          inserted: result.inserted,
          updated: result.updated,
          skipped: result.skipped,
        });
        if (!validation.ok) {
          session.log('error', validation.error, 'error');
          await this.markSourceError(validation.error);
          this.lastJobResult = {
            success: false,
            status: validation.status,
            step: session.currentPhase,
            error: validation.error,
            logs: session.entries,
          };
          return;
        }
        session.log('done', 'Hotovo');
        this.lastJobResult = { success: true, ...result, logs: session.entries, progressPct: 100 };
      } catch (err) {
        session.logError(err);
        await this.markSourceError(err);
        const info = formatRuianVfrError(err);
        this.lastJobResult = {
          success: false,
          step: session.currentPhase,
          error: info.userMessage,
          detail: info.message,
          logs: session.entries,
        };
      } finally {
        this.running = false;
        this.activeSession = null;
        if (workDir) cleanupDir(workDir);
      }
    });

    return ruianVfrOk(
      { started: true, running: true, message: 'Ruční import spuštěn na pozadí.', logs: session.entries },
      'RUNNING',
    );
  }

  async runFullImport(opts?: { resume?: boolean }) {
    const res = await this.runFullImportSafe(opts);
    if (!res.success) {
      throw Object.assign(new Error(res.error), { userMessage: res.error });
    }
    return res;
  }

  async downloadDailyChanges() {
    const res = await this.downloadDailyChangesSafe();
    if (!res.success) throw Object.assign(new Error(res.error), { userMessage: res.error });
    return res;
  }

  async syncDeltaChanges() {
    const res = await this.syncDeltaChangesSafe();
    if (!res.success) throw Object.assign(new Error(res.error), { userMessage: res.error });
    return res;
  }

  async importUploadedBuffer(buffer: Buffer, originalName: string) {
    const res = await this.importUploadedBufferSafe(buffer, originalName);
    if (!res.success) throw Object.assign(new Error(res.error), { userMessage: res.error });
    return res;
  }

  private scheduleBackgroundJob(job: () => Promise<void>): void {
    setImmediate(() => {
      void job().catch((err) => {
        this.log.error(`Background VFR job failed: ${formatRuianVfrError(err).message}`);
        if (!this.lastJobResult) {
          this.lastJobResult = {
            success: false,
            error: formatRuianVfrError(err).userMessage,
            detail: formatRuianVfrError(err).message,
          };
        }
        this.running = false;
        this.activeSession = null;
      });
    });
  }

  private async executeVfrImport(
    mode: 'full' | 'delta',
    session: RuianVfrImportSession,
    opts?: { resume?: boolean },
  ): Promise<Record<string, unknown>> {
    let workDir: string | null = null;
    let sourceId: string | null = null;

    try {
      await this.sourceService.ensureDefaultSources();
      const source = await this.getRuianSource();
      if (!source) {
        return ruianVfrFail('RÚIAN zdroj nenalezen — zkuste obnovit stránku.', session.entries);
      }
      sourceId = source.id;

      await this.prisma.seoLocationSource.update({
        where: { id: source.id },
        data: { lastStatus: 'syncing', lastError: null },
      });

      const cfg = this.getVfrConfig(source);
      session.log('discover', 'Načítám stavový soubor...');
      await this.persistSessionToSource(session);

      let file: RuianVfrFileRef | null =
        mode === 'delta' && cfg.pendingDeltaMeta
          ? {
              url: cfg.pendingDeltaMeta.url,
              filename: cfg.pendingDeltaMeta.filename,
              kind: 'delta',
              version: cfg.pendingDeltaMeta.version,
              publishedAt: cfg.pendingDeltaMeta.publishedAt,
              datasetType: 'ST_ZZSG',
            }
          : await this.resolveVfrFile(mode, cfg, session);

      if (!file?.url) {
        return ruianVfrFail('Nebyl nalezen žádný stavový VFR soubor.', session.entries);
      }

      session.log('verify', `Soubor nalezen: ${file.filename}`);
      const ioLog = this.bindSessionLog(session);
      const head = await verifyRemoteFileHead(file.url, 30000, ioLog);
      if (!head.ok) {
        return ruianVfrFail(head.userMessage ?? 'Soubor není dostupný.', session.entries);
      }
      session.log('verify', `Soubor je dostupný — status ${head.status}, velikost ${head.contentLength ?? '?'}`);

      workDir = createRuianWorkDir();
      this.log.log(`RÚIAN VFR work dir: ${workDir}`);
      const zipPath = path.join(workDir, file.filename);

      if (!fs.existsSync(zipPath)) {
        session.log('download', 'Stahuji...');
        try {
          await downloadToFile(file.url, zipPath, 300000, ioLog);
          validateDownloadedFile(zipPath);
          session.log('download', 'Soubor stažen');
          await this.persistSessionToSource(session);
        } catch (err) {
          return ruianVfrFail(err, session.entries);
        }
      } else {
        session.log('download', 'Používám již stažený soubor');
        validateDownloadedFile(zipPath);
      }

      const result = await this.processZipAtPath(
        zipPath,
        workDir,
        mode,
        file.filename,
        opts?.resume ? cfg.checkpoint?.recordsProcessed ?? 0 : 0,
        session,
      );

      const validation = validateVfrImportResult({
        parsed: result.total,
        inserted: result.inserted,
        updated: result.updated,
        skipped: result.skipped,
      });
      if (!validation.ok) {
        session.log('error', validation.error, 'error');
        await this.prisma.seoLocationSource.update({
          where: { id: source.id },
          data: {
            lastStatus: 'empty_import',
            lastError: validation.error,
            lastSyncAt: new Date(),
            configJson: {
              ...((source.configJson as object) ?? {}),
              vfr: {
                ...cfg,
                mode,
                lastAvailableFile: file.filename,
                lastAvailableUrl: file.url,
                progressPct: 100,
                stats: result.stats,
              },
            } as Prisma.InputJsonValue,
          },
        });
        return ruianVfrFail(validation.error, session.entries, validation.status);
      }

      await this.prisma.seoLocationSource.update({
        where: { id: source.id },
        data: {
          lastStatus: result.errorCount ? 'error' : 'ok',
          lastSyncAt: new Date(),
          lastDataVersion: file.version,
          importedCount: { increment: result.inserted },
          updatedCount: { increment: result.updated },
          errorCount: { increment: result.errorCount },
          configJson: {
            ...((source.configJson as object) ?? {}),
            vfr: {
              ...cfg,
              mode,
              lastImportedFile: file.filename,
              lastImportedVersion: file.version,
              lastAvailableFile: file.filename,
              lastAvailableUrl: file.url,
              progressPct: 100,
              stats: result.stats,
              checkpoint: null,
              ...(mode === 'full' ? { lastFullSyncAt: new Date().toISOString() } : {}),
            },
          } as Prisma.InputJsonValue,
        },
      });

      session.log('done', 'Hotovo');
      return {
        success: true,
        ...result,
        progressPct: 100,
        currentStep: 'Hotovo',
        logs: session.entries,
        diagnostics: result.diagnostics,
      };
    } catch (err) {
      session.logError(err);
      this.log.error(`executeVfrImport: ${formatRuianVfrError(err).message}`, err instanceof Error ? err.stack : undefined);
      if (sourceId) await this.markSourceError(err, sourceId);
      if (session.runId) {
        await this.prisma.seoLocationImportRun.update({
          where: { id: session.runId },
          data: {
            status: 'failed',
            finishedAt: new Date(),
            logJson: session.toJson() as Prisma.InputJsonValue,
            errorCount: { increment: 1 },
            errors: [formatRuianVfrError(err).userMessage],
          },
        }).catch(() => undefined);
      }
      const info = formatRuianVfrError(err);
      return {
        success: false,
        step: session.currentPhase,
        error: info.userMessage,
        detail: info.message,
        code: info.code,
        logs: session.entries,
      };
    } finally {
      this.running = false;
      this.activeSession = null;
      if (workDir) cleanupDir(workDir);
    }
  }

  private async resolveVfrFile(
    mode: 'full' | 'delta',
    cfg: RuianVfrConnectorConfig,
    session: RuianVfrImportSession,
  ): Promise<RuianVfrFileRef | null> {
    if (mode === 'full' && cfg.lastAvailableUrl && cfg.lastAvailableFile) {
      session.log('discover', `Používám uložený soubor: ${cfg.lastAvailableFile}`);
      return {
        url: cfg.lastAvailableUrl,
        filename: cfg.lastAvailableFile,
        kind: 'full',
        version: cfg.lastImportedVersion ?? cfg.lastAvailableFile.slice(0, 6),
        datasetType: 'ST_UKSG',
      };
    }
    session.log('discover', 'Vyhledávám nejnovější soubor na ČÚZK...');
    const file = await discoverRuianVfrFile(mode);
    if (file) {
      const source = await this.getRuianSource();
      if (source) {
        await this.prisma.seoLocationSource.update({
          where: { id: source.id },
          data: {
            configJson: {
              ...((source.configJson as object) ?? {}),
              vfr: {
                ...cfg,
                lastAvailableFile: file.filename,
                lastAvailableUrl: file.url,
                lastAvailableVersion: file.version,
              },
            } as Prisma.InputJsonValue,
          },
        });
      }
    }
    return file;
  }

  private async processZipAtPath(
    zipPath: string,
    workDir: string,
    mode: 'full' | 'delta',
    filename: string,
    skipUntil: number,
    session: RuianVfrImportSession,
    opts?: {
      dryRun?: boolean;
      maxRecords?: number;
      filterElementType?: string;
      onPreview?: (rows: SeoLocationImportRow[]) => void;
    },
  ) {
    session.log('extract', 'Rozbaluji archiv...');
    await this.persistSessionToSource(session);
    const ioLog = this.bindSessionLog(session);
    const dataFiles = await extractAllVfrDataFiles(
      zipPath,
      workDir,
      ioLog,
      0,
      async (message, meta) => {
        if (message.includes('Vyhledávám')) {
          session.log('scan_xml', message, 'info', meta);
        } else {
          session.log('extract', message, 'info', meta);
        }
        await this.persistSessionToSource(session);
      },
    );
    this.log.log(`RÚIAN VFR: ${dataFiles.length} datových souborů v archivu`);
    session.log(
      'extract',
      `Nalezeno ${dataFiles.length} XML/GML souborů`,
      'info',
      {
        count: dataFiles.length,
        files: dataFiles.map((f) => ({
          name: f.archivePath,
          size: f.size,
          ext: f.ext,
          sizeMb: Math.round((f.size / 1024 / 1024) * 10) / 10,
        })),
      },
    );
    await this.persistSessionToSource(session);

    const source = await this.getRuianSource();
    let runId: string | null = null;
    if (!opts?.dryRun) {
      const run = await this.prisma.seoLocationImportRun.create({
        data: {
          sourceId: source?.id,
          status: 'running',
          mode: mode === 'delta' ? 'delta' : 'full',
          sourceLabel: 'RUIAN_VFR',
          filename,
          totalRows: 0,
          logJson: session.toJson({ dataFiles: dataFiles.map((f) => f.archivePath), mode }) as Prisma.InputJsonValue,
        },
      });
      runId = run.id;
      session.runId = run.id;
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let errorCount = 0;
    const errors: string[] = [];
    let processed = 0;
    let totalParsed = 0;
    let stats: Record<string, number> = {};
    const diagnostics: VfrParseDiagnostics = {
      parsedRegions: 0,
      parsedDistricts: 0,
      parsedOrp: 0,
      parsedMunicipalities: 0,
      parsedMunicipalityParts: 0,
      parsedCadastralAreas: 0,
      parsedStreets: 0,
      parsedAddressPlaces: 0,
      parseErrors: [],
    };
    const buffer: SeoLocationImportRow[] = [];
    let lastPhase: string | null = null;

    const persistProgress = async () => {
      if (!runId) return;
      await this.prisma.seoLocationImportRun.update({
        where: { id: runId },
        data: {
          progressPct: session.progressPct,
          inserted,
          updated,
          errorCount,
          logJson: session.toJson({ stats, diagnostics, mode, processed, totalParsed }) as Prisma.InputJsonValue,
        },
      });
      if (source) {
        const cfg = this.getVfrConfig(source);
        await this.prisma.seoLocationSource.update({
          where: { id: source.id },
          data: {
            configJson: {
              ...((source.configJson as object) ?? {}),
              vfr: {
                ...cfg,
                progressPct: session.progressPct,
                currentStep: session.currentStep,
                stats,
              },
            } as Prisma.InputJsonValue,
          },
        });
      }
    };

    const flushBuffer = async () => {
      if (!buffer.length) return;
      const chunk = buffer.splice(0, buffer.length);
      if (opts?.dryRun) {
        opts.onPreview?.(chunk);
        processed += chunk.length;
        return;
      }
      session.log('save_db', `Ukládám do DB… (${chunk.length} záznamů)`);
      try {
        const res = await this.locations.importLocations(chunk, 'RUIAN_VFR', {
          sourceId: source?.id,
          dataSource: 'RUIAN',
          filename,
          skipRunCreation: true,
          existingRunId: runId ?? undefined,
        });
        inserted += res.inserted;
        updated += res.updated;
        skipped += res.skipped;
        errorCount += res.errorCount;
        if (res.errors.length) {
          errors.push(...res.errors.slice(0, 5));
          if (res.errorCount > 0) {
            session.log('save_db', `Varování: ${res.errorCount} chyb při ukládání`, 'warn');
          }
        }
      } catch (e) {
        errorCount += 1;
        const msg = e instanceof Error ? e.message : String(e);
        const prismaDetail =
          e && typeof e === 'object' && 'meta' in e ? JSON.stringify((e as { meta?: unknown }).meta) : '';
        errors.push(msg);
        session.log(
          'save_db',
          `Prisma chyba při ukládání: ${msg}${prismaDetail ? ` — ${prismaDetail}` : ''}`,
          'error',
          { prismaError: msg, detail: prismaDetail },
        );
        await this.persistSessionToSource(session);
        throw Object.assign(new Error('Nepodařilo se uložit data do databáze.'), {
          code: 'PRISMA_ERROR',
          userMessage: `Nepodařilo se uložit data do databáze: ${msg}`,
          detail: msg,
        });
      }
    };

    try {
      session.log('parse_start', 'Začínám parser...');
      await this.persistSessionToSource(session);

      for (const dataFile of dataFiles) {
        session.log('parse_obce', `Parsuji ${dataFile.archivePath} (${dataFile.ext}, ${Math.round(dataFile.size / 1024 / 1024)} MB)…`);
        await this.persistSessionToSource(session);
        const parseResult = await streamParseVfrXmlFile(
          dataFile.absolutePath,
          async (rows, parseStats, diag) => {
            for (const [key, val] of Object.entries(parseStats)) {
              if (val && val > 0) {
                const el =
                  key === 'kraje'
                    ? 'Kraj'
                    : key === 'okresy'
                      ? 'Okres'
                      : key === 'obce'
                        ? 'Obec'
                        : null;
                if (el) {
                  const phase = mapElementToPhase(el);
                  if (phase && phase !== lastPhase) {
                    lastPhase = phase;
                    session.log(phase);
                  }
                }
              }
            }

            diagnostics.parsedRegions += diag.parsedRegions;
            diagnostics.parsedDistricts += diag.parsedDistricts;
            diagnostics.parsedOrp += diag.parsedOrp;
            diagnostics.parsedMunicipalities += diag.parsedMunicipalities;
            diagnostics.parsedMunicipalityParts += diag.parsedMunicipalityParts;
            diagnostics.parsedCadastralAreas += diag.parsedCadastralAreas;
            diagnostics.parsedStreets += diag.parsedStreets;
            diagnostics.parsedAddressPlaces += diag.parsedAddressPlaces;
            if (diag.parseErrors.length) {
              diagnostics.parseErrors.push(...diag.parseErrors.slice(0, 20));
            }

            buffer.push(...rows);
            processed += rows.length;
            totalParsed += rows.length;
            if (buffer.length >= 500) {
              await flushBuffer();
            }

            const parseProgress = Math.min(74, 25 + Math.floor((processed / Math.max(processed + 5000, 1)) * 50));
            session.setProgress(parseProgress, session.currentStep);
            await persistProgress();
          },
          {
            batchSize: 500,
            skipUntil,
            maxRecords: opts?.maxRecords,
            filterElementType: opts?.filterElementType,
            onElement: (elementType) => {
              const phase = mapElementToPhase(elementType);
              if (phase && phase !== lastPhase) {
                lastPhase = phase;
                session.log(phase);
              }
            },
          },
        );

        for (const [k, v] of Object.entries(parseResult.stats)) {
          stats[k] = (stats[k] ?? 0) + (v ?? 0);
        }
        totalParsed = Object.values(stats).reduce((a, b) => a + (b ?? 0), 0);

        if (opts?.maxRecords != null && processed >= opts.maxRecords) break;
      }

      session.log(
        'parse_done',
        `Parser dokončen — ${this.formatDiagnostics(diagnostics)}`,
        'info',
        { diagnostics, stats },
      );
      await this.persistSessionToSource(session);

      if (!opts?.dryRun) {
        session.log('save_db', 'Začínám ukládat do DB');
        await this.persistSessionToSource(session);
      }
      await flushBuffer();

      if (runId) {
        await this.prisma.seoLocationImportRun.update({
          where: { id: runId },
          data: {
            status: errorCount ? 'completed_with_errors' : 'completed',
            totalRows: totalParsed,
            inserted,
            updated,
            errorCount,
            errors: errors.slice(0, 50),
            progressPct: 100,
            finishedAt: new Date(),
            logJson: session.toJson({ stats, diagnostics, mode, processed, totalParsed }) as Prisma.InputJsonValue,
          },
        });
      }

      return {
        runId,
        inserted,
        updated,
        skipped,
        errorCount,
        errors,
        stats,
        total: totalParsed,
        diagnostics,
        xmlFileCount: dataFiles.length,
        progressPct: 100,
      };
    } catch (err) {
      if (runId) {
        await this.prisma.seoLocationImportRun.update({
          where: { id: runId },
          data: {
            status: 'failed',
            errorCount: errorCount + 1,
            errors: [...errors, formatRuianVfrError(err).userMessage].slice(0, 50),
            finishedAt: new Date(),
            logJson: session.toJson({ stats, diagnostics, mode, processed, failed: true }) as Prisma.InputJsonValue,
          },
        });
      }
      throw err;
    }
  }

  private async markSourceError(err: unknown, sourceId?: string) {
    const info = formatRuianVfrError(err);
    const id =
      sourceId ??
      (await this.prisma.seoLocationSource.findFirst({ where: { type: 'RUIAN' }, select: { id: true } }))?.id;
    if (!id) return;
    await this.prisma.seoLocationSource.update({
      where: { id },
      data: { lastStatus: 'error', lastError: info.userMessage },
    });
  }

  private async getRuianSource() {
    await this.sourceService.ensureDefaultSources();
    return this.prisma.seoLocationSource.findFirst({ where: { type: 'RUIAN' } });
  }

  private getVfrConfig(source: { configJson: unknown } | null): RuianVfrConnectorConfig {
    const cfg = (source?.configJson ?? {}) as { vfr?: RuianVfrConnectorConfig };
    return cfg.vfr ?? { mode: 'full' };
  }

  private formatDiagnostics(diag: VfrParseDiagnostics): string {
    return [
      `kraje ${diag.parsedRegions}`,
      `okresy ${diag.parsedDistricts}`,
      `ORP ${diag.parsedOrp}`,
      `obce ${diag.parsedMunicipalities}`,
      `části obcí ${diag.parsedMunicipalityParts}`,
      `katastry ${diag.parsedCadastralAreas}`,
      `ulice ${diag.parsedStreets}`,
      `adresní místa ${diag.parsedAddressPlaces}`,
    ].join(', ');
  }

  private async persistSessionToSource(session: RuianVfrImportSession): Promise<void> {
    const source = await this.getRuianSource();
    if (!source) return;
    const cfg = this.getVfrConfig(source);
    await this.prisma.seoLocationSource.update({
      where: { id: source.id },
      data: {
        configJson: {
          ...((source.configJson as object) ?? {}),
          vfr: {
            ...cfg,
            progressPct: session.progressPct,
            currentStep: session.currentStep,
          },
        } as Prisma.InputJsonValue,
      },
    });
  }

  /** Propojí IO logy s admin session + NestJS Logger + console (Railway). */
  private bindSessionLog(session: RuianVfrImportSession): DownloadLogFn {
    return (message: string, meta?: Record<string, unknown>) => {
      const line = meta ? `${message} ${JSON.stringify(meta)}` : message;
      this.log.log(`RÚIAN VFR: ${line}`);
      console.log(`[RUIAN VFR] ${line}`);
      if (message.includes('Začínám stahovat')) session.log('download', 'Začínám stahovat...');
      else if (message.includes('Soubor uložen')) session.log('download', `Soubor stažen (${meta?.bytes ?? '?'} B)`);
      else if (message.includes('ZIP rozbalen') || message.includes('Archiv rozbalen')) {
        void this.persistSessionToSource(session);
      } else if (message.includes('HEAD odpověď') && meta?.status) {
        session.log('verify', `Status ${meta.status}, velikost ${meta.contentLength ?? '?'}`);
      } else if (message.includes('Obsah archivu') || message.includes('Extrahován soubor')) {
        void this.persistSessionToSource(session);
      }
    };
  }
}
