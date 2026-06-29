import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { fetchSrealityEstateFromApi } from './sreality-api-prefill.util';
import {
  assertSrealityListingUrl,
  extractListingIdFromUrl,
  hasBasicPrefillData,
  hasMinimumPrefillData,
  hasPartialPrefillData,
  mergeSrealityListingPrefills,
  parseSrealityListingMulti,
  type SrealityListingPrefill,
  type SrealityParseDebug,
} from './sreality-listing-prefill.util';
import { isSrealityHost } from '../link-preview/sreality-scraper.util';
import { SrealityPlaywrightService } from './sreality-playwright.service';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const PREFILL_TOTAL_TIMEOUT_MS = 40_000;
const API_TIMEOUT_MS = 12_000;
const FETCH_HTML_TIMEOUT_MS = 12_000;
const PLAYWRIGHT_TIMEOUT_MS = 15_000;
const PARSER_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 3 * 1024 * 1024;

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export type SrealityPrefillStrategy =
  | 'api-v1'
  | 'api-v2'
  | 'html-fetch'
  | 'playwright'
  | 'merged'
  | 'none';

export type SrealityPrefillLog = {
  url: string;
  extractedListingId: string | null;
  strategyUsed: SrealityPrefillStrategy;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  apiStatus: number | null;
  htmlStatus: number | null;
  playwrightStatus: string | null;
  httpStatus: number | null;
  cloudflareDetected: boolean;
  playwrightAttempted: boolean;
  playwrightLoaded: boolean;
  playwrightFailed: boolean;
  fetchFallbackUsed: boolean;
  foundJsonLd: boolean;
  foundNextData: boolean;
  foundInitialState: boolean;
  foundOpenGraph: boolean;
  foundHtmlParser: boolean;
  fieldsFoundCount: number;
  fieldsFound: string[];
  parsersUsed: string[];
  htmlLength: number;
  finalUrl: string;
  errorCode?: string;
  errorDetail?: string;
  errorMessage?: string;
};

export type SrealityPrefillResult =
  | { ok: true; data: SrealityListingPrefill; log: SrealityPrefillLog; debug?: SrealityParseDebug }
  | { ok: false; error: string; log: SrealityPrefillLog; debug?: SrealityParseDebug };

@Injectable()
export class ListingsPrefillService {
  private readonly log = new Logger(ListingsPrefillService.name);

  constructor(private readonly playwright: SrealityPlaywrightService) {}

