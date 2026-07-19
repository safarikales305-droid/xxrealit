import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaService } from '../../database/prisma.service';
import { discoverRuianVfrFile } from './ruian-vfr.discovery';
import { formatRuianVfrError, ruianVfrFail, ruianVfrOk } from './ruian-vfr.errors';
import {
  cleanupDir,
  createRuianWorkDir,
  downloadToFile,
  extractFirstXmlFromZip,
  verifyRemoteFileHead,
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
import { streamParseVfrXmlFile } from './ruian-vfr.stream-parser';
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
    try {
      await this.sourceService.ensureDefaultSources();
      const file = await this.discoverLatest(mode);
      if (!file) {
        return ruianVfrFail('Oficiální VFR soubor nenalezen.', []);
      }
      return ruianVfrOk({ file });
    } catch (err) {
      this.log.error(`discoverLatestSafe: ${formatRuianVfrError(err).message}`);
      return ruianVfrFail(err, this.activeSession?.entries ?? []);
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
      const head = await verifyRemoteFileHead(file.url);
      if (!head.ok) {
        return ruianVfrFail(head.userMessage ?? 'Soubor není dostupný.', session.entries);
      }
      session.log('download', 'Stahuji denní změny...');
      const workDir = createRuianWorkDir();
      const zipPath = path.join(workDir, file.filename);
      const size = await downloadToFile(file.url, zipPath);
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

      let file =
        mode === 'delta' && cfg.pendingDeltaMeta
          ? cfg.pendingDeltaMeta
          : await discoverRuianVfrFile(mode);

      if (!file?.url) {
        return ruianVfrFail('Oficiální VFR soubor nenalezen.', session.entries);
      }

      session.log('verify', `Soubor nalezen: ${file.filename}`);
      const head = await verifyRemoteFileHead(file.url);
      if (!head.ok) {
        return ruianVfrFail(head.userMessage ?? 'Soubor není dostupný.', session.entries);
      }
      session.log('verify', 'Soubor je dostupný (HEAD OK)');

      workDir = createRuianWorkDir();
      const zipPath = path.join(workDir, file.filename);

      if (!fs.existsSync(zipPath)) {
        session.log('download', 'Stahuji...');
        try {
          await downloadToFile(file.url, zipPath);
        } catch (err) {
          return ruianVfrFail(err, session.entries);
        }
      } else {
        session.log('download', 'Používám již stažený soubor');
      }

      const result = await this.processZipAtPath(
        zipPath,
        workDir,
        mode,
        file.filename,
        opts?.resume ? cfg.checkpoint?.recordsProcessed ?? 0 : 0,
        session,
      );

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

  private async processZipAtPath(
    zipPath: string,
    workDir: string,
    mode: 'full' | 'delta',
    filename: string,
    skipUntil: number,
    session: RuianVfrImportSession,
  ) {
    const xmlPath = path.join(workDir, 'extracted.xml');
    let innerName: string;

    try {
      session.log('extract', 'Rozbaluji...');
      innerName = await extractFirstXmlFromZip(zipPath, xmlPath);
      this.log.log(`RÚIAN VFR: extrahováno ${innerName}`);
      session.log('extract', `Rozbaleno: ${innerName}`);
    } catch (err) {
      throw err;
    }

    const source = await this.getRuianSource();
    const run = await this.prisma.seoLocationImportRun.create({
      data: {
        sourceId: source?.id,
        status: 'running',
        mode: mode === 'delta' ? 'delta' : 'full',
        sourceLabel: 'RUIAN_VFR',
        filename,
        totalRows: 0,
        logJson: session.toJson({ innerName, mode }) as Prisma.InputJsonValue,
      },
    });
    session.runId = run.id;

    let inserted = 0;
    let updated = 0;
    let errorCount = 0;
    const errors: string[] = [];
    let processed = 0;
    let stats: Record<string, number> = {};
    const buffer: SeoLocationImportRow[] = [];
    let lastPhase: string | null = null;

    const persistProgress = async () => {
      await this.prisma.seoLocationImportRun.update({
        where: { id: run.id },
        data: {
          progressPct: session.progressPct,
          inserted,
          updated,
          errorCount,
          logJson: session.toJson({ stats, innerName, mode, processed }) as Prisma.InputJsonValue,
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
      session.log('save_db', `Ukládám do DB… (${chunk.length} záznamů)`);
      try {
        const res = await this.locations.importLocations(chunk, 'RUIAN_VFR', {
          sourceId: source?.id,
          dataSource: 'RUIAN',
          filename,
          skipRunCreation: true,
          existingRunId: run.id,
        });
        inserted += res.inserted;
        updated += res.updated;
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
      const parseResult = await streamParseVfrXmlFile(
        xmlPath,
        async (rows, parseStats) => {
          for (const [key, val] of Object.entries(parseStats)) {
            if (val && val > 0) {
              const el = key === 'kraje' ? 'Kraj' : key === 'okresy' ? 'Okres' : key === 'obce' ? 'Obec' : null;
              if (el) {
                const phase = mapElementToPhase(el);
                if (phase && phase !== lastPhase) {
                  lastPhase = phase;
                  session.log(phase);
                }
              }
            }
          }

          buffer.push(...rows);
          processed += rows.length;
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
          onElement: (elementType) => {
            const phase = mapElementToPhase(elementType);
            if (phase && phase !== lastPhase) {
              lastPhase = phase;
              session.log(phase);
            }
          },
        },
      );

      await flushBuffer();
      stats = parseResult.stats as Record<string, number>;

      await this.prisma.seoLocationImportRun.update({
        where: { id: run.id },
        data: {
          status: errorCount ? 'completed_with_errors' : 'completed',
          totalRows: parseResult.total,
          inserted,
          updated,
          errorCount,
          errors: errors.slice(0, 50),
          progressPct: 100,
          finishedAt: new Date(),
          logJson: session.toJson({ stats, innerName, mode, processed }) as Prisma.InputJsonValue,
        },
      });

      return {
        runId: run.id,
        inserted,
        updated,
        errorCount,
        errors,
        stats,
        total: parseResult.total,
        progressPct: 100,
      };
    } catch (err) {
      await this.prisma.seoLocationImportRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          errorCount: errorCount + 1,
          errors: [...errors, formatRuianVfrError(err).userMessage].slice(0, 50),
          finishedAt: new Date(),
          logJson: session.toJson({ stats, innerName, mode, processed, failed: true }) as Prisma.InputJsonValue,
        },
      });
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
}
