import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SeoLocationSourceType } from '@prisma/client';
import axios from 'axios';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaService } from '../../database/prisma.service';
import { getUploadsPath } from '../../lib/uploads-path';
import { parseUploadBuffer } from './seo-location-import.parser';
import {
  assertAllowedUpload,
  assertSafeRemoteUrl,
  detectFieldMapping,
  detectFormatFromFilename,
  TARGET_FIELDS,
} from './seo-location-import.util';
import { SeoLocationService } from './seo-location.service';
import type { SeoLocationImportRow } from './seo-location.util';
import { buildSeoLocationSlug, normalizeSeoLocationKind } from './seo-location.util';

const DEFAULT_SOURCES: Array<{
  type: SeoLocationSourceType;
  name: string;
  sourceUrl: string;
  fileType: string;
  configJson: Prisma.InputJsonValue;
}> = [
  {
    type: 'RUIAN',
    name: 'RÚIAN – Oficiální VFR',
    sourceUrl: 'https://services.cuzk.gov.cz/vfr',
    fileType: 'ZIP',
    configJson: {
      connector: 'RUIAN_VFR_OFFICIAL',
      apiKeyRequired: false,
      vfr: { mode: 'full', progressPct: 0, stats: {} },
      mapRestUrl: 'https://ags.cuzk.cz/arcgis/rest/services/RUIAN/MapServer',
    },
  },
  {
    type: 'CSU',
    name: 'ČSÚ – DataStat API',
    sourceUrl: 'https://data.csu.gov.cz/api/dotaz/v1',
    fileType: 'CSV',
    configJson: {
      connector: 'CSU_DATASTAT_OFFICIAL',
      apiKeyRequired: false,
      datastat: {
        baseUrl: 'https://data.csu.gov.cz/api/dotaz/v1',
        catalogUrl: 'https://data.csu.gov.cz/api/katalog/v1',
        datasetCode: 'OBY01',
        predefinedVyberCode: 'OBY01T1',
      },
    },
  },
];

export type UpdateSourceInput = {
  name?: string;
  sourceMode?: 'OFFICIAL_URL' | 'REMOTE_URL' | 'UPLOAD';
  sourceUrl?: string | null;
  fileType?: string | null;
  configJson?: Prisma.InputJsonValue;
  isEnabled?: boolean;
  autoSync?: boolean;
  syncIntervalMinutes?: number;
};

@Injectable()
export class SeoLocationSourceService {
  private readonly log = new Logger(SeoLocationSourceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: SeoLocationService,
  ) {}

  async ensureDefaultSources() {
    for (const def of DEFAULT_SOURCES) {
      const existing = await this.prisma.seoLocationSource.findFirst({
        where: { type: def.type },
      });
      if (!existing) {
        await this.prisma.seoLocationSource.create({
          data: {
            type: def.type,
            name: def.name,
            sourceMode: 'OFFICIAL_URL',
            sourceUrl: def.sourceUrl,
            fileType: def.fileType,
            configJson: def.configJson,
            autoSync: false,
            syncIntervalMinutes: def.type === 'RUIAN' ? 1440 : 43200,
          },
        });
      } else {
        await this.prisma.seoLocationSource.update({
          where: { id: existing.id },
          data: {
            name: def.name,
            sourceUrl: existing.sourceUrl ?? def.sourceUrl,
            configJson: {
              ...((existing.configJson as object) ?? {}),
              ...((def.configJson as object) ?? {}),
            },
          },
        });
      }
    }
  }

  async listSources() {
    await this.ensureDefaultSources();
    const sources = await this.prisma.seoLocationSource.findMany({
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      include: {
        fieldMappings: true,
        importRuns: { orderBy: { startedAt: 'desc' }, take: 1 },
      },
    });
    return sources.map((s) => this.toSourceCard(s));
  }

  async getSource(id: string) {
    const s = await this.prisma.seoLocationSource.findUnique({
      where: { id },
      include: { fieldMappings: true },
    });
    if (!s) throw new NotFoundException('Zdroj nenalezen.');
    return this.toSourceCard(s);
  }