  async prefillFromUrl(
    sourceUrl: string,
    options?: { debug?: boolean },
  ): Promise<SrealityPrefillResult> {
    const startedAt = new Date();
    const startedMs = Date.now();

    try {
      return await this.withTimeout(
        this.prefillFromUrlInternal(sourceUrl, options, startedAt, startedMs),
        PREFILL_TOTAL_TIMEOUT_MS,
        'TIMEOUT',
        'Celkový časový limit importu (40 s) vypršel.',
      );
    } catch (err) {
      const endedAt = new Date();
      const failLog = this.buildBaseLog({
        url: sourceUrl,
        extractedListingId: extractListingIdFromUrl(sourceUrl),
        strategyUsed: 'none',
        startedAt,
        endedAt,
        startedMs,
        apiStatus: null,
        htmlStatus: null,
        playwrightStatus: 'timeout',
        playwrightAttempted: false,
        playwrightLoaded: false,
        playwrightFailed: false,
        fetchFallbackUsed: false,
        errorCode: err instanceof PrefillTimeoutError ? err.code : 'TIMEOUT',
        errorDetail: err instanceof Error ? err.message : String(err),
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      const error = this.errorMessageFromCode(failLog.errorCode ?? 'TIMEOUT', failLog.errorDetail);
      this.writeLog(failLog, error);
      return { ok: false, error, log: failLog };
    }
  }

  private async prefillFromUrlInternal(
    sourceUrl: string,
    options: { debug?: boolean } | undefined,
    startedAt: Date,
    startedMs: number,
  ): Promise<SrealityPrefillResult> {
    let requestUrl: URL;
    try {
      requestUrl = assertSrealityListingUrl(sourceUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Neplatná URL';
      const endedAt = new Date();
      const failLog = this.buildBaseLog({
        url: sourceUrl,
        extractedListingId: extractListingIdFromUrl(sourceUrl),
        strategyUsed: 'none',
        startedAt,
        endedAt,
        startedMs,
        apiStatus: null,
        htmlStatus: null,
        playwrightStatus: null,
        playwrightAttempted: false,
        playwrightLoaded: false,
        playwrightFailed: false,
        fetchFallbackUsed: false,
        finalUrl: sourceUrl,
        errorCode: 'INVALID_URL',
        errorDetail: message,
        errorMessage: message,
      });
      this.writeLog(failLog, message);
      return { ok: false, error: message, log: failLog };
    }

    const listingId = extractListingIdFromUrl(requestUrl.href);
    const mergeSources: Array<{ name: string; partial: Partial<SrealityListingPrefill> | null }> = [
      { name: 'urlPath', partial: parseSrealityListingMulti('', requestUrl.href).data },
    ];

    let apiStatus: number | null = null;
    let htmlStatus: number | null = null;
    let playwrightStatus: string | null = null;
    let strategyUsed: SrealityPrefillStrategy = 'none';
    let playwrightAttempted = false;
    let playwrightLoaded = false;
    let playwrightFailed = false;
    let fetchFallbackUsed = false;
    let htmlLength = 0;
    let finalUrl = requestUrl.href;
    let httpStatus: number | null = null;
    let cloudflareDetected = false;
    let lastDebug: SrealityParseDebug | null = null;

    if (listingId) {
      const api = await fetchSrealityEstateFromApi(listingId, requestUrl.href, API_TIMEOUT_MS);
      apiStatus = api.httpStatus;
      if (api.ok && api.data) {
        mergeSources.push({ name: api.strategy ?? 'api-v1', partial: api.data });
        if (this.isAcceptablePrefill(api.data)) {
          return this.successResult({
            sourceUrl: requestUrl.href,
            listingId,
            strategyUsed: api.strategy ?? 'api-v1',
            startedAt,
            startedMs,
            data: api.data,
            debug: this.debugFromPrefill(api.data, [api.strategy ?? 'api-v1']),
            apiStatus,
            htmlStatus,
            playwrightStatus,
            playwrightAttempted,
            playwrightLoaded,
            playwrightFailed,
            fetchFallbackUsed,
            htmlLength: 0,
            finalUrl,
            httpStatus: api.httpStatus,
            cloudflareDetected,
            options,
          });
        }
      }
    }

    fetchFallbackUsed = true;
    const fetched = await this.fetchHtmlFallback(requestUrl.href);
    htmlStatus = fetched.httpStatus;
    httpStatus = fetched.httpStatus;
    finalUrl = fetched.finalUrl;
    if (fetched.html.trim()) {
      htmlLength = fetched.html.length;
      const parseResult = await this.parseWithTimeout(fetched.html, fetched.finalUrl);
      if (parseResult) {
        lastDebug = parseResult.debug;
        mergeSources.push({ name: 'html-fetch', partial: parseResult.data });
        if (this.isAcceptablePrefill(parseResult.data)) {
          return this.successResult({
            sourceUrl: requestUrl.href,
            listingId,
            strategyUsed: 'html-fetch',
            startedAt,
            startedMs,
            data: parseResult.data,
            debug: parseResult.debug,
            apiStatus,
            htmlStatus,
            playwrightStatus,
            playwrightAttempted,
            playwrightLoaded,
            playwrightFailed,
            fetchFallbackUsed,
            htmlLength,
            finalUrl,
            httpStatus,
            cloudflareDetected,
            options,
          });
        }
      }
    }

    playwrightAttempted = true;
    const rendered = await this.playwright.renderPage(requestUrl.href, {
      timeoutMs: PLAYWRIGHT_TIMEOUT_MS,
      retries: 1,
    });
    playwrightLoaded = rendered.playwrightLoaded;
    playwrightFailed = Boolean(rendered.errorCode);
    playwrightStatus = rendered.errorCode
      ? `failed:${rendered.errorCode}`
      : rendered.playwrightLoaded
        ? 'ok'
        : 'skipped';
    httpStatus = rendered.httpStatus ?? httpStatus;
    cloudflareDetected = rendered.cloudflareDetected;
    finalUrl = rendered.finalUrl || finalUrl;

    if (!rendered.errorCode && rendered.html.trim()) {
      htmlLength = rendered.html.length;
      const parseResult = await this.parseWithTimeout(rendered.html, rendered.finalUrl);
      if (parseResult) {
        lastDebug = parseResult.debug;
        mergeSources.push({ name: 'playwright', partial: parseResult.data });
        if (this.isAcceptablePrefill(parseResult.data)) {
          return this.successResult({
            sourceUrl: requestUrl.href,
            listingId,
            strategyUsed: 'playwright',
            startedAt,
            startedMs,
            data: parseResult.data,
            debug: parseResult.debug,
            apiStatus,
            htmlStatus,
            playwrightStatus,
            playwrightAttempted,
            playwrightLoaded,
            playwrightFailed,
            fetchFallbackUsed,
            htmlLength,
            finalUrl,
            httpStatus,
            cloudflareDetected,
            options,
          });
        }
      }
    }

    const merged = mergeSrealityListingPrefills(mergeSources);
    lastDebug = merged.debug;
    if (hasBasicPrefillData(merged.data)) {
      strategyUsed = 'merged';
      return this.successResult({
        sourceUrl: requestUrl.href,
        listingId,
        strategyUsed,
        startedAt,
        startedMs,
        data: merged.data,
        debug: merged.debug,
        apiStatus,
        htmlStatus,
        playwrightStatus,
        playwrightAttempted,
        playwrightLoaded,
        playwrightFailed,
        fetchFallbackUsed,
        htmlLength,
        finalUrl,
        httpStatus,
        cloudflareDetected,
        options,
      });
    }

    const endedAt = new Date();
    const errorCode = this.resolveFailureCode({
      apiStatus,
      htmlStatus,
      playwrightStatus,
      cloudflareDetected,
      listingId,
    });
    const errorDetail = this.resolveFailureDetail({
      apiStatus,
      htmlStatus,
      playwrightStatus,
      renderedError: rendered.errorDetail,
      listingId,
      fieldsFoundCount: merged.debug.fieldsFoundCount,
    });

    const failLog = this.buildBaseLog({
      url: requestUrl.href,
      extractedListingId: listingId,
      strategyUsed: 'none',
      startedAt,
      endedAt,
      startedMs,
      apiStatus,
      htmlStatus,
      playwrightStatus,
      httpStatus,
      cloudflareDetected,
      playwrightAttempted,
      playwrightLoaded,
      playwrightFailed,
      fetchFallbackUsed,
      htmlLength,
      finalUrl,
      errorCode,
      errorDetail,
      errorMessage: errorDetail,
      debug: merged.debug,
    });

    const error = this.errorMessageFromCode(errorCode, errorDetail);
    this.writeLog(failLog, error);
    return {
      ok: false,
      error,
      log: failLog,
      debug: options?.debug ? merged.debug : undefined,
    };
  }

  private successResult(params: {
    sourceUrl: string;
    listingId: string | null;
    strategyUsed: SrealityPrefillStrategy;
    startedAt: Date;
    startedMs: number;
    data: SrealityListingPrefill;
    debug: SrealityParseDebug;
    apiStatus: number | null;
    htmlStatus: number | null;
    playwrightStatus: string | null;
    playwrightAttempted: boolean;
    playwrightLoaded: boolean;
    playwrightFailed: boolean;
    fetchFallbackUsed: boolean;
    htmlLength: number;
    finalUrl: string;
    httpStatus: number | null;
    cloudflareDetected: boolean;
    options?: { debug?: boolean };
  }): SrealityPrefillResult {
    const endedAt = new Date();
    const data = {
      ...params.data,
      rawSourceData: {
        ...(params.data.rawSourceData ?? {}),
        sourceUrl: params.sourceUrl,
        listingId: params.listingId,
        strategyUsed: params.strategyUsed,
      },
    };
    const log = this.buildSuccessLog({
      url: params.sourceUrl,
      extractedListingId: params.listingId,
      strategyUsed: params.strategyUsed,
      startedAt: params.startedAt,
      endedAt,
      startedMs: params.startedMs,
      apiStatus: params.apiStatus,
      htmlStatus: params.htmlStatus,
      playwrightStatus: params.playwrightStatus,
      httpStatus: params.httpStatus,
      cloudflareDetected: params.cloudflareDetected,
      playwrightAttempted: params.playwrightAttempted,
      playwrightLoaded: params.playwrightLoaded,
      playwrightFailed: params.playwrightFailed,
      fetchFallbackUsed: params.fetchFallbackUsed,
      htmlLength: params.htmlLength,
      finalUrl: params.finalUrl,
      debug: params.debug,
    });
    this.writeLog(log);
    return {
      ok: true,
      data,
      log,
      debug: params.options?.debug ? params.debug : undefined,
    };
  }

  private isAcceptablePrefill(data: SrealityListingPrefill): boolean {
    return (
      hasMinimumPrefillData(data) ||
      hasPartialPrefillData(data) ||
      hasBasicPrefillData(data)
    );
  }

  private resolveFailureCode(params: {
    apiStatus: number | null;
    htmlStatus: number | null;
    playwrightStatus: string | null;
    cloudflareDetected: boolean;
    listingId: string | null;
  }): string {
    if (!params.listingId) return 'INVALID_URL';
    if (params.cloudflareDetected) return 'CLOUDFLARE';
    if (params.playwrightStatus?.includes('COOKIE_CONSENT')) return 'COOKIE_CONSENT';
    if (params.apiStatus === 403 || params.htmlStatus === 403) return 'HTTP_403';
    if (params.playwrightStatus?.includes('TIMEOUT')) return 'TIMEOUT';
    if (params.apiStatus && params.apiStatus >= 400 && params.htmlStatus && params.htmlStatus >= 400) {
      return 'AUTO_BLOCKED';
    }
    return 'PARSER_NO_DATA';
  }

  private resolveFailureDetail(params: {
    apiStatus: number | null;
    htmlStatus: number | null;
    playwrightStatus: string | null;
    renderedError?: string;
    listingId: string | null;
    fieldsFoundCount: number;
  }): string {
    const parts = [
      params.listingId ? `listingId=${params.listingId}` : null,
      params.apiStatus != null ? `apiStatus=${params.apiStatus}` : null,
      params.htmlStatus != null ? `htmlStatus=${params.htmlStatus}` : null,
      params.playwrightStatus ? `playwrightStatus=${params.playwrightStatus}` : null,
      params.renderedError ? `playwright=${params.renderedError}` : null,
      `fieldsFound=${params.fieldsFoundCount}`,
    ].filter(Boolean);
    return parts.join(' | ');
  }

  private async parseWithTimeout(
    html: string,
    pageUrl: string,
  ): Promise<{ data: SrealityListingPrefill; debug: SrealityParseDebug } | null> {
    try {
      return await this.withTimeout(
        Promise.resolve(parseSrealityListingMulti(html, pageUrl)),
        PARSER_TIMEOUT_MS,
        'PARSER_TIMEOUT',
        `Parser timeout po ${PARSER_TIMEOUT_MS} ms`,
      );
    } catch (err) {
      this.log.warn(
        `Sreality parser timeout url=${pageUrl}: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  private async fetchHtmlFallback(url: string): Promise<{
    html: string;
    finalUrl: string;
    httpStatus: number | null;
    errorCode?: string;
    errorDetail?: string;
  }> {
    try {
      const res = await axios.get(url, {
        timeout: FETCH_HTML_TIMEOUT_MS,
        maxRedirects: 5,
        maxContentLength: MAX_HTML_BYTES,
        responseType: 'text',
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
          'User-Agent': BROWSER_USER_AGENT,
        },
        validateStatus: () => true,
      });

      const finalUrl =
        typeof res.request?.res?.responseUrl === 'string'
          ? res.request.res.responseUrl
          : url;

      if (res.status === 403) {
        return {
          html: '',
          finalUrl,
          httpStatus: 403,
          errorCode: 'HTTP_403',
          errorDetail: 'Sreality odmítlo požadavek (HTTP 403).',
        };
      }

      const html = typeof res.data === 'string' ? res.data : '';
      if (/just a moment|cf-browser-verification|challenge-platform/i.test(html.slice(0, 50_000))) {
        return {
          html: '',
          finalUrl,
          httpStatus: res.status,
          errorCode: 'CLOUDFLARE',
          errorDetail: 'Stránka je chráněna Cloudflare.',
        };
      }

      return { html, finalUrl, httpStatus: res.status };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        html: '',
        finalUrl: url,
        httpStatus: null,
        errorCode: /timeout/i.test(msg) ? 'TIMEOUT' : 'FETCH_ERROR',
        errorDetail: `HTML fetch selhal: ${msg}`,
      };
    }
  }

  private buildSuccessLog(params: {
    url: string;
    extractedListingId: string | null;
    strategyUsed: SrealityPrefillStrategy;
    startedAt: Date;
    endedAt: Date;
    startedMs: number;
    apiStatus: number | null;
    htmlStatus: number | null;
    playwrightStatus: string | null;
    httpStatus: number | null;
    cloudflareDetected: boolean;
    playwrightAttempted: boolean;
    playwrightLoaded: boolean;
    playwrightFailed: boolean;
    fetchFallbackUsed: boolean;
    htmlLength: number;
    finalUrl: string;
    debug: SrealityParseDebug;
  }): SrealityPrefillLog {
    return {
      url: params.url,
      extractedListingId: params.extractedListingId,
      strategyUsed: params.strategyUsed,
      startedAt: params.startedAt.toISOString(),
      endedAt: params.endedAt.toISOString(),
      durationMs: params.endedAt.getTime() - params.startedMs,
      apiStatus: params.apiStatus,
      htmlStatus: params.htmlStatus,
      playwrightStatus: params.playwrightStatus,
      httpStatus: params.httpStatus,
      cloudflareDetected: params.cloudflareDetected,
      playwrightAttempted: params.playwrightAttempted,
      playwrightLoaded: params.playwrightLoaded,
      playwrightFailed: params.playwrightFailed,
      fetchFallbackUsed: params.fetchFallbackUsed,
      foundJsonLd: params.debug.foundJsonLd,
      foundNextData: params.debug.foundNextData,
      foundInitialState: params.debug.foundInitialState,
      foundOpenGraph: params.debug.foundOpenGraph,
      foundHtmlParser: params.debug.foundHtmlParser,
      fieldsFoundCount: params.debug.fieldsFoundCount,
      fieldsFound: params.debug.fieldsFound,
      parsersUsed: params.debug.parsersUsed,
      htmlLength: params.htmlLength,
      finalUrl: params.finalUrl,
    };
  }

  private buildBaseLog(params: {
    url: string;
    extractedListingId: string | null;
    strategyUsed: SrealityPrefillStrategy;
    startedAt: Date;
    endedAt: Date;
    startedMs: number;
    apiStatus?: number | null;
    htmlStatus?: number | null;
    playwrightStatus?: string | null;
    httpStatus?: number | null;
    cloudflareDetected?: boolean;
    playwrightAttempted: boolean;
    playwrightLoaded: boolean;
    playwrightFailed: boolean;
    fetchFallbackUsed: boolean;
    htmlLength?: number;
    finalUrl?: string;
    errorCode?: string;
    errorDetail?: string;
    errorMessage?: string;
    debug?: SrealityParseDebug;
  }): SrealityPrefillLog {
    return {
      url: params.url,
      extractedListingId: params.extractedListingId,
      strategyUsed: params.strategyUsed,
      startedAt: params.startedAt.toISOString(),
      endedAt: params.endedAt.toISOString(),
      durationMs: params.endedAt.getTime() - params.startedMs,
      apiStatus: params.apiStatus ?? null,
      htmlStatus: params.htmlStatus ?? null,
      playwrightStatus: params.playwrightStatus ?? null,
      httpStatus: params.httpStatus ?? null,
      cloudflareDetected: params.cloudflareDetected ?? false,
      playwrightAttempted: params.playwrightAttempted,
      playwrightLoaded: params.playwrightLoaded,
      playwrightFailed: params.playwrightFailed,
      fetchFallbackUsed: params.fetchFallbackUsed,
      foundJsonLd: params.debug?.foundJsonLd ?? false,
      foundNextData: params.debug?.foundNextData ?? false,
      foundInitialState: params.debug?.foundInitialState ?? false,
      foundOpenGraph: params.debug?.foundOpenGraph ?? false,
      foundHtmlParser: params.debug?.foundHtmlParser ?? false,
      fieldsFoundCount: params.debug?.fieldsFoundCount ?? 0,
      fieldsFound: params.debug?.fieldsFound ?? [],
      parsersUsed: params.debug?.parsersUsed ?? [],
      htmlLength: params.htmlLength ?? 0,
      finalUrl: params.finalUrl ?? params.url,
      errorCode: params.errorCode,
      errorDetail: params.errorDetail,
      errorMessage: params.errorMessage ?? params.errorDetail,
    };
  }

  private debugFromPrefill(
    data: SrealityListingPrefill,
    parsersUsed: string[],
  ): SrealityParseDebug {
    const fields = Object.entries(data)
      .filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0))
      .map(([k]) => k);
    return {
      foundJsonLd: false,
      foundNextData: false,
      foundInitialState: false,
      foundOpenGraph: false,
      foundHtmlParser: false,
      parsersUsed,
      fieldsFound: fields,
      fieldsFoundCount: fields.length,
    };
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    code: string,
    message: string,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new PrefillTimeoutError(code, message)), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async fetchSourceImages(urls: string[]): Promise<
    | { ok: true; images: Array<{ fileName: string; mimeType: string; base64: string }> }
    | { ok: false; error: string }
  > {
    const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))].slice(0, 30);
    if (!unique.length) {
      return { ok: false, error: 'Chybí URL fotek.' };
    }

    for (const url of unique) {
      if (!isSrealityHost(url)) {
        return { ok: false, error: 'Fotky lze stáhnout pouze ze sreality.cz.' };
      }
    }

    const images: Array<{ fileName: string; mimeType: string; base64: string }> = [];
    for (let i = 0; i < unique.length; i += 1) {
      const url = unique[i]!;
      try {
        const res = await fetch(url, {
          redirect: 'follow',
          signal: AbortSignal.timeout(12_000),
          headers: {
            Accept: 'image/*',
            'User-Agent': BROWSER_USER_AGENT,
          },
        });
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        if (!buf.length || buf.length > MAX_IMAGE_BYTES) continue;
        const mimeType = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';
        if (!mimeType.startsWith('image/')) continue;
        const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
        images.push({
          fileName: `sreality-${i + 1}.${ext}`,
          mimeType,
          base64: buf.toString('base64'),
        });
      } catch (err) {
        this.log.warn(`fetch source image failed ${url}: ${err instanceof Error ? err.message : err}`);
      }
    }

    if (!images.length) {
      return { ok: false, error: 'Fotky prosím nahrajte vlastní.' };
    }

    return { ok: true, images };
  }

  private writeLog(entry: SrealityPrefillLog, errorMessage?: string): void {
    this.log.log(
      [
        `Sreality prefill url=${entry.url}`,
        `listingId=${entry.extractedListingId ?? 'n/a'}`,
        `strategy=${entry.strategyUsed}`,
        `apiStatus=${entry.apiStatus ?? 'n/a'}`,
        `htmlStatus=${entry.htmlStatus ?? 'n/a'}`,
        `playwrightStatus=${entry.playwrightStatus ?? 'n/a'}`,
        `fieldsFound=${entry.fieldsFoundCount}`,
        `durationMs=${entry.durationMs}`,
        entry.errorCode ? `errorCode=${entry.errorCode}` : null,
        errorMessage ?? entry.errorMessage ? `errorMessage=${errorMessage ?? entry.errorMessage}` : null,
      ]
        .filter(Boolean)
        .join(' | '),
    );
  }

  private errorMessageFromCode(code: string, detail?: string): string {
    switch (code) {
      case 'INVALID_URL':
        return detail ?? 'Neplatná URL — zkontrolujte odkaz ze Sreality.';
      case 'HTTP_403':
      case 'CLOUDFLARE':
      case 'COOKIE_CONSENT':
      case 'AUTO_BLOCKED':
      case 'PARSER_NO_DATA':
      case 'EMPTY_HTML':
      case 'FETCH_ERROR':
      case 'PLAYWRIGHT_UNAVAILABLE':
      case 'PLAYWRIGHT_ERROR':
        return 'Sreality blokuje automatické načtení. Zkopírujte prosím text ručně.';
      case 'TIMEOUT':
        return 'Načtení trvalo příliš dlouho. Zkuste to později nebo vyplňte inzerát ručně.';
      default:
        return detail ?? 'Sreality blokuje automatické načtení. Zkopírujte prosím text ručně.';
    }
  }
}

class PrefillTimeoutError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PrefillTimeoutError';
  }
}
