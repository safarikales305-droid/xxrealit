import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  assertSrealityListingUrl,
  hasMinimumPrefillData,
  hasPartialPrefillData,
  parseSrealityListingMulti,
  type SrealityListingPrefill,
  type SrealityParseDebug,
} from './sreality-listing-prefill.util';
import { isSrealityHost } from '../link-preview/sreality-scraper.util';
import { SrealityPlaywrightService } from './sreality-playwright.service';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const PREFILL_TOTAL_TIMEOUT_MS = 40_000;
const PLAYWRIGHT_TIMEOUT_MS = 35_000;
const FETCH_HTML_TIMEOUT_MS = 15_000;
const PARSER_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 3 * 1024 * 1024;

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export type SrealityPrefillLog = {
  url: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
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
        startedAt,
        endedAt,
        startedMs,
        playwrightAttempted: true,
        playwrightLoaded: false,
        playwrightFailed: true,
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
        startedAt,
        endedAt,
        startedMs,
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

    let playwrightAttempted = false;
    let playwrightLoaded = false;
    let playwrightFailed = false;
    let fetchFallbackUsed = false;
    let renderedHtml = '';
    let renderedFinalUrl = requestUrl.href;
    let httpStatus: number | null = null;
    let cloudflareDetected = false;
    let lastErrorCode: string | undefined;
    let lastErrorDetail: string | undefined;

    playwrightAttempted = true;
    const rendered = await this.playwright.renderPage(requestUrl.href, {
      timeoutMs: PLAYWRIGHT_TIMEOUT_MS,
      retries: 1,
    });

    playwrightLoaded = rendered.playwrightLoaded;
    httpStatus = rendered.httpStatus;
    cloudflareDetected = rendered.cloudflareDetected;
    renderedHtml = rendered.html;
    renderedFinalUrl = rendered.finalUrl || requestUrl.href;
    lastErrorCode = rendered.errorCode;
    lastErrorDetail = rendered.errorDetail;

    if (rendered.errorCode) {
      playwrightFailed = true;
    }

    const playwrightUsable =
      !rendered.errorCode && rendered.html.trim().length > 0 && !cloudflareDetected;

    if (playwrightUsable) {
      const parseResult = await this.parseWithTimeout(rendered.html, renderedFinalUrl);
      if (parseResult && this.isAcceptablePrefill(parseResult.data)) {
        const endedAt = new Date();
        const log = this.buildSuccessLog({
          url: requestUrl.href,
          startedAt,
          endedAt,
          startedMs,
          httpStatus,
          cloudflareDetected,
          playwrightAttempted,
          playwrightLoaded,
          playwrightFailed,
          fetchFallbackUsed,
          htmlLength: rendered.html.length,
          finalUrl: renderedFinalUrl,
          debug: parseResult.debug,
        });
        this.writeLog(log);
        return {
          ok: true,
          data: parseResult.data,
          log,
          debug: options?.debug ? parseResult.debug : undefined,
        };
      }
      if (parseResult && !this.isAcceptablePrefill(parseResult.data)) {
        lastErrorCode = 'PARSER_NO_DATA';
        lastErrorDetail = `Playwright HTML bez dostatečných dat. Polí: ${parseResult.debug.fieldsFoundCount}.`;
      }
    }

    if (!playwrightUsable || playwrightFailed || lastErrorCode === 'PARSER_NO_DATA') {
      fetchFallbackUsed = true;
      const fetched = await this.fetchHtmlFallback(requestUrl.href);
      if (fetched.html.trim()) {
        renderedHtml = fetched.html;
        renderedFinalUrl = fetched.finalUrl;
        httpStatus = fetched.httpStatus ?? httpStatus;
        const parseResult = await this.parseWithTimeout(fetched.html, fetched.finalUrl);
        if (parseResult && this.isAcceptablePrefill(parseResult.data)) {
          const endedAt = new Date();
          const log = this.buildSuccessLog({
            url: requestUrl.href,
            startedAt,
            endedAt,
            startedMs,
            httpStatus,
            cloudflareDetected: false,
            playwrightAttempted,
            playwrightLoaded,
            playwrightFailed,
            fetchFallbackUsed,
            htmlLength: fetched.html.length,
            finalUrl: fetched.finalUrl,
            debug: parseResult.debug,
          });
          this.writeLog(log);
          return {
            ok: true,
            data: parseResult.data,
            log,
            debug: options?.debug ? parseResult.debug : undefined,
          };
        }
        if (parseResult) {
          lastErrorCode = 'PARSER_NO_DATA';
          lastErrorDetail = `Fetch fallback: parser nenašel minimum. Polí: ${parseResult.debug.fieldsFoundCount}. Parsery: ${parseResult.debug.parsersUsed.join(', ') || 'žádný'}.`;
        }
      } else if (fetched.errorCode) {
        lastErrorCode = lastErrorCode ?? fetched.errorCode;
        lastErrorDetail = lastErrorDetail ?? fetched.errorDetail;
      }
    }

    const endedAt = new Date();
    const errorCode =
      lastErrorCode ??
      (renderedHtml.trim() ? 'PARSER_NO_DATA' : playwrightFailed ? 'PLAYWRIGHT_ERROR' : 'EMPTY_HTML');
    const errorDetail =
      lastErrorDetail ??
      (renderedHtml.trim()
        ? 'Parser nenašel dostatečná data v HTML.'
        : 'Nepodařilo se načíst HTML stránky.');

    const failLog = this.buildBaseLog({
      url: requestUrl.href,
      startedAt,
      endedAt,
      startedMs,
      httpStatus,
      cloudflareDetected,
      playwrightAttempted,
      playwrightLoaded,
      playwrightFailed,
      fetchFallbackUsed,
      htmlLength: renderedHtml.length,
      finalUrl: renderedFinalUrl,
      errorCode,
      errorDetail,
      errorMessage: errorDetail,
    });

    if (renderedHtml.trim()) {
      const { debug } = parseSrealityListingMulti(renderedHtml, renderedFinalUrl);
      failLog.foundJsonLd = debug.foundJsonLd;
      failLog.foundNextData = debug.foundNextData;
      failLog.foundInitialState = debug.foundInitialState;
      failLog.foundOpenGraph = debug.foundOpenGraph;
      failLog.foundHtmlParser = debug.foundHtmlParser;
      failLog.fieldsFoundCount = debug.fieldsFoundCount;
      failLog.fieldsFound = debug.fieldsFound;
      failLog.parsersUsed = debug.parsersUsed;
    }

    const error = this.errorMessageFromCode(errorCode, errorDetail);
    this.writeLog(failLog, error);
    return {
      ok: false,
      error,
      log: failLog,
      debug: options?.debug ? this.debugFromLog(failLog) : undefined,
    };
  }

  private isAcceptablePrefill(data: SrealityListingPrefill): boolean {
    return hasMinimumPrefillData(data) || hasPartialPrefillData(data);
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

      if (/cmp\.seznam\.cz/i.test(finalUrl)) {
        return {
          html,
          finalUrl,
          httpStatus: res.status,
          errorCode: 'COOKIE_CONSENT',
          errorDetail: 'Sreality přesměrovalo na souhlas cookies — fetch fallback bez Playwright.',
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
        errorDetail: `Fetch fallback selhal: ${msg}`,
      };
    }
  }

  private buildSuccessLog(params: {
    url: string;
    startedAt: Date;
    endedAt: Date;
    startedMs: number;
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
      startedAt: params.startedAt.toISOString(),
      endedAt: params.endedAt.toISOString(),
      durationMs: params.endedAt.getTime() - params.startedMs,
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
    startedAt: Date;
    endedAt: Date;
    startedMs: number;
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
  }): SrealityPrefillLog {
    return {
      url: params.url,
      startedAt: params.startedAt.toISOString(),
      endedAt: params.endedAt.toISOString(),
      durationMs: params.endedAt.getTime() - params.startedMs,
      httpStatus: params.httpStatus ?? null,
      cloudflareDetected: params.cloudflareDetected ?? false,
      playwrightAttempted: params.playwrightAttempted,
      playwrightLoaded: params.playwrightLoaded,
      playwrightFailed: params.playwrightFailed,
      fetchFallbackUsed: params.fetchFallbackUsed,
      foundJsonLd: false,
      foundNextData: false,
      foundInitialState: false,
      foundOpenGraph: false,
      foundHtmlParser: false,
      fieldsFoundCount: 0,
      fieldsFound: [],
      parsersUsed: [],
      htmlLength: params.htmlLength ?? 0,
      finalUrl: params.finalUrl ?? params.url,
      errorCode: params.errorCode,
      errorDetail: params.errorDetail,
      errorMessage: params.errorMessage ?? params.errorDetail,
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
        `start=${entry.startedAt}`,
        `end=${entry.endedAt}`,
        `durationMs=${entry.durationMs}`,
        `playwrightAttempted=${entry.playwrightAttempted}`,
        `playwrightLoaded=${entry.playwrightLoaded}`,
        `playwrightFailed=${entry.playwrightFailed}`,
        `fetchFallback=${entry.fetchFallbackUsed}`,
        `httpStatus=${entry.httpStatus ?? 'n/a'}`,
        `cloudflare=${entry.cloudflareDetected}`,
        `fields=${entry.fieldsFoundCount}`,
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
        return 'Sreality blokuje načtení (HTTP 403). Vyplňte inzerát ručně.';
      case 'CLOUDFLARE':
        return 'Sreality blokuje načtení (ochrana Cloudflare). Vyplňte inzerát ručně.';
      case 'COOKIE_CONSENT':
        return 'Sreality blokuje načtení (souhlas cookies Seznam). Vyplňte inzerát ručně.';
      case 'TIMEOUT':
        return detail?.includes('40')
          ? 'Vypršel časový limit načítání (40 s). Zkuste to později nebo vyplňte inzerát ručně.'
          : `Vypršel časový limit načítání. ${detail ?? ''}`.trim();
      case 'PLAYWRIGHT_UNAVAILABLE':
        return detail
          ? `Playwright není dostupný: ${detail}`
          : 'Playwright není na serveru dostupný — kontaktujte administrátora.';
      case 'PLAYWRIGHT_ERROR':
        return detail
          ? `Playwright selhal: ${detail}`
          : 'Playwright selhal při spuštění prohlížeče.';
      case 'PARSER_NO_DATA':
        return `Parser nenašel dostatečná data v HTML. ${detail ?? 'Vyplňte inzerát ručně.'}`;
      case 'EMPTY_HTML':
        return 'Nepodařilo se načíst obsah stránky. Vyplňte inzerát ručně.';
      case 'FETCH_ERROR':
        return detail ?? 'Záložní načtení HTML selhalo. Vyplňte inzerát ručně.';
      default:
        return detail ?? `Import selhal (${code}). Vyplňte inzerát ručně.`;
    }
  }

  private emptyDebug(): SrealityParseDebug {
    return {
      foundJsonLd: false,
      foundNextData: false,
      foundInitialState: false,
      foundOpenGraph: false,
      foundHtmlParser: false,
      parsersUsed: [],
      fieldsFound: [],
      fieldsFoundCount: 0,
    };
  }

  private debugFromLog(entry: SrealityPrefillLog): SrealityParseDebug {
    return {
      foundJsonLd: entry.foundJsonLd,
      foundNextData: entry.foundNextData,
      foundInitialState: entry.foundInitialState,
      foundOpenGraph: entry.foundOpenGraph,
      foundHtmlParser: entry.foundHtmlParser,
      parsersUsed: entry.parsersUsed,
      fieldsFound: entry.fieldsFound,
      fieldsFoundCount: entry.fieldsFoundCount,
    };
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
