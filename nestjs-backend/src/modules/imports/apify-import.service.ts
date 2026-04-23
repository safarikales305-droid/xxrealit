import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { ImportedListingDraft } from './import-types';
import { safeParsePrice } from './price-parse.util';

const APIFY_BASE = 'https://api.apify.com/v2';
const POLL_MS = 2_000;
const MAX_POLL_MS = 6 * 60_000;

export type ApifyFetchMeta = {
  startUrl: string;
  finalUrl: string;
  httpStatus: number;
  rawCandidates: number;
  normalizedValid: number;
  parseMethod: string;
  contentType: string;
  settings: Record<string, unknown>;
  requestLog: Array<Record<string, unknown>>;
  listPage429Count: number;
  detailPage429Count: number;
  detailFetchesAttempted: number;
  detailFetchesCompleted: number;
  listingPagesFetched: number;
  listingPaginationLog: Array<Record<string, unknown>>;
  runId?: string | null;
  datasetId?: string | null;
};

@Injectable()
export class ApifyImportService {
  private readonly logger = new Logger(ApifyImportService.name);

  async fetch(params: {
    limit: number;
    actorId?: string | null;
    actorTaskId?: string | null;
    datasetId?: string | null;
    startUrl?: string | null;
    settingsJson?: Record<string, unknown> | null;
  }): Promise<{ rows: ImportedListingDraft[]; meta: ApifyFetchMeta }> {
    const token = (process.env.APIFY_TOKEN ?? '').trim();
    if (!token) throw new BadRequestException('APIFY_TOKEN není nastaven.');

    const actorId =
      (params.actorId ?? '').trim() ||
      (typeof params.settingsJson?.actorId === 'string' ? params.settingsJson.actorId : '').trim() ||
      (process.env.APIFY_DEFAULT_ACTOR_ID ?? '').trim();
    const actorTaskId =
      (params.actorTaskId ?? '').trim() ||
      (typeof params.settingsJson?.actorTaskId === 'string' ? params.settingsJson.actorTaskId : '').trim();
    let datasetId =
      (params.datasetId ?? '').trim() ||
      (typeof params.settingsJson?.datasetId === 'string' ? params.settingsJson.datasetId : '').trim();
    const startUrl =
      (params.startUrl ?? '').trim() ||
      (typeof params.settingsJson?.startUrl === 'string' ? params.settingsJson.startUrl : '').trim();

    const requestLog: Array<Record<string, unknown>> = [];
    let runId: string | null = null;
    if (!datasetId) {
      if (!actorTaskId && !actorId) {
        throw new BadRequestException('APIFY import potřebuje actorId nebo actorTaskId.');
      }
      const run = await this.startRun({
        token,
        actorId: actorId || null,
        actorTaskId: actorTaskId || null,
        startUrl,
        maxItems: params.limit,
        requestLog,
      });
      runId = run.runId;
      datasetId = run.datasetId;
    }
    if (!datasetId) {
      throw new BadRequestException('Apify run nevrátil datasetId.');
    }

    const items = await this.fetchDatasetItems(token, datasetId, params.limit, requestLog);
    const rows: ImportedListingDraft[] = [];
    for (const item of items) {
      const row = this.mapItem(item);
      if (!row) continue;
      rows.push(row);
      if (rows.length >= params.limit) break;
    }

    return {
      rows,
      meta: {
        startUrl,
        finalUrl: startUrl,
        httpStatus: 200,
        rawCandidates: items.length,
        normalizedValid: rows.length,
        parseMethod: 'apify_actor_dataset',
        contentType: 'application/json',
        settings: {
          actorId: actorId || null,
          actorTaskId: actorTaskId || null,
          datasetId,
          startUrl: startUrl || null,
        },
        requestLog,
        listPage429Count: 0,
        detailPage429Count: 0,
        detailFetchesAttempted: 0,
        detailFetchesCompleted: 0,
        listingPagesFetched: 1,
        listingPaginationLog: [],
        runId,
        datasetId,
      },
    };
  }

