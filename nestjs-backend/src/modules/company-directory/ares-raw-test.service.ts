import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AresService } from './ares.service';
import type { AresSearchFilter } from './ares.types';
import {
  ARES_API_VERSION,
  ARES_PAGINATION,
  ARES_SEARCH_ENDPOINT,
} from './ares-api.constants';
import { sanitizeAresRequestBody } from './ares-import-diagnostics.util';
import { icosFromSubjects } from './ares-import-diagnostics.util';
import { aresRequestHash, responseIcoFingerprint } from './ares-request-hash.util';
import { resolveCityKodObce } from './ares-master-partitions.util';
import {
  ARES_MAX_RESULTS_PER_QUERY,
  buildInitialPartitions,
  splitPartitionFurther,
  type AresPartitionContext,
} from './ares-import-split.util';

export type AresRawTestInput = {
  locality?: string;
  nace?: string;
  ico?: string;
  limit?: number;
};

export type AresRawTestResult = {
  apiVersion: string;
  endpoint: string;
  pagination: typeof ARES_PAGINATION;
  httpStatus: number;
  requestBody: AresSearchFilter;
  requestHash: string;
  pocetCelkem: number | null;
  firstPageReturned: number;
  pagesFetched: number;
  rawUniqueIco: number;
  existingInDb: number;
  newInDb: number;
  firstIco: string | null;
  lastIco: string | null;
  responseFingerprint: string;
  errorMessage?: string;
  tooManyResults?: boolean;
  tooManyMessage?: string;
  suggestedPartitions?: Array<{ label: string; filter: AresSearchFilter }>;
  pages: Array<{
    offset: number;
    returned: number;
    firstIco: string | null;
    lastIco: string | null;
  }>;
};

@Injectable()
export class AresRawTestService {
  constructor(
    private readonly ares: AresService,
    private readonly prisma: PrismaService,
  ) {}

  buildFilter(input: AresRawTestInput): AresSearchFilter {
    const filter: AresSearchFilter = { start: 0, pocet: 100 };
    if (input.ico?.trim()) {
      filter.ico = [input.ico.replace(/\D/g, '').padStart(8, '0')];
      return filter;
    }
    if (input.nace?.trim()) {
      filter.czNace = [input.nace.trim()];
    }
    if (input.locality?.trim()) {
      const kodObce = resolveCityKodObce(input.locality);
      if (kodObce) {
        filter.sidlo = { kodObce };
      } else {
        filter.sidlo = { textovaAdresa: input.locality.trim() };
      }
    }
    return filter;
  }

  suggestPartitions(filter: AresSearchFilter, ctx: AresPartitionContext = {}) {
    const fromInitial = buildInitialPartitions(filter, { ...ctx, wholeCountry: true, masterSync: false });
    if (fromInitial.length > 1) {
      return fromInitial.map((p) => ({ label: p.label, filter: p.filter }));
    }
    const fromSplit = splitPartitionFurther(filter, ctx, 0);
    return fromSplit.map((p) => ({ label: p.label, filter: p.filter }));
  }

