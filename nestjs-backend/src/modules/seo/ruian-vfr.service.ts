import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaService } from '../../database/prisma.service';
import { discoverRuianVfrFile } from './ruian-vfr.discovery';
import { cleanupDir, createRuianWorkDir, downloadToFile, extractFirstXmlFromZip } from './ruian-vfr.io';
import {
  RUIAN_VFR_STATE_FILE_TOKEN,
  RUIAN_VFR_DAILY_ATOM_URL,
  RUIAN_VFR_MONTHLY_BASE_URL,
  type RuianVfrConnectorConfig,
} from './ruian-vfr.official.constants';
import { streamParseVfrXmlFile } from './ruian-vfr.stream-parser';
import { SeoLocationService } from './seo-location.service';
import type { SeoLocationImportRow } from './seo-location.util';

@Injectable()
export class RuianVfrService {
  private readonly log = new Logger(RuianVfrService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: SeoLocationService,
  ) {}

  isRunning(): boolean {
    return this.running;
  }

  async getStatus() {
    const source = await this.getRuianSource();
    const cfg = this.getVfrConfig(source);
    return {
      connector: 'RUIAN_VFR_OFFICIAL',
      apiKeyRequired: false,
      mode: cfg.mode ?? 'full',
      sourceUrl: RUIAN_VFR_MONTHLY_BASE_URL,
      dailyAtomUrl: RUIAN_VFR_DAILY_ATOM_URL,
      lastAvailableFile: cfg.lastAvailableFile ?? null,
      lastAvailableUrl: (cfg as { lastAvailableUrl?: string }).lastAvailableUrl ?? null,
      lastImportedFile: cfg.lastImportedFile ?? null,
      lastImportedVersion: cfg.lastImportedVersion ?? null,
      lastSyncAt: source?.lastSyncAt?.toISOString() ?? null,
      lastStatus: source?.lastStatus ?? 'idle',
      lastError: source?.lastError ?? null,
      progressPct: cfg.progressPct ?? 0,
      stats: cfg.stats ?? {},
      provides: [
        'kraje',
        'okresy',
        'ORP',
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

  async runFullImport(opts?: { resume?: boolean }) {
    return this.runVfrImport('full', opts);
  }

  async downloadDailyChanges() {
    const file = await this.discoverLatest('delta');
    if (!file) throw new Error('Denní změnový soubor nenalezen v ATOM feedu.');
    const workDir = createRuianWorkDir();
    const zipPath = path.join(workDir, file.filename);
    await downloadToFile(file.url, zipPath);
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
    return { downloaded: file.filename, path: zipPath, size: fs.statSync(zipPath).size };
  }

  async syncDeltaChanges() {
    return this.runVfrImport('delta');
  }

  async importUploadedZip(filePath: string, originalName: string) {
    const workDir = createRuianWorkDir();
    const zipPath = path.join(workDir, originalName);
    fs.copyFileSync(filePath, zipPath);
    return this.processZipAtPath(zipPath, workDir, 'full', originalName);
  }

  async importUploadedBuffer(buffer: Buffer, originalName: string) {
    const workDir = createRuianWorkDir();
    const zipPath = path.join(workDir, originalName);
    fs.writeFileSync(zipPath, buffer);
    try {
      return await this.processZipAtPath(zipPath, workDir, 'full', originalName);
    } finally {
      cleanupDir(workDir);
    }
  }

  private async runVfrImport(mode: 'full' | 'delta', opts?: { resume?: boolean }) {
    if (this.running) throw new Error('RÚIAN import již běží.');
    this.running = true;
    const source = await this.getRuianSource();
    if (!source) throw new Error('RÚIAN zdroj nenalezen.');

    const cfg = this.getVfrConfig(source);
    let file =
      mode === 'delta' && cfg.pendingDeltaMeta
        ? cfg.pendingDeltaMeta
        : await discoverRuianVfrFile(mode);

    if (!file?.url) {
      this.running = false;
      throw new Error('Oficiální VFR soubor nenalezen.');
    }

    const workDir = createRuianWorkDir();
    try {
      await this.prisma.seoLocationSource.update({
        where: { id: source.id },
        data: { lastStatus: 'syncing', lastError: null },
      });

      const zipPath = path.join(workDir, file.filename);
      if (!fs.existsSync(zipPath)) {
        await downloadToFile(file.url, zipPath);
      }
      const result = await this.processZipAtPath(
        zipPath,
        workDir,
        mode,
        file.filename,
        opts?.resume ? cfg.checkpoint?.recordsProcessed : 0,
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
              progressPct: 100,
              stats: result.stats,
              checkpoint: null,
              ...(mode === 'full' ? { lastFullSyncAt: new Date().toISOString() } : {}),
            },
          } as Prisma.InputJsonValue,
        },
      });

      return result;
    } catch (err) {
      await this.prisma.seoLocationSource.update({
        where: { id: source.id },
        data: {
          lastStatus: 'error',
          lastError: err instanceof Error ? err.message : String(err),
        },
      });
      throw err;
    } finally {
      this.running = false;
      cleanupDir(workDir);
    }
  }

  private async processZipAtPath(
    zipPath: string,
    workDir: string,
    mode: 'full' | 'delta',
    filename: string,
    skipUntil = 0,
  ) {
    const xmlPath = path.join(workDir, 'extracted.xml');
    const innerName = await extractFirstXmlFromZip(zipPath, xmlPath);
    this.log.log(`RÚIAN VFR: extrahováno ${innerName}`);

    const source = await this.getRuianSource();
    const run = await this.prisma.seoLocationImportRun.create({
      data: {
        sourceId: source?.id,
        status: 'running',
        mode: mode === 'delta' ? 'delta' : 'full',
        sourceLabel: 'RUIAN_VFR',
        filename,
        totalRows: 0,
      },
    });

    let inserted = 0;
    let updated = 0;
    let errorCount = 0;
    const errors: string[] = [];
    let processed = 0;
    let stats: Record<string, number> = {};

    const buffer: SeoLocationImportRow[] = [];

    const flushBuffer = async () => {
      if (!buffer.length) return;
      const chunk = buffer.splice(0, buffer.length);
      try {
        const res = await this.locations.importLocations(chunk, 'RUIAN_VFR', {
          sourceId: source?.id,
          dataSource: 'RUIAN',
          filename,
        });
        inserted += res.inserted;
        updated += res.updated;
        errorCount += res.errorCount;
        errors.push(...res.errors.slice(0, 5));
      } catch (e) {
        errorCount += 1;
        errors.push(e instanceof Error ? e.message : String(e));
      }
    };

    const parseResult = await streamParseVfrXmlFile(
      xmlPath,
      async (rows) => {
        buffer.push(...rows);
        processed += rows.length;
        if (buffer.length >= 500) await flushBuffer();
        if (source) {
          await this.prisma.seoLocationImportRun.update({
            where: { id: run.id },
            data: {
              progressPct: Math.min(99, processed / 1000),
              inserted,
              updated,
              errorCount,
            },
          });
        }
      },
      { batchSize: 500, skipUntil },
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
        logJson: { stats, innerName, mode } as Prisma.InputJsonValue,
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
    };
  }

  private async getRuianSource() {
    return this.prisma.seoLocationSource.findFirst({ where: { type: 'RUIAN' } });
  }

  private getVfrConfig(source: { configJson: unknown } | null): RuianVfrConnectorConfig {
    const cfg = (source?.configJson ?? {}) as { vfr?: RuianVfrConnectorConfig };
    return cfg.vfr ?? { mode: 'full' };
  }
}