  private async startRun(params: {
    token: string;
    actorId: string | null;
    actorTaskId: string | null;
    startUrl: string;
    maxItems: number;
    requestLog: Array<Record<string, unknown>>;
  }): Promise<{ runId: string; datasetId: string | null }> {
    const endpoint = params.actorTaskId
      ? `${APIFY_BASE}/actor-tasks/${encodeURIComponent(params.actorTaskId)}/runs`
      : `${APIFY_BASE}/acts/${encodeURIComponent(params.actorId ?? '')}/runs`;
    const input: Record<string, unknown> = {
      maxItems: params.maxItems,
    };
    if (params.startUrl) input.startUrls = [{ url: params.startUrl }];

    const res = await fetch(`${endpoint}?token=${encodeURIComponent(params.token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    params.requestLog.push({ phase: 'apify_run_start', status: res.status, endpoint });
    if (!res.ok) {
      throw new BadRequestException(`Apify run start selhal (${res.status}).`);
    }
    const data = (json.data ?? {}) as Record<string, unknown>;
    const runId = typeof data.id === 'string' ? data.id : '';
    if (!runId) throw new BadRequestException('Apify run nevrátil runId.');
    const run = await this.waitForRun(params.token, runId, params.requestLog);
    return { runId, datasetId: run.datasetId };
  }

  private async waitForRun(
    token: string,
    runId: string,
    requestLog: Array<Record<string, unknown>>,
  ): Promise<{ datasetId: string | null }> {
    const started = Date.now();
    while (Date.now() - started < MAX_POLL_MS) {
      const endpoint = `${APIFY_BASE}/actor-runs/${encodeURIComponent(runId)}?token=${encodeURIComponent(token)}`;
      const res = await fetch(endpoint, { headers: { Accept: 'application/json' } });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const data = (json.data ?? {}) as Record<string, unknown>;
      const status = typeof data.status === 'string' ? data.status : 'UNKNOWN';
      requestLog.push({ phase: 'apify_run_poll', status: res.status, runId, runStatus: status });
      if (!res.ok) throw new BadRequestException(`Apify run poll selhal (${res.status}).`);
      if (status === 'SUCCEEDED') {
        const datasetId =
          typeof data.defaultDatasetId === 'string'
            ? data.defaultDatasetId
            : typeof data.defaultKeyValueStoreId === 'string'
              ? data.defaultKeyValueStoreId
              : null;
        return { datasetId };
      }
      if (status === 'FAILED' || status === 'TIMED-OUT' || status === 'ABORTED') {
        throw new BadRequestException(`Apify run skončil stavem ${status}.`);
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    throw new BadRequestException('Apify run timeout.');
  }

  private async fetchDatasetItems(
    token: string,
    datasetId: string,
    limit: number,
    requestLog: Array<Record<string, unknown>>,
  ): Promise<Record<string, unknown>[]> {
    const endpoint = `${APIFY_BASE}/datasets/${encodeURIComponent(datasetId)}/items?token=${encodeURIComponent(
      token,
    )}&clean=true&limit=${Math.max(1, Math.min(5000, limit))}`;
    const res = await fetch(endpoint, { headers: { Accept: 'application/json' } });
    requestLog.push({ phase: 'apify_dataset_fetch', status: res.status, datasetId });
    if (!res.ok) throw new BadRequestException(`Apify dataset fetch selhal (${res.status}).`);
    const arr = (await res.json().catch(() => [])) as unknown;
    return Array.isArray(arr)
      ? arr.filter((x): x is Record<string, unknown> => x != null && typeof x === 'object')
      : [];
  }

  private mapItem(item: Record<string, unknown>): ImportedListingDraft | null {
    const getStr = (...keys: string[]): string => {
      for (const k of keys) {
        const v = item[k];
        if (typeof v === 'string' && v.trim()) return v.trim();
      }
      return '';
    };
    const getNum = (...keys: string[]): number | null => {
      for (const k of keys) {
        const v = item[k];
        const parsed = safeParsePrice(v == null ? null : String(v));
        if (parsed != null) return parsed;
      }
      return null;
    };
    const sourceUrl = getStr('sourceUrl', 'url', 'detailUrl', 'listingUrl');
    const externalId = getStr('externalId', 'id', 'listingId', 'itemId') || sourceUrl.slice(-80);
    const title = getStr('title', 'name', 'headline') || 'Import APIFY';
    if (!sourceUrl && !externalId) return null;

    const imagesRaw = item.images;
    const images =
      Array.isArray(imagesRaw)
        ? imagesRaw
            .filter((x): x is string => typeof x === 'string' && /^https?:\/\//i.test(x))
            .map((x) => x.trim())
        : [];

    const company = getStr('companyName', 'agencyName', 'brokerCompany');
    const row: ImportedListingDraft = {
      externalId: externalId.slice(0, 140),
      sourceUrl: sourceUrl || undefined,
      title: title.slice(0, 400),
      description: getStr('description', 'fullDescription', 'text') || '',
      price: getNum('price', 'priceValue'),
      address: getStr('address', 'streetAddress') || undefined,
      city: getStr('city', 'locality') || 'Neuvedeno',
      region: getStr('region', 'state', 'county') || undefined,
      propertyType: getStr('propertyType', 'type') || 'nemovitost',
      offerType: getStr('offerType', 'listingType') || 'prodej',
      contactName: getStr('contactName', 'brokerName', 'agentName') || undefined,
      contactEmail: getStr('contactEmail', 'email') || undefined,
      contactPhone: getStr('contactPhone', 'phone', 'telephone') || undefined,
      contactCompany: company || undefined,
      images,
    };
    return row;
  }
}
