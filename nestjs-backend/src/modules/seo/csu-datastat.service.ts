import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import axios from 'axios';
import { PrismaService } from '../../database/prisma.service';
import {
  CSU_DATASTAT_DEFAULTS,
  type CsuDataStatConnectorConfig,
} from './ruian-vfr.official.constants';

export type CsuPopulationRow = {
  officialCode: string;
  population: number;
  name?: string;
};

@Injectable()
export class CsuDataStatService {
  private readonly log = new Logger(CsuDataStatService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getStatus() {
    const source = await this.getCsuSource();
    const cfg = this.getConfig(source);
    return {
      connector: 'CSU_DATASTAT_OFFICIAL',
      apiKeyRequired: false,
      baseUrl: cfg.baseUrl,
      catalogUrl: cfg.catalogUrl,
      datasetCode: cfg.datasetCode,
      predefinedVyberCode: cfg.predefinedVyberCode,
      lastSyncAt: source?.lastSyncAt?.toISOString() ?? null,
      lastStatus: source?.lastStatus ?? 'idle',
      lastError: source?.lastError ?? null,
      updatedMunicipalities: cfg.updatedMunicipalities ?? 0,
      provides: ['počet obyvatel', 'statistické kódy obcí', 'demografická metadata'],
      doesNotOverride: ['územní struktura RÚIAN', 'SEO slug', 'SEO texty'],
    };
  }

  async testAvailability() {
    const cfg = CSU_DATASTAT_DEFAULTS;
    try {
      const res = await axios.get(`${cfg.catalogUrl}/sady`, {
        timeout: 30000,
        validateStatus: (s: number) => s < 500,
      });
      return { ok: res.status < 400, status: res.status, datasets: Array.isArray(res.data) ? res.data.length : null };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  async fetchPredefinedVyberCsv(vyberCode?: string): Promise<string> {
    const cfg = CSU_DATASTAT_DEFAULTS;
    const code = vyberCode ?? cfg.predefinedVyberCode;
    const url = `${cfg.baseUrl}/data/vybery/${encodeURIComponent(code)}?format=CSV`;
    const res = await axios.get(url, { timeout: 120000, responseType: 'text' });
    return String(res.data);
  }

  async fetchCustomDataset(body: {
    sadaKod: string;
    ukazatele?: string[];
    dimenze?: Array<{ kod: string; hodnoty?: string[] }>;
  }): Promise<unknown> {
    const cfg = CSU_DATASTAT_DEFAULTS;
    const url = `${cfg.baseUrl}/data/sady/${encodeURIComponent(body.sadaKod)}/vlastni`;
    const res = await axios.post(url, body, {
      timeout: 120000,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    });
    return res.data;
  }

  /** Parsuje CSV z DataStatu a vrací řádky párované podle kódu obce. */
  parsePopulationCsv(csv: string): CsuPopulationRow[] {
    const lines = csv.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const delimiter = lines[0]!.includes(';') ? ';' : ',';
    const headers = lines[0]!.split(delimiter).map((h) => h.trim().toLowerCase());
    const codeIdx = headers.findIndex((h) =>
      /kod_obec|kód_obec|obec_kod|kodobce|uzemi_kod|kod_uzemi/.test(h),
    );
    const popIdx = headers.findIndex((h) =>
      /obyvatel|pocet_obyvatel|hodnota|value|ukazatel/.test(h),
    );
    const nameIdx = headers.findIndex((h) => /nazev|název|obec/.test(h));

    if (codeIdx < 0 || popIdx < 0) return [];

    const rows: CsuPopulationRow[] = [];
    for (const line of lines.slice(1)) {
      const cols = line.split(delimiter);
      const officialCode = cols[codeIdx]?.trim().replace(/^0+/, '') || cols[codeIdx]?.trim();
      const pop = Number.parseInt(cols[popIdx]?.replace(/\s/g, '') ?? '', 10);
      if (!officialCode || !Number.isFinite(pop)) continue;
      rows.push({
        officialCode: officialCode.padStart(6, '0'),
        population: pop,
        name: nameIdx >= 0 ? cols[nameIdx]?.trim() : undefined,
      });
    }
    return rows;
  }

  /**
   * Aktualizuje pouze population u existujících lokalit (dle officialCode).
   * Nepřepisuje názvy, hierarchii ani SEO pole.
   */
  async syncPopulation(opts?: { vyberCode?: string; dryRun?: boolean }) {
    const source = await this.getCsuSource();
    if (!source) throw new Error('ČSÚ zdroj nenalezen.');

    await this.prisma.seoLocationSource.update({
      where: { id: source.id },
      data: { lastStatus: 'syncing' },
    });

    try {
      let csv: string;
      try {
        csv = await this.fetchPredefinedVyberCsv(opts?.vyberCode);
      } catch {
        this.log.warn('Předdefinovaný výběr selhal — zkouším katalog sady');
        const catalog = await axios.get(`${CSU_DATASTAT_DEFAULTS.catalogUrl}/sady`, { timeout: 30000 });
        const sady = catalog.data as Array<{ kod?: string; nazev?: string }>;
        const obySada = sady.find((s) => /obyvatel|obec/i.test(`${s.nazev ?? ''}${s.kod ?? ''}`));
        if (!obySada?.kod) throw new Error('Datová sada obcí nenalezena v katalogu ČSÚ.');
        const custom = await this.fetchCustomDataset({ sadaKod: obySada.kod });
        csv = typeof custom === 'string' ? custom : JSON.stringify(custom);
      }

      const parsed = this.parsePopulationCsv(csv);
      if (!parsed.length) throw new Error('CSV neobsahuje párovatelné kódy obcí.');

      let updated = 0;
      if (!opts?.dryRun) {
        for (const row of parsed) {
          const res = await this.prisma.seoLocation.updateMany({
            where: { officialCode: row.officialCode },
            data: { population: row.population },
          });
          updated += res.count;
        }
      } else {
        const codes = new Set(parsed.map((r) => r.officialCode));
        updated = await this.prisma.seoLocation.count({
          where: { officialCode: { in: [...codes] } },
        });
      }

      const cfg = this.getConfig(source);
      await this.prisma.seoLocationSource.update({
        where: { id: source.id },
        data: {
          lastStatus: 'ok',
          lastSyncAt: new Date(),
          updatedCount: { increment: updated },
          configJson: {
            ...((source.configJson as object) ?? {}),
            datastat: {
              ...cfg,
              updatedMunicipalities: updated,
              lastDatasetVersion: new Date().toISOString().slice(0, 10),
            },
          } as Prisma.InputJsonValue,
        },
      });

      return { updated, parsed: parsed.length, dryRun: Boolean(opts?.dryRun) };
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

  private async getCsuSource() {
    return this.prisma.seoLocationSource.findFirst({ where: { type: 'CSU' } });
  }

  private getConfig(source: { configJson: unknown } | null): CsuDataStatConnectorConfig {
    const cfg = (source?.configJson ?? {}) as { datastat?: CsuDataStatConnectorConfig };
    return { ...CSU_DATASTAT_DEFAULTS, ...cfg.datastat };
  }
}
