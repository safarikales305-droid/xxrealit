import { Injectable, Logger } from '@nestjs/common';
import {
  assertSrealityListingUrl,
  hasMinimumPrefillData,
  parseSrealityListingMulti,
  type SrealityListingPrefill,
  type SrealityParseDebug,
} from './sreality-listing-prefill.util';
import { isSrealityHost } from '../link-preview/sreality-scraper.util';
import { SrealityPlaywrightService } from './sreality-playwright.service';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export type SrealityPrefillLog = {
  url: string;
  httpStatus: number | null;
  cloudflareDetected: boolean;
  playwrightLoaded: boolean;
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
    let requestUrl: URL;
    try {
      requestUrl = assertSrealityListingUrl(sourceUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Neplatná URL';
      const failLog: SrealityPrefillLog = {
        url: sourceUrl,
        httpStatus: null,
        cloudflareDetected: false,
        playwrightLoaded: false,
        foundJsonLd: false,
        foundNextData: false,
        foundInitialState: false,
        foundOpenGraph: false,
        foundHtmlParser: false,
        fieldsFoundCount: 0,
        fieldsFound: [],
        parsersUsed: [],
        htmlLength: 0,
        finalUrl: sourceUrl,
        errorCode: 'INVALID_URL',
        errorDetail: message,
      };
      this.writeLog(failLog);
      return { ok: false, error: message, log: failLog };
    }

    const rendered = await this.playwright.renderPage(requestUrl.href);

    const baseLog: SrealityPrefillLog = {
      url: requestUrl.href,
      httpStatus: rendered.httpStatus,
      cloudflareDetected: rendered.cloudflareDetected,
      playwrightLoaded: rendered.playwrightLoaded,
      foundJsonLd: false,
      foundNextData: false,
      foundInitialState: false,
      foundOpenGraph: false,
      foundHtmlParser: false,
      fieldsFoundCount: 0,
      fieldsFound: [],
      parsersUsed: [],
      htmlLength: rendered.html.length,
      finalUrl: rendered.finalUrl,
      errorCode: rendered.errorCode,
      errorDetail: rendered.errorDetail,
    };

    if (rendered.errorCode) {
      const error = this.errorMessageFromCode(rendered.errorCode, rendered.errorDetail);
      const log = { ...baseLog };
      this.writeLog(log);
      return {
        ok: false,
        error,
        log,
        debug: options?.debug ? this.emptyDebug() : undefined,
      };
    }

    if (!rendered.html.trim()) {
      const log = {
        ...baseLog,
        errorCode: 'EMPTY_HTML',
        errorDetail: 'Playwright nenačetl HTML stránky.',
      };
      this.writeLog(log);
      return {
        ok: false,
        error: 'Playwright nenačetl obsah stránky. Zkuste to znovu nebo vyplňte inzerát ručně.',
        log,
      };
    }

    const { data, debug } = parseSrealityListingMulti(rendered.html, rendered.finalUrl || requestUrl.href);

    const log: SrealityPrefillLog = {
      ...baseLog,
      foundJsonLd: debug.foundJsonLd,
      foundNextData: debug.foundNextData,
      foundInitialState: debug.foundInitialState,
      foundOpenGraph: debug.foundOpenGraph,
      foundHtmlParser: debug.foundHtmlParser,
      fieldsFoundCount: debug.fieldsFoundCount,
      fieldsFound: debug.fieldsFound,
      parsersUsed: debug.parsersUsed,
    };

    if (!hasMinimumPrefillData(data)) {
      const failLog: SrealityPrefillLog = {
        ...log,
        errorCode: 'PARSER_NO_DATA',
        errorDetail: `Parsery nenašly minimum (název/popis + město). Nalezeno polí: ${debug.fieldsFoundCount}. Použité parsery: ${debug.parsersUsed.join(', ') || 'žádný'}.`,
      };
      this.writeLog(failLog);
      return {
        ok: false,
        error: this.errorMessageFromCode('PARSER_NO_DATA', failLog.errorDetail),
        log: failLog,
        debug: options?.debug ? debug : undefined,
      };
    }

    this.writeLog(log);
    return {
      ok: true,
      data,
      log,
      debug: options?.debug ? debug : undefined,
    };
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
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
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

  private writeLog(entry: SrealityPrefillLog): void {
    this.log.log(
      [
        `Sreality prefill url=${entry.url}`,
        `httpStatus=${entry.httpStatus ?? 'n/a'}`,
        `cloudflare=${entry.cloudflareDetected}`,
        `playwright=${entry.playwrightLoaded}`,
        `jsonLd=${entry.foundJsonLd}`,
        `nextData=${entry.foundNextData}`,
        `initialState=${entry.foundInitialState}`,
        `openGraph=${entry.foundOpenGraph}`,
        `htmlParser=${entry.foundHtmlParser}`,
        `fields=${entry.fieldsFoundCount}`,
        entry.errorCode ? `error=${entry.errorCode}` : null,
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
        return 'Sreality odmítlo požadavek (HTTP 403). Vyplňte inzerát ručně.';
      case 'CLOUDFLARE':
        return 'Stránka je chráněna Cloudflare — nepodařilo se načíst detail inzerátu.';
      case 'COOKIE_CONSENT':
        return 'Nepodařilo se projít souhlasem cookies Seznam — detail inzerátu nebyl načten.';
      case 'TIMEOUT':
        return `Vypršel časový limit načítání stránky. ${detail ?? ''}`.trim();
      case 'PLAYWRIGHT_UNAVAILABLE':
        return detail
          ? `Playwright není dostupný: ${detail}`
          : 'Playwright není na serveru dostupný — kontaktujte administrátora.';
      case 'PLAYWRIGHT_ERROR':
        return detail ? `Playwright selhal: ${detail}` : 'Playwright selhal při spuštění prohlížeče.';
      case 'PARSER_NO_DATA':
        return `Parser nenašel dostatečná data v HTML. ${detail ?? 'Vyplňte inzerát ručně.'}`;
      case 'EMPTY_HTML':
        return 'Playwright nenačetl obsah stránky. Vyplňte inzerát ručně.';
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
}
