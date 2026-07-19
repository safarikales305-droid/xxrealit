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
    return {
      running: this.running,
      progressPct: session?.progressPct ?? 0,
      currentStep: session?.currentStep ?? (this.running ? 'Import probíhá…' : 'Neaktivní'),
      currentPhase: session?.currentPhase ?? null,
      runId: session?.runId ?? null,
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
    this.running = true;
    const session = new RuianVfrImportSession();
    this.activeSession = session;
    let workDir: string | null = null;
    const limit = opts?.limit ?? 100;

    try {
      await this.sourceService.ensureDefaultSources();
      const source = await this.getRuianSource();
      const cfg = this.getVfrConfig(source);
      session.log('discover', 'Test importu — hledám stavový soubor...');

      const file = await this.resolveVfrFile('full', cfg, session);
      if (!file?.url) {
        return ruianVfrFail('Nebyl nalezen žádný stavový VFR soubor.', session.entries);
      }

      workDir = createRuianWorkDir();
      const ioLog = this.bindSessionLog(session);
      const zipPath = path.join(workDir, file.filename);
      session.log('download', `Stahuji ${file.filename}...`);
      await downloadToFile(file.url, zipPath, 300000, ioLog);
      validateDownloadedFile(zipPath);

      const preview: SeoLocationImportRow[] = [];
      const diagnostics = await this.processZipAtPath(zipPath, workDir, 'full', file.filename, 0, session, {
        dryRun: true,
        maxRecords: limit,
        filterElementType: 'Obec',
        onPreview: (rows) => preview.push(...rows),
      });

      session.log('done', `Test: ${preview.length} obcí připraveno k náhledu.`);
      if (preview.length === 0) {
        return ruianVfrFail(
          'Import nenašel žádné zpracovatelné záznamy.',
          session.entries,
          'EMPTY_IMPORT',
        );
      }
      return ruianVfrOk(
        {
          dryRun: true,
          file: { url: file.url, filename: file.filename, version: file.version },
          preview: preview.slice(0, limit),
          diagnostics,
          logs: session.entries,
        },
        'COMPLETED',
      );
    } catch (err) {
      session.logError(err);
      return ruianVfrFail(err, session.entries);
    } finally {
      this.running = false;
      this.activeSession = null;
      if (workDir) cleanupDir(workDir);
    }
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
    return this.runVfrImportSafe('full', opts);
  }

  async syncDeltaChangesSafe() {
    return this.runVfrImportSafe('delta');
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
    this.running = true;
    const session = new RuianVfrImportSession();
    this.activeSession = session;
    const workDir = createRuianWorkDir();
    const zipPath = path.join(workDir, originalName);
    try {
      await this.sourceService.ensureDefaultSources();
      session.log('start', `Ruční upload: ${originalName}`);
      fs.writeFileSync(zipPath, buffer);
      session.log('verify', 'Soubor nahrán');
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
        return ruianVfrFail(validation.error, session.entries, validation.status);
      }
      session.log('done', 'Hotovo.');
      return ruianVfrOk({ ...result, logs: session.entries });
    } catch (err) {
      session.logError(err);
      await this.markSourceError(err);
      return ruianVfrFail(err, session.entries);
    } finally {
      this.running = false;
      this.activeSession = null;
      cleanupDir(workDir);
    }
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

  private async runVfrImportSafe(mode: 'full' | 'delta', opts?: { resume?: boolean }) {
    if (this.running) {
      return ruianVfrFail('RÚIAN import již běží.', this.activeSession?.entries ?? []);
    }

    this.running = true;
    const session = new RuianVfrImportSession();
    this.activeSession = session;
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

      session.log('done', 'Hotovo.');
      return ruianVfrOk({
        ...result,
        progressPct: 100,
        currentStep: 'Hotovo.',
        logs: session.entries,
        diagnostics: result.diagnostics,
      });
    } catch (err) {
      session.logError(err);
      this.log.error(`runVfrImportSafe: ${formatRuianVfrError(err).message}`, err instanceof Error ? err.stack : undefined);
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
      return ruianVfrFail(err, session.entries);
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
    const ioLog = this.bindSessionLog(session);
    const dataFiles = await extractAllVfrDataFiles(zipPath, workDir, ioLog);
    this.log.log(`RÚIAN VFR: ${dataFiles.length} datových souborů v archivu`);
    session.log('extract', `Nalezeno ${dataFiles.length} XML/GML souborů`);

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
        errors.push(msg);
        session.log('save_db', `Nepodařilo se uložit obec: ${msg}`, 'error');
        throw Object.assign(new Error('Nepodařilo se uložit data do databáze.'), {
          code: 'PRISMA_ERROR',
          userMessage: 'Nepodařilo se uložit obec.',
          detail: msg,
        });
      }
    };

    try {
      for (const dataFile of dataFiles) {
        session.log('parse_obce', `Parsuji ${dataFile.archivePath}…`);
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

  /** Propojí IO logy s admin session + NestJS Logger + console (Railway). */
  private bindSessionLog(session: RuianVfrImportSession): DownloadLogFn {
    return (message: string, meta?: Record<string, unknown>) => {
      const line = meta ? `${message} ${JSON.stringify(meta)}` : message;
      this.log.log(`RÚIAN VFR: ${line}`);
      console.log(`[RUIAN VFR] ${line}`);
      if (message.includes('Začínám stahovat')) session.log('download', 'Začínám stahovat...');
      else if (message.includes('Soubor uložen')) session.log('download', `Soubor uložen (${meta?.bytes ?? '?'} B)`);
      else if (message.includes('ZIP rozbalen')) session.log('extract', 'ZIP rozbalen');
      else if (message.includes('HEAD odpověď') && meta?.status) {
        session.log('verify', `Status ${meta.status}, velikost ${meta.contentLength ?? '?'}`);
      }
    };
  }
}