  async runTest(input: AresRawTestInput): Promise<AresRawTestResult> {
    const maxPages = Math.min(50, Math.max(1, input.limit ?? 10));
    const filter = this.buildFilter(input);
    const requestBody = sanitizeAresRequestBody(filter);
    const requestHash = aresRequestHash(filter);

    const allIcos: string[] = [];
    const pages: AresRawTestResult['pages'] = [];
    let httpStatus = 0;
    let pocetCelkem: number | null = null;
    let errorMessage: string | undefined;
    let start = 0;
    const pocet = 100;

    for (let page = 0; page < maxPages; page++) {
      try {
        const response = await this.ares.searchCompanies({ ...filter, start, pocet });
        httpStatus = 200;
        pocetCelkem = response.pocetCelkem ?? pocetCelkem;
        const subjects = response.ekonomickeSubjekty ?? [];
        const { firstIco, lastIco, icos } = icosFromSubjects(subjects);
        allIcos.push(...icos);
        pages.push({ offset: start, returned: subjects.length, firstIco, lastIco });
        if (
          subjects.length === 0 ||
          subjects.length < pocet ||
          (pocetCelkem != null && start + subjects.length >= Math.min(pocetCelkem, 1000))
        ) {
          break;
        }
        start += subjects.length;
      } catch (err) {
        httpStatus = err instanceof Error && 'statusCode' in err ? (err as { statusCode: number }).statusCode : 500;
        errorMessage = err instanceof Error ? err.message : String(err);
        break;
      }
    }

    const tooManyResults =
      Boolean(
        errorMessage &&
          (errorMessage.toLowerCase().includes('příliš mnoho') ||
            errorMessage.toLowerCase().includes('maximálně') ||
            errorMessage.toLowerCase().includes('1 000')),
      ) ||
      (pocetCelkem != null && pocetCelkem > ARES_MAX_RESULTS_PER_QUERY);
    const tooManyMessage = tooManyResults
      ? 'ARES dotaz je příliš široký — MASTER SYNC by tento dotaz automaticky rozdělil.'
      : undefined;
    const suggestedPartitions = tooManyResults
      ? this.suggestPartitions(filter, { wholeCountry: !filter.sidlo && !filter.ico })
      : undefined;

    const uniqueIcos = [...new Set(allIcos)];
    const existingRows = uniqueIcos.length
      ? await this.prisma.companyDirectoryEntry.findMany({
          where: { ico: { in: uniqueIcos } },
          select: { ico: true },
        })
      : [];
    const existingSet = new Set(existingRows.map((r) => r.ico));

    return {
      apiVersion: ARES_API_VERSION,
      endpoint: ARES_SEARCH_ENDPOINT,
      pagination: ARES_PAGINATION,
      httpStatus,
      requestBody,
      requestHash,
      pocetCelkem,
      firstPageReturned: pages[0]?.returned ?? 0,
      pagesFetched: pages.length,
      rawUniqueIco: uniqueIcos.length,
      existingInDb: existingSet.size,
      newInDb: uniqueIcos.filter((i) => !existingSet.has(i)).length,
      firstIco: uniqueIcos[0] ?? null,
      lastIco: uniqueIcos[uniqueIcos.length - 1] ?? null,
      responseFingerprint: responseIcoFingerprint(uniqueIcos),
      errorMessage,
      tooManyResults,
      tooManyMessage,
      suggestedPartitions,
      pages,
    };
  }

  async runSplitPreview(input: AresRawTestInput) {
    const filter = this.buildFilter(input);
    const partitions = this.suggestPartitions(filter, { wholeCountry: !filter.sidlo && !filter.ico });
    return {
      requestBody: sanitizeAresRequestBody(filter),
      partitionCount: partitions.length,
      partitions: partitions.slice(0, 50),
      truncated: partitions.length > 50,
    };
  }

  async runPresetTests() {
    const presets: Array<{ label: string; input: AresRawTestInput }> = [
      { label: 'A Hradec Králové (kodObce)', input: { locality: 'Hradec Králové' } },
      { label: 'B Pardubice (kodObce)', input: { locality: 'Pardubice' } },
      { label: 'C Praha (kodObce)', input: { locality: 'Praha' } },
      { label: 'D Hradec + NACE 4321', input: { locality: 'Hradec Králové', nace: '4321' } },
      { label: 'E Hradec + NACE 42 (broken nazevObce legacy)', input: { locality: 'Hradec Králové', nace: '42' } },
      { label: 'F NACE 42 nationwide', input: { nace: '42' } },
      { label: 'G Lukavice (kodObce)', input: { locality: 'Lukavice' } },
    ];
    const results: Record<string, AresRawTestResult> = {};
    for (const preset of presets) {
      results[preset.label] = await this.runTest({ ...preset.input, limit: 15 });
    }
    return results;
  }
}