  async updateSource(id: string, input: UpdateSourceInput) {
    const existing = await this.prisma.seoLocationSource.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Zdroj nenalezen.');
    if (input.sourceUrl) assertSafeRemoteUrl(input.sourceUrl);
    const updated = await this.prisma.seoLocationSource.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.sourceMode !== undefined ? { sourceMode: input.sourceMode } : {}),
        ...(input.sourceUrl !== undefined ? { sourceUrl: input.sourceUrl } : {}),
        ...(input.fileType !== undefined ? { fileType: input.fileType } : {}),
        ...(input.configJson !== undefined ? { configJson: input.configJson } : {}),
        ...(input.isEnabled !== undefined ? { isEnabled: input.isEnabled } : {}),
        ...(input.autoSync !== undefined ? { autoSync: input.autoSync } : {}),
        ...(input.syncIntervalMinutes !== undefined
          ? { syncIntervalMinutes: input.syncIntervalMinutes }
          : {}),
      },
      include: { fieldMappings: true, importRuns: { orderBy: { startedAt: 'desc' }, take: 1 } },
    });
    return this.toSourceCard(updated);
  }

  async deleteSource(id: string) {
    const s = await this.prisma.seoLocationSource.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Zdroj nenalezen.');
    if (s.type === 'RUIAN' || s.type === 'CSU') {
      throw new BadRequestException('Výchozí zdroj RÚIAN/ČSÚ nelze smazat — lze deaktivovat.');
    }
    await this.prisma.seoLocationSource.delete({ where: { id } });
    return { ok: true };
  }

  async saveFieldMappings(
    sourceId: string,
    mappings: Array<{ sourceField: string; targetField: string; isRequired?: boolean }>,
  ) {
    await this.prisma.seoLocationFieldMapping.deleteMany({ where: { sourceId } });
    if (mappings.length) {
      await this.prisma.seoLocationFieldMapping.createMany({
        data: mappings.map((m) => ({
          sourceId,
          sourceField: m.sourceField,
          targetField: m.targetField,
          isRequired: m.isRequired ?? false,
        })),
      });
    }
    return this.getSource(sourceId);
  }

  async testSource(sourceId: string) {
    const source = await this.prisma.seoLocationSource.findUnique({ where: { id: sourceId } });
    if (!source) throw new NotFoundException('Zdroj nenalezen.');
    if (!source.sourceUrl?.trim()) {
      return { ok: false, message: 'Není nastavena URL zdroje.' };
    }
    try {
      const url = assertSafeRemoteUrl(source.sourceUrl);
      const timeout =
        (source.configJson as { timeoutMs?: number } | null)?.timeoutMs ?? 60000;
      const res = await axios.head(url.toString(), {
        timeout,
        maxRedirects: 3,
        validateStatus: (s: number) => s < 500,
      });
      await this.prisma.seoLocationSource.update({
        where: { id: sourceId },
        data: {
          lastStatus: res.status < 400 ? 'ok' : 'error',
          lastEtag: String(res.headers.etag ?? ''),
          lastModified: String(res.headers['last-modified'] ?? ''),
          lastError: res.status >= 400 ? `HTTP ${res.status}` : null,
        },
      });
      return {
        ok: res.status < 400,
        status: res.status,
        etag: res.headers.etag ?? null,
        lastModified: res.headers['last-modified'] ?? null,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.prisma.seoLocationSource.update({
        where: { id: sourceId },
        data: { lastStatus: 'error', lastError: msg },
      });
      return { ok: false, message: msg };
    }
  }

  async uploadFile(
    file: Express.Multer.File,
    sourceId?: string,
  ) {
    assertAllowedUpload(file.originalname, file.mimetype, file.size);
    const dir = path.join(getUploadsPath(), 'seo-locations');
    fs.mkdirSync(dir, { recursive: true });
    const id = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const storagePath = path.join(dir, `${id}_${file.originalname}`);
    fs.writeFileSync(storagePath, file.buffer);

    const format = detectFormatFromFilename(file.originalname);
    const config = sourceId
      ? ((await this.prisma.seoLocationSource.findUnique({ where: { id: sourceId } }))
          ?.configJson as { csvDelimiter?: string; encoding?: string } | null)
      : null;

    const dataset = await parseUploadBuffer(file.buffer, format, {
      delimiter: config?.csvDelimiter ?? ';',
      encoding: config?.encoding ?? 'utf-8',
    });

    const validationErrors: string[] = [];
    const suggestedMapping = detectFieldMapping(dataset.headers);
    if (!Object.values(suggestedMapping).includes('officialCode')) {
      validationErrors.push('Chybí mapování povinného pole officialCode.');
    }
    if (!Object.values(suggestedMapping).includes('name')) {
      validationErrors.push('Chybí mapování povinného pole name.');
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const upload = await this.prisma.seoLocationUpload.create({
      data: {
        id,
        sourceId: sourceId ?? null,
        filename: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        storagePath,
        detectedFormat: format,
        rowCount: dataset.rows.length,
        previewJson: dataset.rows.slice(0, 20) as unknown as Prisma.InputJsonValue,
        validationErrors: validationErrors as unknown as Prisma.InputJsonValue,
        expiresAt,
      },
    });

    return {
      uploadId: upload.id,
      filename: upload.filename,
      size: upload.size,
      format,
      rowCount: dataset.rows.length,
      preview: dataset.rows.slice(0, 20),
      headers: dataset.headers,
      suggestedMapping,
      validationErrors,
    };
  }

  async previewImport(input: {
    sourceId?: string;
    uploadId?: string;
    mapping?: Record<string, string>;
    dryRun?: boolean;
  }) {
    const { dataset, source, mapping } = await this.resolveDataset(input);
    const rows = this.applyMapping(dataset.rows, mapping, source?.type);
    const validationErrors = this.validateRows(rows);

    const stats = await this.locations.importLocations(rows, source?.name ?? 'preview', {
      dryRun: true,
      sourceId: source?.id,
      dataSource: source?.type,
    });

    return {
      totalRows: rows.length,
      preview: rows.slice(0, 20),
      detectedFields: dataset.headers,
      mapping,
      validationErrors,
      stats: {
        inserted: stats.inserted,
        updated: stats.updated,
        skipped: stats.skipped,
        deactivated: stats.deactivated,
        errors: stats.errorCount,
      },
      dryRun: true,
    };
  }

  async runImport(input: {
    sourceId?: string;
    uploadId?: string;
    mapping?: Record<string, string>;
    dryRun?: boolean;
    syncScope?: 'all' | 'new' | 'changes';
    regionOfficialCode?: string;
    districtOfficialCode?: string;
  }) {
    const dryRun = input.dryRun ?? false;
    const { dataset, source, mapping, upload } = await this.resolveDataset(input);
    let rows = this.applyMapping(dataset.rows, mapping, source?.type);

    if (input.regionOfficialCode) {
      rows = rows.filter((r) => r.regionOfficialCode === input.regionOfficialCode);
    }
    if (input.districtOfficialCode) {
      rows = rows.filter((r) => r.districtOfficialCode === input.districtOfficialCode);
    }

    if (input.syncScope === 'new') {
      const codes = new Set(
        (
          await this.prisma.seoLocation.findMany({
            where: { officialCode: { in: rows.map((r) => r.officialCode) } },
            select: { officialCode: true },
          })
        ).map((r) => r.officialCode),
      );
      rows = rows.filter((r) => !codes.has(r.officialCode));
    }

    const validationErrors = this.validateRows(rows);
    if (validationErrors.length && validationErrors.some((e) => e.includes('officialCode'))) {
      throw new BadRequestException(validationErrors.join('; '));
    }

    if (source) {
      await this.prisma.seoLocationSource.update({
        where: { id: source.id },
        data: { lastStatus: 'syncing' },
      });
    }

    try {
      const result = await this.locations.importLocations(rows, source?.name ?? 'import', {
        dryRun,
        sourceId: source?.id,
        uploadId: upload?.id,
        filename: upload?.filename,
        dataSource: source?.type,
      });

      if (source && !dryRun) {
        await this.prisma.seoLocationSource.update({
          where: { id: source.id },
          data: {
            lastStatus: result.errorCount ? 'error' : 'ok',
            lastSyncAt: new Date(),
            importedCount: { increment: result.inserted },
            updatedCount: { increment: result.updated },
            errorCount: { increment: result.errorCount },
            lastError: result.errorCount ? result.errors[0] ?? null : null,
            lastDataVersion: new Date().toISOString().slice(0, 10),
          },
        });
      }

      return { ...result, validationErrors };
    } catch (err) {
      if (source) {
        await this.prisma.seoLocationSource.update({
          where: { id: source.id },
          data: {
            lastStatus: 'error',
            lastError: err instanceof Error ? err.message : String(err),
          },
        });
      }
      throw err;
    }
  }

  async syncByType(type: 'RUIAN' | 'CSU', opts?: { dryRun?: boolean }) {
    const source = await this.prisma.seoLocationSource.findFirst({ where: { type } });
    if (!source) throw new NotFoundException(`Zdroj ${type} nenalezen.`);
    if (!source.sourceUrl?.trim()) {
      throw new BadRequestException('Nastavte URL zdroje v nastavení.');
    }
    const url = assertSafeRemoteUrl(source.sourceUrl);
    const config = (source.configJson ?? {}) as { timeoutMs?: number; csvDelimiter?: string };
    const timeout = config.timeoutMs ?? 60000;

    await this.prisma.seoLocationSource.update({
      where: { id: source.id },
      data: { lastStatus: 'syncing' },
    });

    try {
      const res = await axios.get(url.toString(), {
        responseType: 'arraybuffer',
        timeout,
        maxContentLength: 50 * 1024 * 1024,
        maxRedirects: 3,
      });
      const format = (source.fileType ?? 'csv').toLowerCase();
      const dataset = await parseUploadBuffer(Buffer.from(res.data), format, {
        delimiter: config.csvDelimiter ?? ';',
      });
      const mappings = await this.getMappingRecord(source.id, dataset.headers);
      return this.runImport({
        sourceId: source.id,
        mapping: mappings,
        dryRun: opts?.dryRun,
      });
    } catch (err) {
      await this.prisma.seoLocationSource.update({
        where: { id: source.id },
        data: {
          lastStatus: 'error',
          lastError: err instanceof Error ? err.message : String(err),
        },
      });
      throw err;
    }
  }

  async listImports(sourceId?: string) {
    return this.locations.listImportRuns(50, sourceId);
  }

  async getImport(id: string) {
    const run = await this.locations.getImportRun(id);
    if (!run) throw new NotFoundException('Import nenalezen.');
    return run;
  }

  private async resolveDataset(input: {
    sourceId?: string;
    uploadId?: string;
    mapping?: Record<string, string>;
  }) {
    let source = input.sourceId
      ? await this.prisma.seoLocationSource.findUnique({
          where: { id: input.sourceId },
          include: { fieldMappings: true },
        })
      : null;

    let upload = input.uploadId
      ? await this.prisma.seoLocationUpload.findUnique({ where: { id: input.uploadId } })
      : null;

    if (!upload && !source?.sourceUrl) {
      throw new BadRequestException('Zadejte uploadId nebo nastavte URL zdroje.');
    }

    let dataset;
    if (upload) {
      if (upload.expiresAt < new Date()) throw new BadRequestException('Upload vypršel — nahrajte znovu.');
      const buf = fs.readFileSync(upload.storagePath);
      dataset = await parseUploadBuffer(buf, upload.detectedFormat ?? 'csv');
      if (!source && upload.sourceId) {
        source = await this.prisma.seoLocationSource.findUnique({
          where: { id: upload.sourceId },
          include: { fieldMappings: true },
        });
      }
    } else {
      const url = assertSafeRemoteUrl(source!.sourceUrl!);
      const config = (source!.configJson ?? {}) as { timeoutMs?: number };
      const res = await axios.get(url.toString(), {
        responseType: 'arraybuffer',
        timeout: config.timeoutMs ?? 60000,
        maxContentLength: 50 * 1024 * 1024,
      });
      dataset = await parseUploadBuffer(
        Buffer.from(res.data),
        (source!.fileType ?? 'csv').toLowerCase(),
      );
    }

    const mapping =
      input.mapping ??
      (source ? await this.getMappingRecord(source.id, dataset.headers) : detectFieldMapping(dataset.headers));

    return { dataset, source, mapping, upload };
  }

  private async getMappingRecord(sourceId: string, headers: string[]) {
    const saved = await this.prisma.seoLocationFieldMapping.findMany({ where: { sourceId } });
    if (saved.length) {
      const out: Record<string, string> = {};
      for (const m of saved) out[m.sourceField] = m.targetField;
      return out;
    }
    const detected = detectFieldMapping(headers);
    return detected;
  }

  private applyMapping(
    rawRows: Array<Record<string, string>>,
    mapping: Record<string, string>,
    sourceType?: SeoLocationSourceType,
  ): SeoLocationImportRow[] {
    const defaultKind = sourceType === 'CSU' ? 'OBEC' : sourceType === 'RUIAN' ? 'OBEC' : 'OBEC';
    return rawRows
      .map((raw) => {
        const get = (target: string) => {
          const srcKey = Object.entries(mapping).find(([, t]) => t === target)?.[0];
          return srcKey ? raw[srcKey]?.trim() : '';
        };
        const officialCode = get('officialCode');
        const name = get('name');
        if (!officialCode || !name) return null;
        const lat = Number.parseFloat(get('latitude'));
        const lon = Number.parseFloat(get('longitude'));
        const pop = Number.parseInt(get('population'), 10);
        const row: SeoLocationImportRow = {
          officialCode,
          name,
          slug: get('slug') || undefined,
          locative: get('locative') || undefined,
          kind: get('kind') || defaultKind,
          parentOfficialCode: get('parentOfficialCode') || null,
          regionOfficialCode: get('regionOfficialCode') || null,
          districtOfficialCode: get('districtOfficialCode') || null,
          latitude: Number.isFinite(lat) ? lat : null,
          longitude: Number.isFinite(lon) ? lon : null,
          population: Number.isFinite(pop) ? pop : null,
          psc: get('psc') || null,
          cadastreCode: get('cadastreCode') || null,
        };
        return row;
      })
      .filter((r): r is SeoLocationImportRow => r !== null);
  }

  private validateRows(rows: SeoLocationImportRow[]): string[] {
    const errors: string[] = [];
    if (!rows.length) errors.push('Žádné validní řádky k importu.');
    const codes = new Set<string>();
    for (const row of rows.slice(0, 5000)) {
      if (codes.has(row.officialCode)) {
        errors.push(`Duplicitní officialCode: ${row.officialCode}`);
        break;
      }
      codes.add(row.officialCode);
      if (!row.name.trim()) errors.push(`Chybí název u kódu ${row.officialCode}`);
      normalizeSeoLocationKind(row.kind);
      if (!row.slug) buildSeoLocationSlug(row.name, row.officialCode);
    }
    return errors.slice(0, 20);
  }

  private toSourceCard(
    s: {
      id: string;
      type: SeoLocationSourceType;
      name: string;
      sourceMode: string;
      sourceUrl: string | null;
      fileType: string | null;
      configJson: unknown;
      isEnabled: boolean;
      autoSync: boolean;
      syncIntervalMinutes: number;
      lastSyncAt: Date | null;
      lastStatus: string;
      lastError: string | null;
      lastEtag: string | null;
      lastModified: string | null;
      lastDataVersion: string | null;
      importedCount: number;
      updatedCount: number;
      errorCount: number;
      fieldMappings: Array<{
        sourceField: string;
        targetField: string;
        isRequired: boolean;
      }>;
      importRuns?: Array<{
        id: string;
        status: string;
        inserted: number;
        updated: number;
        errorCount: number;
        finishedAt: Date | null;
      }>;
    },
  ) {
    const lastRun = Array.isArray(s.importRuns) ? s.importRuns[0] : undefined;
    const config = (s.configJson ?? {}) as Record<string, unknown>;
    return {
      id: s.id,
      type: s.type,
      name: s.name,
      sourceMode: s.sourceMode,
      sourceUrl: s.sourceUrl,
      fileType: s.fileType,
      config,
      isEnabled: s.isEnabled,
      autoSync: s.autoSync,
      syncIntervalMinutes: s.syncIntervalMinutes,
      lastSyncAt: s.lastSyncAt?.toISOString() ?? null,
      lastStatus: s.lastStatus,
      lastError: s.lastError,
      lastEtag: s.lastEtag,
      lastModified: s.lastModified,
      lastDataVersion: s.lastDataVersion,
      importedCount: s.importedCount,
      updatedCount: s.updatedCount,
      errorCount: s.errorCount,
      fieldMappings: s.fieldMappings,
      lastImport: lastRun
        ? {
            id: lastRun.id,
            status: lastRun.status,
            inserted: lastRun.inserted,
            updated: lastRun.updated,
            errorCount: lastRun.errorCount,
            finishedAt: lastRun.finishedAt?.toISOString() ?? null,
          }
        : null,
      targetFields: TARGET_FIELDS,
    };
  }
}
