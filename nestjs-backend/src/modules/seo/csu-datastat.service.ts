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

type CsuVyberMeta = {
  kod?: string;
  sadaKod?: string;
  nazev?: string;
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
        headers: { 'Accept-Language': 'cs' },
        validateStatus: (s: number) => s < 500,
      });
      return { ok: res.status < 400, status: res.status, datasets: Array.isArray(res.data) ? res.data.length : null };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  private formatCsuAxiosError(err: unknown, context: string): Error {
    const ax = err as {
      response?: { status?: number; data?: unknown };
      message?: string;
    };
    const status = ax.response?.status;
    const body =
      ax.response?.data != null
        ? typeof ax.response.data === 'string'
          ? ax.response.data
          : JSON.stringify(ax.response.data)
        : '';
    const detail = body || ax.message || context;
    this.log.error(`ČSÚ ${context}: HTTP ${status ?? '?'} — ${detail}`);
    const userMessage =
      status === 400
        ? `ČSÚ odmítlo požadavek (HTTP 400): ${detail.slice(0, 500)}`
        : status
          ? `ČSÚ API chyba (HTTP ${status}): ${detail.slice(0, 300)}`
          : `ČSÚ API chyba: ${detail.slice(0, 300)}`;
    return Object.assign(new Error(userMessage), {
      code: status ? `HTTP_${status}` : 'CSU_API_ERROR',
      userMessage,
      detail,
      responseBody: body,
    });
  }

  /** Najde platný kód předdefinovaného výběru pro datovou sadu v katalogu ČSÚ. */
  async resolveVyberCode(datasetCode: string, preferred?: string): Promise<string> {
    if (preferred) return preferred;
    try {
      const res = await axios.get(`${CSU_DATASTAT_DEFAULTS.catalogUrl}/vybery`, {
        timeout: 30000,
        headers: { 'Accept-Language': 'cs' },
      });
      const vybery = (Array.isArray(res.data) ? res.data : []) as CsuVyberMeta[];
      const byDataset = vybery.filter(
        (v) =>
          v.sadaKod === datasetCode ||
          v.kod?.startsWith(datasetCode) ||
          /obec|obyvatel/i.test(`${v.nazev ?? ''}${v.kod ?? ''}`),
      );
      const obce = byDataset.find((v) => /obec/i.test(v.nazev ?? '')) ?? byDataset[0];
      if (obce?.kod) {
        this.log.log(`ČSÚ vybrán výběr ${obce.kod} (${obce.nazev ?? ''})`);
        return obce.kod;
      }
    } catch (err) {
      this.log.warn(`Katalog výběrů ČSÚ nedostupný: ${err instanceof Error ? err.message : String(err)}`);
    }
    return CSU_DATASTAT_DEFAULTS.predefinedVyberCode;
  }

  async fetchPredefinedVyberCsv(vyberCode?: string): Promise<string> {
    const cfg = CSU_DATASTAT_DEFAULTS;
    const code = await this.resolveVyberCode(cfg.datasetCode, vyberCode);
    const url = `${cfg.baseUrl}/data/vybery/${encodeURIComponent(code)}?format=CSV`;
    try {
      const res = await axios.get(url, {
        timeout: 120000,
        responseType: 'text',
        headers: { Accept: 'text/csv', 'Accept-Language': 'cs' },
        validateStatus: () => true,
      });
      if (res.status >= 400) {
        throw Object.assign(new Error(`HTTP ${res.status}`), {
          response: { status: res.status, data: res.data },
          isAxiosError: true,
        });
      }
      return String(res.data);
    } catch (err) {
      throw this.formatCsuAxiosError(err, `GET ${url}`);
    }
  }

  async fetchCustomDataset(body: {
    sadaKod: string;
    ukazatele?: string[];
    dimenze?: Array<{ kod: string; hodnoty?: string[] }>;
  }): Promise<unknown> {
    const cfg = CSU_DATASTAT_DEFAULTS;
    const url = `${cfg.baseUrl}/data/sady/${encodeURIComponent(body.sadaKod)}/vlastni?format=CSV&kodZvlast=true`;
    try {
      const res = await axios.post(url, body, {
        timeout: 120000,
        headers: {
          Accept: 'text/csv, application/json',
          'Content-Type': 'application/json',
          'Accept-Language': 'cs',
        },
        responseType: 'text',
        validateStatus: () => true,
      });
      if (res.status >= 400) {
        throw Object.assign(new Error(`HTTP ${res.status}`), {
          response: { status: res.status, data: res.data },
          isAxiosError: true,
        });
      }
      return res.data;
    } catch (err) {
      throw this.formatCsuAxiosError(err, `POST ${url}`);
    }
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
      data: { lastStatus: 'syncing', lastError: null },
    });

    try {
      let csv: string;
      let usedVyber: string | undefined;
      try {
        usedVyber = await this.resolveVyberCode(CSU_DATASTAT_DEFAULTS.datasetCode, opts?.vyberCode);
        csv = await this.fetchPredefinedVyberCsv(usedVyber);
      } catch (firstErr) {
        this.log.warn(`Předdefinovaný výběr selhal — zkouším vlastní dotaz na sadu OBY01`);
        const catalog = await axios.get(`${CSU_DATASTAT_DEFAULTS.catalogUrl}/sady`, {
          timeout: 30000,
          headers: { 'Accept-Language': 'cs' },
        });
        const sady = catalog.data as Array<{ kod?: string; nazev?: string }>;
        const obySada =
          sady.find((s) => s.kod === 'OBY01') ??
          sady.find((s) => /obyvatel|obec/i.test(`${s.nazev ?? ''}${s.kod ?? ''}`));
        if (!obySada?.kod) {
          const detail =
            firstErr instanceof Error && 'detail' in firstErr
              ? String((firstErr as { detail?: string }).detail)
              : firstErr instanceof Error
                ? firstErr.message
                : String(firstErr);
          throw Object.assign(new Error(`Datová sada obcí nenalezena. ${detail}`), {
            userMessage: `ČSÚ sync selhal: ${detail.slice(0, 400)}`,
          });
        }
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
          lastError: null,
          updatedCount: { increment: updated },
          configJson: {
            ...((source.configJson as object) ?? {}),
            datastat: {
              ...cfg,
              predefinedVyberCode: usedVyber ?? cfg.predefinedVyberCode,
              updatedMunicipalities: updated,
              lastDatasetVersion: new Date().toISOString().slice(0, 10),
            },
          } as Prisma.InputJsonValue,
        },
      });

      return { updated, parsed: parsed.length, dryRun: Boolean(opts?.dryRun), vyberCode: usedVyber };
    } catch (err) {
      const message =
        err instanceof Error && 'userMessage' in err
          ? String((err as { userMessage?: string }).userMessage)
          : err instanceof Error
            ? err.message
            : String(err);
      await this.prisma.seoLocationSource.update({
        where: { id: source.id },
        data: {
          lastStatus: 'error',
          lastError: message,
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
