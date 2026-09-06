import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'node:fs';
import type { SrealityBrokerPrefill } from './sreality-broker-extract.util';
import { extractSrealityBrokerFromRaw } from './sreality-broker-extract.util';
import {
  extractSrealityBrokerFromHtml,
  mergeBrokerParts,
} from './sreality-contact-extract.util';
import { dedupeSrealityImageUrls, imageDedupeKey, buildSrealityImageFetchCandidates } from './sreality-image.util';
import {
  buildSdnFullSizeCandidates,
  findBestCapturedForTargetUrl,
  findPoolEntryForTargetUrl,
  isLikelyImageResponse,
  isSrealityCdnResponseUrl,
  isSuccessfulImageStatus,
  matchKeysForImageUrl,
  urlsLikelySameImage,
  SREALITY_BROWSER_MEDIA_LIMITS,
  SREALITY_BROWSER_MEDIA_TIMEOUTS,
  inspectSrealityImageBuffer,
  validateSrealityImageBuffer,
  type SrealityBrowserCapturedImage,
  type SrealityImageCaptureMethod,
  type SrealityValidatedImageBuffer,
} from './sreality-browser-media.util';
import {
  formatImageCaptureAttemptLog,
  IMAGE_CAPTURE_ERROR_CODES,
  type SrealityImageCaptureAttempt,
} from './sreality-image-capture.pipeline';

/** Serializovaný browser script — bez vnořených funkcí kvůli esbuild __name v page.evaluate. */
const BROWSER_EXTRACT_GALLERY_IMAGE_URLS = `
(() => {
  const urls = new Set();
  const push = (raw) => {
    if (!raw) return;
    const s = String(raw).trim();
    if (!s || /logo|icon|sprite|1x1|avatar|profile/i.test(s)) return;
    if (/sdn\\.cz|sreality\\.cz/i.test(s) || /^\\/.*\\.(jpe?g|webp|png)/i.test(s)) {
      urls.add(s.startsWith('//') ? 'https:' + s : s);
    }
  };
  for (const img of Array.from(document.querySelectorAll('img'))) {
    push(img.getAttribute('src'));
    push(img.getAttribute('data-src'));
    push(img.getAttribute('data-original'));
    const srcset = img.getAttribute('srcset');
    if (srcset) {
      for (const part of srcset.split(',')) {
        push(part.trim().split(/\\s+/)[0]);
      }
    }
  }
  for (const source of Array.from(document.querySelectorAll('picture source'))) {
    push(source.getAttribute('srcset')?.split(',')[0]?.trim().split(/\\s+/)[0]);
  }
  return Array.from(urls);
})()
`;

export type SrealityPlaywrightEnrichmentResult = {
  imageUrls: string[];
  broker: Partial<SrealityBrokerPrefill>;
  html: string;
  contactClickAttempted: boolean;
  contactClickSucceeded: boolean;
  galleryOpened: boolean;
  errorCode?: string;
  errorDetail?: string;
  enrichmentStatus?: 'PASS' | 'PARTIAL' | 'TIMEOUT' | 'FAIL';
};

export type SrealityGalleryCaptureResult = {
  browserRuntime: 'READY' | 'FAIL';
  enrichmentStatus: 'PASS' | 'PARTIAL' | 'TIMEOUT' | 'FAIL' | 'NOT_REQUIRED';
  captured: SrealityBrowserCapturedImage[];
  broker: Partial<SrealityBrokerPrefill>;
  html: string;
  contactClickAttempted: boolean;
  contactClickSucceeded: boolean;
  galleryOpened: boolean;
  imageUrlsFound: string[];
  errorCode?: string;
  errorDetail?: string;
  stats: {
    browserResponseSuccess: number;
    elementCaptureSuccess: number;
    browserContextSuccess: number;
    domBlobSuccess: number;
    failed: number;
    responsesSeen: number;
  };
  captureAttempts?: SrealityImageCaptureAttempt[];
  galleryDiagnostics?: {
    galleryOpen: boolean;
    activeImageVisible: boolean;
    activeImageDimensions: string | null;
  };
};

export type SrealityFirstImageTestResult = {
  ok: boolean;
  galleryOpen: boolean;
  imageVisible: boolean;
  naturalSize: string | null;
  captureMethod: SrealityImageCaptureMethod | null;
  dimensions: string | null;
  bytes: number | null;
  contentHash: string | null;
  storedUrl: string | null;
  previewUrl: string | null;
  attempt: SrealityImageCaptureAttempt | null;
  errorCode?: string;
  errorMessage?: string;
};

export type SrealityPlaywrightRenderResult = {
  html: string;
  finalUrl: string;
  httpStatus: number | null;
  playwrightLoaded: boolean;
  cloudflareDetected: boolean;
  errorCode?: string;
  errorDetail?: string;
};

type PlaywrightCookie = {
  name: string;
  value: string;
  domain: string;
  path?: string;
};

const GOTO_TIMEOUT_MS = 10_000;
const LOAD_STATE_TIMEOUT_MS = 5_000;
const SELECTOR_TIMEOUT_MS = 4_000;
const DEFAULT_TOTAL_TIMEOUT_MS = 15_000;

const CHROMIUM_LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-blink-features=AutomationControlled',
];

type PlaywrightModule = {
  chromium: {
    launch: (opts: Record<string, unknown>) => Promise<PlaywrightBrowser>;
    executablePath: () => string;
  };
};

type PlaywrightBrowser = {
  newContext: (opts: Record<string, unknown>) => Promise<PlaywrightContext>;
  close: () => Promise<void>;
};

@Injectable()
export class SrealityPlaywrightService implements OnModuleDestroy {
  private readonly logger = new Logger(SrealityPlaywrightService.name);
  private sharedBrowser: PlaywrightBrowser | null = null;
  private sharedBrowserPromise: Promise<PlaywrightBrowser> | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleDestroy() {
    if (this.sharedBrowser) {
      await this.sharedBrowser.close().catch(() => undefined);
      this.sharedBrowser = null;
      this.sharedBrowserPromise = null;
    }
  }

  private async getSharedBrowser(): Promise<PlaywrightBrowser> {
    if (this.sharedBrowser) return this.sharedBrowser;
    if (!this.sharedBrowserPromise) {
      this.sharedBrowserPromise = (async () => {
        const playwright = await this.loadPlaywrightModule();
        const browser = await this.launchChromiumBrowser(playwright);
        this.sharedBrowser = browser;
        return browser;
      })();
    }
    return this.sharedBrowserPromise;
  }

  /** Browser fallback: galerie, lazy images, veřejný kontakt po kliknutí. */
  async enrichImportData(
    url: string,
    _options?: { timeoutMs?: number },
  ): Promise<SrealityPlaywrightEnrichmentResult> {
    try {
      const result = await this.enrichImportOnce(url);
      return { ...result, enrichmentStatus: 'PASS' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`SREALITY_BROWSER_FALLBACK_FAIL url=${url} err=${msg}`);
      return {
        imageUrls: [],
        broker: {},
        html: '',
        contactClickAttempted: false,
        contactClickSucceeded: false,
        galleryOpened: false,
        errorCode: /timeout/i.test(msg) ? 'TIMEOUT' : 'PLAYWRIGHT_ERROR',
        errorDetail: msg,
        enrichmentStatus: /timeout/i.test(msg) ? 'TIMEOUT' : 'FAIL',
      };
    }
  }

  /**
   * Veřejně vykreslené fotografie z browser session — response.body() nebo element screenshot.
   * Bez druhého server-side fetch na CDN URL, které vrací 401.
   */
  async captureGalleryImages(options: {
    listingUrl: string;
    targetUrls: string[];
    enrichContact?: boolean;
    onImageAttempt?: (attempt: SrealityImageCaptureAttempt) => void | Promise<void>;
    onImageCaptured?: (payload: {
      index: number;
      sourceUrl: string;
      captured: SrealityBrowserCapturedImage;
    }) => void | Promise<void>;
    elementCaptureOnly?: boolean;
    firstImageOnly?: boolean;
  }): Promise<SrealityGalleryCaptureResult> {
    const targetUrls = dedupeSrealityImageUrls(options.targetUrls);
    const enrichContact = options.enrichContact ?? false;
    if (!targetUrls.length && !enrichContact && !options.firstImageOnly) {
      return {
        browserRuntime: 'READY',
        enrichmentStatus: 'NOT_REQUIRED',
        captured: [],
        broker: {},
        html: '',
        contactClickAttempted: false,
        contactClickSucceeded: false,
        galleryOpened: false,
        imageUrlsFound: [],
        stats: {
          browserResponseSuccess: 0,
          elementCaptureSuccess: 0,
          browserContextSuccess: 0,
          domBlobSuccess: 0,
          failed: 0,
          responsesSeen: 0,
        },
      };
    }

    try {
      return await this.captureGalleryImagesOnce(
        options.listingUrl,
        targetUrls,
        enrichContact,
        options.onImageAttempt,
        options.elementCaptureOnly ?? false,
        options.firstImageOnly ?? false,
        options.onImageCaptured,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`SREALITY_BROWSER_MEDIA_CAPTURE_FAIL url=${options.listingUrl} err=${msg}`);
      return {
        browserRuntime: 'FAIL',
        enrichmentStatus: /timeout/i.test(msg) ? 'TIMEOUT' : 'FAIL',
        captured: [],
        broker: {},
        html: '',
        contactClickAttempted: false,
        contactClickSucceeded: false,
        galleryOpened: false,
        imageUrlsFound: [],
        errorCode: /timeout/i.test(msg) ? 'TIMEOUT' : 'PLAYWRIGHT_ERROR',
        errorDetail: msg,
        stats: {
          browserResponseSuccess: 0,
          elementCaptureSuccess: 0,
          browserContextSuccess: 0,
          domBlobSuccess: 0,
          failed: targetUrls.length,
          responsesSeen: 0,
        },
      };
    }
  }

  /** Admin diagnostika — pouze první fotografie až do buffer/storage. */
  async testFirstGalleryImage(options: {
    listingUrl: string;
    targetUrl?: string;
    upload?: (buffer: Buffer, contentType: string, fileName: string) => Promise<string>;
  }): Promise<SrealityFirstImageTestResult> {
    const urls = options.targetUrl ? dedupeSrealityImageUrls([options.targetUrl]) : [];
    const capture = await this.captureGalleryImages({
      listingUrl: options.listingUrl,
      targetUrls: urls,
      enrichContact: false,
      firstImageOnly: true,
      elementCaptureOnly: true,
    });

    const attempt = capture.captureAttempts?.[0] ?? null;
    const captured = capture.captured[0];
    if (!captured) {
      return {
        ok: false,
        galleryOpen: capture.galleryDiagnostics?.galleryOpen ?? false,
        imageVisible: capture.galleryDiagnostics?.activeImageVisible ?? false,
        naturalSize: capture.galleryDiagnostics?.activeImageDimensions ?? null,
        captureMethod: null,
        dimensions: null,
        bytes: null,
        contentHash: null,
        storedUrl: null,
        previewUrl: null,
        attempt,
        errorCode: attempt?.errorCode ?? capture.errorCode ?? IMAGE_CAPTURE_ERROR_CODES.CAPTURE_SYSTEM_FAILURE,
        errorMessage: attempt?.errorMessage ?? capture.errorDetail ?? 'Capture selhal',
      };
    }

    let storedUrl: string | null = null;
    if (options.upload) {
      try {
        const ext = captured.contentType.includes('png')
          ? 'png'
          : captured.contentType.includes('webp')
            ? 'webp'
            : 'jpg';
        storedUrl = await options.upload(
          captured.buffer,
          captured.contentType,
          `sreality-first-image-test.${ext}`,
        );
        if (attempt) attempt.storage = 'PASS';
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt) {
          attempt.storage = 'FAIL';
          attempt.errorCode = IMAGE_CAPTURE_ERROR_CODES.STORAGE_UPLOAD_FAILED;
          attempt.errorMessage = msg;
        }
        return {
          ok: false,
          galleryOpen: capture.galleryDiagnostics?.galleryOpen ?? true,
          imageVisible: true,
          naturalSize: `${captured.width}x${captured.height}`,
          captureMethod: captured.method,
          dimensions: `${captured.width}x${captured.height}`,
          bytes: captured.buffer.length,
          contentHash: captured.contentHash,
          storedUrl: null,
          previewUrl: null,
          attempt,
          errorCode: IMAGE_CAPTURE_ERROR_CODES.STORAGE_UPLOAD_FAILED,
          errorMessage: msg,
        };
      }
    } else if (attempt) {
      attempt.storage = 'PASS';
    }

    return {
      ok: true,
      galleryOpen: capture.galleryDiagnostics?.galleryOpen ?? true,
      imageVisible: true,
      naturalSize: `${captured.width}x${captured.height}`,
      captureMethod: captured.method,
      dimensions: `${captured.width}x${captured.height}`,
      bytes: captured.buffer.length,
      contentHash: captured.contentHash,
      storedUrl,
      previewUrl: storedUrl,
      attempt,
    };
  }

  /** Bezpečný health check pro admin diagnostiku. */
  async runBrowserHealthCheck(): Promise<{ status: 'READY' | 'FAIL'; reason?: string }> {
    try {
      const browser = await this.getSharedBrowser();
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        locale: 'cs-CZ',
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      });
      const page = await context.newPage();
      await page.goto('https://www.sreality.cz/', {
        waitUntil: 'domcontentloaded',
        timeout: 10_000,
      });
      const title = (await page.title()).trim();
      await page.close();
      await context.close();
      if (!title) {
        return { status: 'FAIL', reason: 'Prázdný title testovací stránky' };
      }
      return { status: 'READY' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`SREALITY_BROWSER_HEALTH_FAIL err=${msg}`);
      return { status: 'FAIL', reason: msg.slice(0, 200) };
    }
  }

  private async enrichImportOnce(url: string): Promise<SrealityPlaywrightEnrichmentResult> {
    this.logger.log(`SREALITY_BROWSER_FALLBACK_START url=${url}`);
    const browser = await this.getSharedBrowser();
    const storage = this.readStorageState();
    const contextOptions: Record<string, unknown> = {
      viewport: { width: 1440, height: 2400 },
      locale: 'cs-CZ',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      extraHTTPHeaders: { 'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8' },
    };
    if (storage && 'path' in storage) contextOptions.storageState = storage.path;

    const context = await browser.newContext(contextOptions);
    if (storage && 'cookies' in storage) {
      await context.addCookies(
        storage.cookies.map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path ?? '/',
        })),
      );
    }

    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    const networkJson: unknown[] = [];
    page.on('response', (response: PlaywrightResponse) => {
      void (async () => {
        const resUrl = response.url();
        if (!/contact|phone|broker|makler|client|premise|seller/i.test(resUrl)) return;
        if (response.status() < 200 || response.status() >= 300) return;
        const ct = response.headers()['content-type'] ?? '';
        if (!ct.includes('json')) return;
        try {
          networkJson.push(await response.json());
        } catch {
          /* ignore */
        }
      })();
    });

    let contactClickAttempted = false;
    let contactClickSucceeded = false;
    let galleryOpened = false;

    try {
      await page
        .goto('https://www.sreality.cz/', { waitUntil: 'domcontentloaded', timeout: 5_000 })
        .catch(() => undefined);
      await this.delay(page, 200);

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT_MS });
      await this.handleSeznamConsent(page, url, context);
      await page
        .waitForSelector('h1, [data-e2e="detail-heading"], main', { timeout: SELECTOR_TIMEOUT_MS })
        .catch(() => undefined);

      await page.evaluate(async () => {
        const steps = 4;
        for (let i = 1; i <= steps; i += 1) {
          window.scrollTo(0, (document.body.scrollHeight * i) / steps);
          await new Promise((r) => setTimeout(r, 350));
        }
      });

      const gallerySelectors = [
        '[data-e2e="detail-gallery"] img',
        '[data-e2e="detail-image"]',
        '.gallery img',
        'picture img',
        'main img[src*="sreality"]',
      ];
      for (const sel of gallerySelectors) {
        try {
          const el = page.locator(sel).first();
          if ((await el.count()) > 0) {
            await el.click({ timeout: 2000 }).catch(() => undefined);
            galleryOpened = true;
            await this.delay(page, 500);
            break;
          }
        } catch {
          /* ignore */
        }
      }

      const contactSelectors = [
        'button:has-text("Zobrazit telefon")',
        'button:has-text("Ukázat telefon")',
        'button:has-text("Zobrazit kontakt")',
        'button:has-text("Kontakt")',
        '[data-e2e="show-phone"]',
        '[data-e2e="contact-show"]',
      ];
      for (const sel of contactSelectors) {
        try {
          const el = page.locator(sel).first();
          if ((await el.count()) > 0) {
            contactClickAttempted = true;
            await el.click({ timeout: 2500 }).catch(() => undefined);
            await this.delay(page, 800);
            contactClickSucceeded = true;
            break;
          }
        } catch {
          /* ignore */
        }
      }

      if (!contactClickSucceeded) {
        await page
          .getByRole('button', { name: /zobrazit telefon|ukázat telefon|kontakt/i })
          .first()
          .click({ timeout: 1500 })
          .then(() => {
            contactClickAttempted = true;
            contactClickSucceeded = true;
          })
          .catch(() => undefined);
        if (contactClickSucceeded) await this.delay(page, 600);
      }

      const extracted = await this.extractGalleryImageUrlsFromPage(page);

      const html = await page.evaluate(() => document.documentElement.outerHTML);
      const htmlBroker = extractSrealityBrokerFromHtml(html);
      const networkBrokerParts = networkJson.map((payload) =>
        extractSrealityBrokerFromRaw(
          payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null,
        ),
      );
      const broker = mergeBrokerParts([htmlBroker, ...networkBrokerParts]);
      const imageUrls = dedupeSrealityImageUrls([...extracted]);

      this.logger.log(
        `SREALITY_GALLERY_LOADED images=${imageUrls.length} contactClick=${contactClickSucceeded} agent=${Boolean(broker.agentName || broker.companyName)}`,
      );

      return {
        imageUrls,
        broker,
        html,
        contactClickAttempted,
        contactClickSucceeded,
        galleryOpened,
      };
    } finally {
      await context.close().catch(() => undefined);
    }
  }

  private async captureGalleryImagesOnce(
    listingUrl: string,
    targetUrls: string[],
    enrichContact: boolean,
    onImageAttempt?: (attempt: SrealityImageCaptureAttempt) => void | Promise<void>,
    elementCaptureOnly = false,
    firstImageOnly = false,
    onImageCaptured?: (payload: {
      index: number;
      sourceUrl: string;
      captured: SrealityBrowserCapturedImage;
    }) => void | Promise<void>,
  ): Promise<SrealityGalleryCaptureResult> {
    this.logger.log(
      `SREALITY_BROWSER_MEDIA_START url=${listingUrl} targets=${targetUrls.length} contact=${enrichContact}`,
    );

    const browser = await this.getSharedBrowser();
    const storage = this.readStorageState();
    const contextOptions: Record<string, unknown> = {
      viewport: { width: 1440, height: 2400 },
      locale: 'cs-CZ',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      extraHTTPHeaders: { 'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8' },
    };
    if (storage && 'path' in storage) contextOptions.storageState = storage.path;

    const context = await browser.newContext(contextOptions);
    if (storage && 'cookies' in storage) {
      await context.addCookies(
        storage.cookies.map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path ?? '/',
        })),
      );
    }

    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const pendingByKey = new Map<string, string>();
    for (const url of targetUrls) {
      for (const key of matchKeysForImageUrl(url)) {
        if (!pendingByKey.has(key)) pendingByKey.set(key, url);
      }
    }

    const capturedByKey = new Map<string, SrealityBrowserCapturedImage>();
    const allResponsesByKey = new Map<string, SrealityBrowserCapturedImage>();
    const contentHashes = new Set<string>();
    const networkJson: unknown[] = [];
    const responseTasks: Promise<void>[] = [];
    const rawResponseBuffers = new Map<
      string,
      {
        url: string;
        buffer: Buffer;
        contentType: string | null;
        method: SrealityImageCaptureMethod;
      }
    >();
    let responsesSeen = 0;

    const assignToPending = (
      url: string,
      validated: SrealityValidatedImageBuffer,
      method: SrealityImageCaptureMethod,
    ) => {
      if (!validated) return;
      for (const key of matchKeysForImageUrl(url)) {
        const existing = allResponsesByKey.get(key);
        if (!existing || validated.buffer.length > existing.buffer.length) {
          allResponsesByKey.set(key, {
            ...validated,
            sourceUrl: url,
            matchKey: key,
            method,
          });
        }
      }
      for (const key of matchKeysForImageUrl(url)) {
        if (!pendingByKey.has(key) || capturedByKey.has(key)) continue;
        if (contentHashes.has(validated.contentHash)) continue;
        const sourceUrl = pendingByKey.get(key)!;
        capturedByKey.set(key, {
          ...validated,
          sourceUrl,
          matchKey: key,
          method,
        });
        contentHashes.add(validated.contentHash);
      }
    };

    const forceAssignToTargetUrl = (
      targetUrl: string,
      validated: SrealityValidatedImageBuffer,
      method: SrealityImageCaptureMethod,
    ) => {
      assignToPending(targetUrl, validated, method);
      for (const key of matchKeysForImageUrl(targetUrl)) {
        if (contentHashes.has(validated.contentHash) && capturedByKey.has(key)) return;
        capturedByKey.set(key, {
          ...validated,
          sourceUrl: targetUrl,
          matchKey: key,
          method,
        });
        contentHashes.add(validated.contentHash);
      }
    };

    const storeBuffer = async (
      url: string,
      buffer: Buffer,
      contentType: string | null,
      method: SrealityImageCaptureMethod,
    ) => {
      const inspected = await inspectSrealityImageBuffer(buffer, contentType);
      if (!inspected) return false;

      for (const key of matchKeysForImageUrl(url)) {
        const existing = allResponsesByKey.get(key);
        if (!existing || inspected.buffer.length > existing.buffer.length) {
          allResponsesByKey.set(key, {
            ...inspected,
            sourceUrl: url,
            matchKey: key,
            method,
          });
        }
      }

      if (
        inspected.buffer.length < SREALITY_BROWSER_MEDIA_LIMITS.MIN_BYTES ||
        inspected.width < SREALITY_BROWSER_MEDIA_LIMITS.MIN_WIDTH ||
        inspected.height < SREALITY_BROWSER_MEDIA_LIMITS.MIN_HEIGHT
      ) {
        return false;
      }

      assignToPending(url, inspected, method);
      this.logger.log(
        `SREALITY_BROWSER_IMAGE_BUFFER_CREATED method=${method} bytes=${inspected.buffer.length} size=${inspected.width}x${inspected.height}`,
      );
      return true;
    };

    const processedRawKeys = new Set<string>();
    const processRawResponseBuffers = async () => {
      for (const [key, raw] of rawResponseBuffers.entries()) {
        if (processedRawKeys.has(key)) continue;
        processedRawKeys.add(key);
        await storeBuffer(raw.url, raw.buffer, raw.contentType, raw.method);
        for (const pendingUrl of new Set(pendingByKey.values())) {
          if (urlsLikelySameImage(raw.url, pendingUrl)) {
            await storeBuffer(pendingUrl, raw.buffer, raw.contentType, raw.method);
          }
        }
      }
    };

    page.on('response', (response: PlaywrightResponse) => {
      responseTasks.push(
        (async () => {
          const resUrl = response.url();
          const status = response.status();
          const ct = response.headers()['content-type'] ?? '';

          if (/contact|phone|broker|makler|client|premise|seller/i.test(resUrl)) {
            if (status >= 200 && status < 300 && ct.includes('json')) {
              try {
                networkJson.push(await response.json());
              } catch {
                /* ignore */
              }
            }
            return;
          }

          if (!isSrealityCdnResponseUrl(resUrl)) return;
          if (!isSuccessfulImageStatus(status)) return;
          if (!isLikelyImageResponse(ct)) return;
          responsesSeen += 1;
          try {
            const body = await this.withTimeout(
              response.body(),
              SREALITY_BROWSER_MEDIA_TIMEOUTS.RESPONSE_BODY_MS,
              'response.body timeout',
            ).catch(() => null);
            if (!body?.length) return;
            const key = imageDedupeKey(resUrl);
            const existing = rawResponseBuffers.get(key);
            if (!existing || body.length > existing.buffer.length) {
              rawResponseBuffers.set(key, {
                url: resUrl,
                buffer: body,
                contentType: ct,
                method: 'BROWSER_RESPONSE',
              });
              processedRawKeys.delete(key);
            }
          } catch {
            /* ignore */
          }
        })(),
      );
    });

    this.logger.log('SREALITY_BROWSER_CONTEXT_CREATED');

    let contactClickAttempted = false;
    let contactClickSucceeded = false;
    let galleryOpened = false;
    let html = '';
    let imageUrlsFound: string[] = [];
    let enrichmentStatus: SrealityGalleryCaptureResult['enrichmentStatus'] = 'PASS';

    try {
      this.logger.log(`SREALITY_BROWSER_PAGE_OPEN url=${listingUrl}`);
      await page
        .goto('https://www.sreality.cz/', { waitUntil: 'domcontentloaded', timeout: 8_000 })
        .catch(() => undefined);
      await this.delay(page, 300);
      await page.goto(listingUrl, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT_MS });
      await this.handleSeznamConsent(page, listingUrl, context);
      await this.dismissCookieBanners(page);
      await this.withTimeout(
        (async () => {
          await page
            .waitForSelector('h1, [data-e2e="detail-heading"], main, img', { timeout: SELECTOR_TIMEOUT_MS })
            .catch(() => undefined);
          await this.delay(page, 400);
          await page.evaluate(async () => {
            const steps = 6;
            for (let i = 1; i <= steps; i += 1) {
              window.scrollTo(0, (document.body.scrollHeight * i) / steps);
              await new Promise((r) => setTimeout(r, 400));
            }
          });
        })(),
        SREALITY_BROWSER_MEDIA_TIMEOUTS.PAGE_LOAD_MS,
        `PAGE_LOAD timeout po ${SREALITY_BROWSER_MEDIA_TIMEOUTS.PAGE_LOAD_MS} ms`,
      );
      this.logger.log('SREALITY_BROWSER_PAGE_LOADED');
      await this.drainResponseTasks(responseTasks);
      await processRawResponseBuffers();

      let effectiveTargetUrls = [...targetUrls];
      if (!effectiveTargetUrls.length) {
        const discovered = await this.extractGalleryImageUrlsFromPage(page);
        if (discovered.length) {
          effectiveTargetUrls = firstImageOnly ? [discovered[0]!] : discovered;
        } else if (allResponsesByKey.size > 0) {
          const largest = [...allResponsesByKey.values()].sort(
            (a, b) => b.buffer.length - a.buffer.length,
          )[0];
          if (largest?.sourceUrl) effectiveTargetUrls = [largest.sourceUrl];
        }
        pendingByKey.clear();
        for (const url of effectiveTargetUrls) {
          for (const key of matchKeysForImageUrl(url)) {
            if (!pendingByKey.has(key)) pendingByKey.set(key, url);
          }
        }
      }

      if (enrichContact) {
        try {
          await this.withTimeout(
            this.runContactEnrichment(page),
            SREALITY_BROWSER_MEDIA_TIMEOUTS.CONTACT_CLICK_MS,
            `CONTACT_CLICK timeout po ${SREALITY_BROWSER_MEDIA_TIMEOUTS.CONTACT_CLICK_MS} ms`,
          ).then((result) => {
            contactClickAttempted = result.attempted;
            contactClickSucceeded = result.succeeded;
          });
        } catch {
          enrichmentStatus = 'PARTIAL';
        }
      }

      try {
        this.logger.log('SREALITY_GALLERY_FOUND');
        this.logger.log('SREALITY_GALLERY_OPENING');
        galleryOpened = await this.withTimeout(
          this.openGalleryLightbox(page, responseTasks),
          SREALITY_BROWSER_MEDIA_TIMEOUTS.GALLERY_OPEN_MS,
          `GALLERY_OPEN timeout`,
        );
        this.logger.log(
          galleryOpened ? 'SREALITY_GALLERY_OPEN_PASS' : 'SREALITY_GALLERY_OPEN_FAILED',
        );
        this.logger.log(`SREALITY_BROWSER_GALLERY_OPENED opened=${galleryOpened}`);
      } catch (err) {
        this.logger.warn(
          `SREALITY_GALLERY_OPEN_FAILED err=${err instanceof Error ? err.message : String(err)}`,
        );
        enrichmentStatus = 'PARTIAL';
      }
      await this.drainResponseTasks(responseTasks);
      await processRawResponseBuffers();

      const assignValidatedPoolToPending = async () => {
        const validatedPool: SrealityBrowserCapturedImage[] = [];
        for (const item of allResponsesByKey.values()) {
          const validated = await validateSrealityImageBuffer(item.buffer, item.contentType);
          if (!validated) continue;
          validatedPool.push({
            ...validated,
            sourceUrl: item.sourceUrl,
            matchKey: item.matchKey,
            method: item.method,
          });
        }
        validatedPool.sort((a, b) => b.buffer.length - a.buffer.length);

        for (const targetUrl of targetUrls) {
          const keys = matchKeysForImageUrl(targetUrl);
          if (keys.some((key) => capturedByKey.has(key))) continue;
          const pooled = findBestCapturedForTargetUrl(targetUrl, allResponsesByKey);
          if (!pooled) continue;
          const validated = await validateSrealityImageBuffer(pooled.buffer, pooled.contentType);
          if (!validated) continue;
          for (const key of keys) {
            if (!pendingByKey.has(key) || capturedByKey.has(key)) continue;
            if (contentHashes.has(validated.contentHash)) continue;
            capturedByKey.set(key, {
              ...validated,
              sourceUrl: pendingByKey.get(key)!,
              matchKey: key,
              method: pooled.method,
            });
            contentHashes.add(validated.contentHash);
          }
        }

        const stillPendingKeys = [...pendingByKey.entries()].filter(([key]) => !capturedByKey.has(key));
        let poolIdx = 0;
        for (const [key, sourceUrl] of stillPendingKeys) {
          while (poolIdx < validatedPool.length) {
            const candidate = validatedPool[poolIdx]!;
            poolIdx += 1;
            if (contentHashes.has(candidate.contentHash)) continue;
            capturedByKey.set(key, {
              ...candidate,
              sourceUrl,
              matchKey: key,
            });
            contentHashes.add(candidate.contentHash);
            break;
          }
        }
      };

      await assignValidatedPoolToPending();

      const galleryState = await this.getActiveGalleryImageState(page);
      this.logger.log(
        `SREALITY_GALLERY_STATE open=${galleryOpened} visible=${galleryState.visible} size=${galleryState.dimensions ?? '—'}`,
      );

      const captureAttempts: SrealityImageCaptureAttempt[] = [];
      const loopTargets = firstImageOnly ? effectiveTargetUrls.slice(0, 1) : effectiveTargetUrls;
      const pendingTargets = loopTargets.filter((url) => {
        for (const key of matchKeysForImageUrl(url)) {
          if (capturedByKey.has(key)) return false;
        }
        return true;
      });
      const targetsToCapture = pendingTargets.length > 0 ? pendingTargets : loopTargets;
      let lastContentHash: string | null = null;
      let sameHashStreak = 0;
      let consecutiveFailures = 0;
      let skipDirectAttempts = elementCaptureOnly;
      let firstImageStored = false;

      for (let index = 0; index < targetsToCapture.length; index += 1) {
        const sourceUrl = targetsToCapture[index]!;
        if (index > 0) {
          const advanced = await this.advanceGalleryStep(page, responseTasks);
          if (!advanced) {
            this.logger.warn(`SREALITY_GALLERY_NAVIGATION_FAILED index=${index + 1}`);
          }
          await this.drainResponseTasks(responseTasks);
          await processRawResponseBuffers();
        }

        const activeState = await this.waitForActiveGalleryImage(page);
        const attempt: SrealityImageCaptureAttempt = {
          index: index + 1,
          total: targetsToCapture.length,
          sourceUrl,
          directHttp: skipDirectAttempts ? 'SKIPPED' : 'NOT_REACHED',
          directHttpStatus: skipDirectAttempts ? 401 : null,
          gallery: galleryOpened ? 'PASS' : 'FAIL',
          browserResponse: 'NOT_REACHED',
          browserContext: 'NOT_REACHED',
          domImage: 'NOT_REACHED',
          elementScreenshot: 'NOT_REACHED',
          sharp: 'NOT_REACHED',
          storage: 'NOT_REACHED',
          galleryOpen: galleryOpened,
          activeImageVisible: activeState.visible,
          activeImageDimensions: activeState.dimensions,
        };

        let capturedForTarget: SrealityBrowserCapturedImage | undefined;
        for (const key of matchKeysForImageUrl(sourceUrl)) {
          capturedForTarget = capturedByKey.get(key);
          if (capturedForTarget) break;
        }

        if (!capturedForTarget && !skipDirectAttempts) {
          const referer = page.url() || listingUrl;
          const contextResult = await this.tryBrowserContextImage(context, sourceUrl, referer);
          if (contextResult) {
            attempt.browserContext = 'PASS';
            attempt.browserContextStatus = 200;
            await storeBuffer(sourceUrl, contextResult.buffer, contextResult.contentType, 'BROWSER_CONTEXT');
          } else {
            attempt.browserContext = 'FAIL';
            attempt.browserContextStatus = 401;
          }
          for (const key of matchKeysForImageUrl(sourceUrl)) {
            capturedForTarget = capturedByKey.get(key);
            if (capturedForTarget) break;
          }
        } else if (skipDirectAttempts) {
          attempt.browserContext = 'SKIPPED';
          attempt.browserContextStatus = 401;
        }

        const pooled =
          findBestCapturedForTargetUrl(sourceUrl, allResponsesByKey) ??
          findPoolEntryForTargetUrl(sourceUrl, allResponsesByKey);
        if (pooled) {
          attempt.browserResponse = 'PASS';
          if (!capturedForTarget) {
            await storeBuffer(sourceUrl, pooled.buffer, pooled.contentType, pooled.method);
            for (const key of matchKeysForImageUrl(sourceUrl)) {
              capturedForTarget = capturedByKey.get(key);
              if (capturedForTarget) break;
            }
          }
        } else {
          attempt.browserResponse = 'FAIL';
        }

        if (!capturedForTarget) {
          const domBuffer = await this.captureDomBlobForUrl(page, sourceUrl);
          if (domBuffer) {
            attempt.domImage = 'PASS';
            attempt.domNaturalSize = activeState.dimensions;
            await storeBuffer(sourceUrl, domBuffer, 'image/jpeg', 'DOM_BLOB');
          } else {
            attempt.domImage = activeState.visible ? 'FAIL' : 'NOT_REACHED';
            attempt.domNaturalSize = activeState.dimensions;
          }
          for (const key of matchKeysForImageUrl(sourceUrl)) {
            capturedForTarget = capturedByKey.get(key);
            if (capturedForTarget) break;
          }
        }

        if (!capturedForTarget) {
          const elementShot = await this.captureActiveGalleryElementScreenshot(page);
          if (elementShot) {
            attempt.elementScreenshot = 'PASS';
            attempt.bytes = elementShot.buffer.length;
            attempt.sharp = 'PASS';
            forceAssignToTargetUrl(sourceUrl, elementShot.validated, 'ELEMENT_CAPTURE');
          } else {
            const urlShot = await this.captureElementForUrl(page, sourceUrl);
            if (urlShot) {
              const validated = await validateSrealityImageBuffer(urlShot, 'image/jpeg');
              if (validated) {
                attempt.elementScreenshot = 'PASS';
                attempt.bytes = urlShot.length;
                attempt.sharp = 'PASS';
                forceAssignToTargetUrl(sourceUrl, validated, 'ELEMENT_CAPTURE');
              } else {
                attempt.elementScreenshot = 'PASS';
                attempt.sharp = 'FAIL';
                attempt.errorMessage = 'Sharp validace screenshotu selhala';
              }
            } else {
              attempt.elementScreenshot = 'FAIL';
              attempt.sharp = 'NOT_REACHED';
              attempt.errorCode = activeState.visible
                ? IMAGE_CAPTURE_ERROR_CODES.ELEMENT_SCREENSHOT_FAILED
                : IMAGE_CAPTURE_ERROR_CODES.GALLERY_NOT_OPEN;
              attempt.errorMessage = activeState.visible
                ? 'Element screenshot selhal'
                : 'Aktivní fotografie není viditelná v galerii';
              await this.saveDiagnosticGalleryScreenshot(page, index + 1);
            }
          }
          for (const key of matchKeysForImageUrl(sourceUrl)) {
            capturedForTarget = capturedByKey.get(key);
            if (capturedForTarget) break;
          }
        } else {
          attempt.elementScreenshot =
            capturedForTarget.method === 'ELEMENT_CAPTURE' ? 'PASS' : 'NOT_REACHED';
          attempt.sharp = 'PASS';
          attempt.storage = 'PASS';
          attempt.captureMethod = capturedForTarget.method;
          attempt.bytes = capturedForTarget.buffer.length;
        }

        if (capturedForTarget) {
          attempt.storage = 'PASS';
          attempt.captureMethod = capturedForTarget.method;
          attempt.bytes = capturedForTarget.buffer.length;
          attempt.sharp = attempt.sharp === 'NOT_REACHED' ? 'PASS' : attempt.sharp;
          consecutiveFailures = 0;
          firstImageStored = true;
          if (capturedForTarget) {
            await onImageCaptured?.({
              index: index + 1,
              sourceUrl,
              captured: capturedForTarget,
            });
          }
          if (capturedForTarget.contentHash === lastContentHash) {
            sameHashStreak += 1;
            if (sameHashStreak >= 2) {
              attempt.errorCode = IMAGE_CAPTURE_ERROR_CODES.GALLERY_NAVIGATION_FAILED;
              attempt.errorMessage = 'GALLERY_IMAGE_NOT_CHANGED';
              this.logger.warn(`SREALITY_GALLERY_IMAGE_NOT_CHANGED index=${index + 1}`);
            }
          } else {
            sameHashStreak = 0;
            lastContentHash = capturedForTarget.contentHash;
          }
        } else {
          attempt.storage = 'FAIL';
          consecutiveFailures += 1;
          if (!attempt.errorCode) {
            attempt.errorCode = IMAGE_CAPTURE_ERROR_CODES.ELEMENT_SCREENSHOT_FAILED;
          }
        }

        if (consecutiveFailures >= 3 && captureAttempts.every((a) => a.storage !== 'PASS')) {
          attempt.errorCode = IMAGE_CAPTURE_ERROR_CODES.CAPTURE_SYSTEM_FAILURE;
          attempt.errorMessage = '3/3 browser capture attempts failed. Stopping image pipeline.';
          captureAttempts.push(attempt);
          await onImageAttempt?.(attempt);
          this.logger.error(formatImageCaptureAttemptLog(attempt));
          this.logger.error('SREALITY_IMAGE_CAPTURE_SYSTEM_FAILURE 3/3 browser capture attempts failed.');
          break;
        }

        if (firstImageOnly && index === 0 && !capturedForTarget) {
          break;
        }

        if (!firstImageOnly && index === 0 && !capturedForTarget) {
          attempt.errorCode = IMAGE_CAPTURE_ERROR_CODES.CAPTURE_SYSTEM_FAILURE;
          attempt.errorMessage = 'FIRST_IMAGE_STORAGE failed — stopping image pipeline.';
          captureAttempts.push(attempt);
          await onImageAttempt?.(attempt);
          this.logger.error('SREALITY_FIRST_IMAGE_STORAGE_FAIL stopping image pipeline.');
          break;
        }

        if (firstImageOnly && firstImageStored) {
          captureAttempts.push(attempt);
          await onImageAttempt?.(attempt);
          this.logger.log(formatImageCaptureAttemptLog(attempt));
          break;
        }

        if (consecutiveFailures >= 2 && !skipDirectAttempts) {
          skipDirectAttempts = true;
          this.logger.warn('SREALITY_IMAGE_STRATEGY element-only after repeated CDN 401');
        }

        captureAttempts.push(attempt);
        await onImageAttempt?.(attempt);
        this.logger.log(formatImageCaptureAttemptLog(attempt));
      }

      try {
        imageUrlsFound = await this.extractGalleryImageUrlsFromPage(page);
        html = await page.evaluate(() => document.documentElement.outerHTML);
      } catch (err) {
        this.logger.warn(
          `SREALITY_PAGE_EXTRACT_FAIL err=${err instanceof Error ? err.message : String(err)}`,
        );
      }

      await this.drainResponseTasks(responseTasks);
      await processRawResponseBuffers();
      await this.delay(page, SREALITY_BROWSER_MEDIA_TIMEOUTS.RESPONSE_DRAIN_MS);

      const htmlBroker = extractSrealityBrokerFromHtml(html);
      const networkBrokerParts = networkJson.map((payload) =>
        extractSrealityBrokerFromRaw(
          payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null,
        ),
      );
      const broker = mergeBrokerParts([htmlBroker, ...networkBrokerParts]);

      const captured = this.orderCapturedImages(effectiveTargetUrls, capturedByKey, contentHashes);
      const stats = {
        browserResponseSuccess: captured.filter((x) => x.method === 'BROWSER_RESPONSE').length,
        elementCaptureSuccess: captured.filter((x) => x.method === 'ELEMENT_CAPTURE').length,
        browserContextSuccess: captured.filter((x) => x.method === 'BROWSER_CONTEXT').length,
        domBlobSuccess: captured.filter((x) => x.method === 'DOM_BLOB').length,
        failed: Math.max(0, effectiveTargetUrls.length - captured.length),
        responsesSeen,
      };

      if (stats.failed > 0 && captured.length > 0) enrichmentStatus = 'PARTIAL';
      if (captured.length === 0 && effectiveTargetUrls.length > 0) enrichmentStatus = 'FAIL';

      this.logger.log(
        `SREALITY_BROWSER_MEDIA_DONE captured=${captured.length}/${effectiveTargetUrls.length} responsesSeen=${responsesSeen} pool=${allResponsesByKey.size} response=${stats.browserResponseSuccess} context=${stats.browserContextSuccess} dom=${stats.domBlobSuccess} element=${stats.elementCaptureSuccess}`,
      );

      return {
        browserRuntime: 'READY',
        enrichmentStatus,
        captured,
        broker,
        html,
        contactClickAttempted,
        contactClickSucceeded,
        galleryOpened,
        imageUrlsFound,
        captureAttempts,
        galleryDiagnostics: {
          galleryOpen: galleryOpened,
          activeImageVisible: galleryState.visible,
          activeImageDimensions: galleryState.dimensions,
        },
        stats,
      };
    } finally {
      await page.close().catch(() => undefined);
      await context.close().catch(() => undefined);
    }
  }

  private async extractGalleryImageUrlsFromPage(page: PlaywrightPage): Promise<string[]> {
    try {
      const extracted = await page.evaluate(BROWSER_EXTRACT_GALLERY_IMAGE_URLS);
      return dedupeSrealityImageUrls(Array.isArray(extracted) ? (extracted as string[]) : []);
    } catch {
      return [];
    }
  }

  private async drainResponseTasks(
    tasks: Promise<void>[],
    timeoutMs = SREALITY_BROWSER_MEDIA_TIMEOUTS.RESPONSE_DRAIN_MS,
  ): Promise<void> {
    if (!tasks.length) return;
    const batch = tasks.splice(0, tasks.length);
    await Promise.race([
      Promise.allSettled(batch),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  private async activateGalleryImageForUrl(page: PlaywrightPage, sourceUrl: string): Promise<void> {
    const matchKeys = new Set(matchKeysForImageUrl(sourceUrl));
    await page
      .evaluate((keys: string[]) => {
        const keySet = new Set(keys);
        const imgs = Array.from(document.querySelectorAll('img, picture img'));
        for (const node of imgs) {
          const img = node as HTMLImageElement;
          const values = [
            img.getAttribute('src'),
            img.getAttribute('data-src'),
            img.currentSrc,
          ].filter(Boolean) as string[];
          const srcset = img.getAttribute('srcset');
          if (srcset) {
            for (const part of srcset.split(',')) {
              values.push(part.trim().split(/\s+/)[0] ?? '');
            }
          }
          for (let vi = 0; vi < values.length; vi += 1) {
            const value = values[vi]!;
            try {
              const normalized = value.startsWith('//') ? `https:${value}` : value;
              const absolute = normalized.startsWith('http')
                ? normalized
                : new URL(normalized, window.location.origin).href;
              const segments = new URL(absolute).pathname.split('/').filter(Boolean);
              const file = segments[segments.length - 1] ?? '';
              const parent = segments[segments.length - 2] ?? '';
              const compact = `${new URL(absolute).hostname}/${parent}/${file}`.toLowerCase();
              if (
                keySet.has(compact) ||
                keys.some((k) => absolute.includes(k) || k.includes(file))
              ) {
                img.scrollIntoView({ block: 'center', inline: 'center' });
                img.click();
                return true;
              }
            } catch {
              /* ignore */
            }
          }
        }
        return false;
      }, [...matchKeys])
      .catch(() => undefined);
    await this.waitForGalleryImageLoaded(page);
  }

  private async captureDomBlobForUrl(page: PlaywrightPage, sourceUrl: string): Promise<Buffer | null> {
    const matchKeys = matchKeysForImageUrl(sourceUrl);
    const base64 = await page
      .evaluate(async (keys: string[]) => {
        const imgs = Array.from(document.querySelectorAll('img, picture img, [role="dialog"] img'));
        for (const node of imgs) {
          const img = node as HTMLImageElement;
          const values = [
            img.getAttribute('src'),
            img.getAttribute('data-src'),
            img.getAttribute('data-original'),
            img.currentSrc,
          ].filter(Boolean) as string[];
          const srcset = img.getAttribute('srcset');
          if (srcset) {
            for (const part of srcset.split(',')) {
              values.push(part.trim().split(/\s+/)[0] ?? '');
            }
          }
          const matches = values.some((value) => {
            try {
              const u = new URL(value.startsWith('//') ? `https:${value}` : value, window.location.origin);
              const segments = u.pathname.split('/').filter(Boolean);
              const file = segments[segments.length - 1] ?? '';
              const parent = segments[segments.length - 2] ?? '';
              const key = `${u.hostname}/${parent}/${file}`.toLowerCase();
              return keys.includes(key);
            } catch {
              return false;
            }
          });
          if (!matches) continue;
          if (!img.complete || img.naturalWidth < 320 || img.naturalHeight < 240) continue;
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
          return dataUrl.split(',')[1] ?? null;
        }
        return null;
      }, matchKeys)
      .catch(() => null);
    if (!base64) return null;
    const buffer = Buffer.from(base64, 'base64');
    const validated = await validateSrealityImageBuffer(buffer, 'image/jpeg');
    return validated ? buffer : null;
  }

  private orderCapturedImages(
    targetUrls: string[],
    capturedByKey: Map<string, SrealityBrowserCapturedImage>,
    contentHashes: Set<string>,
  ): SrealityBrowserCapturedImage[] {
    const captured: SrealityBrowserCapturedImage[] = [];
    const seenHashes = new Set<string>();
    for (const url of targetUrls) {
      let found: SrealityBrowserCapturedImage | undefined;
      for (const key of matchKeysForImageUrl(url)) {
        found = capturedByKey.get(key);
        if (found) break;
      }
      if (!found || seenHashes.has(found.contentHash)) continue;
      seenHashes.add(found.contentHash);
      captured.push(found);
    }
    for (const item of capturedByKey.values()) {
      if (seenHashes.has(item.contentHash)) continue;
      seenHashes.add(item.contentHash);
      captured.push(item);
    }
    return captured;
  }

  private async runContactEnrichment(page: PlaywrightPage): Promise<{
    attempted: boolean;
    succeeded: boolean;
  }> {
    const contactSelectors = [
      'button:has-text("Zobrazit telefon")',
      'button:has-text("Ukázat telefon")',
      'button:has-text("Zobrazit kontakt")',
      'button:has-text("Kontakt")',
      '[data-e2e="show-phone"]',
      '[data-e2e="contact-show"]',
    ];
    for (const sel of contactSelectors) {
      try {
        const el = page.locator(sel).first();
        if ((await el.count()) > 0) {
          await el.click({ timeout: 2500 }).catch(() => undefined);
          await this.delay(page, 800);
          return { attempted: true, succeeded: true };
        }
      } catch {
        /* ignore */
      }
    }

    let succeeded = false;
    await page
      .getByRole('button', { name: /zobrazit telefon|ukázat telefon|kontakt/i })
      .first()
      .click({ timeout: 1500 })
      .then(() => {
        succeeded = true;
      })
      .catch(() => undefined);
    if (succeeded) await this.delay(page, 600);
    return { attempted: succeeded, succeeded };
  }

  private async openGalleryLightbox(
    page: PlaywrightPage,
    responseTasks: Promise<void>[],
  ): Promise<boolean> {
    const galleryOpenSelectors = [
      '[data-e2e="detail-gallery"] img',
      '[data-e2e="detail-image"]',
      '[data-e2e="detail-gallery"] button',
      'button:has-text("fotografi")',
      'a:has-text("fotografi")',
      '[aria-label*="fotografi"]',
      '[aria-label*="galerie"]',
      '[aria-label*="Fotografie"]',
      '[class*="Gallery"] img',
      '[class*="Lightbox"] img',
      '[class*="carousel"] img',
      'picture img',
      'main img[src*="sdn.cz"]',
      'main img[src*="sreality"]',
    ];

    let galleryOpened = false;
    for (const sel of galleryOpenSelectors) {
      try {
        const el = page.locator(sel).first();
        if ((await el.count()) > 0) {
          await el.scrollIntoViewIfNeeded?.().catch(() => undefined);
          await el.click({ timeout: 2500, force: true }).catch(() => undefined);
          galleryOpened = true;
          await this.waitForActiveGalleryImage(page);
          await this.drainResponseTasks(responseTasks);
          if (await page.locator('[role="dialog"], [class*="Lightbox"], [class*="Gallery"]').count()) {
            return true;
          }
        }
      } catch {
        /* ignore */
      }
    }

    if (!galleryOpened) {
      await page
        .getByRole('button', { name: /fotografi|galerie|zobrazit/i })
        .first()
        .click({ timeout: 2000, force: true })
        .then(() => {
          galleryOpened = true;
        })
        .catch(() => undefined);
      if (galleryOpened) {
        await this.waitForActiveGalleryImage(page);
        await this.drainResponseTasks(responseTasks);
      }
    }

    if (!galleryOpened) {
      await page
        .locator('main img[src*="sdn"], main picture img, [data-e2e="detail-gallery"] img')
        .first()
        .click({ timeout: 2000, force: true })
        .then(() => {
          galleryOpened = true;
        })
        .catch(() => undefined);
      if (galleryOpened) {
        await this.waitForActiveGalleryImage(page);
        await this.drainResponseTasks(responseTasks);
      }
    }

    return galleryOpened;
  }

  /** @deprecated Use openGalleryLightbox + per-image advanceGalleryStep */
  private async openGalleryAndBrowse(
    page: PlaywrightPage,
    pendingByKey: Map<string, string>,
    capturedByKey: Map<string, SrealityBrowserCapturedImage>,
    responseTasks: Promise<void>[],
  ): Promise<boolean> {
    const galleryOpenSelectors = [
      '[data-e2e="detail-gallery"] img',
      '[data-e2e="detail-image"]',
      '[data-e2e="detail-gallery"] button',
      'button:has-text("fotografi")',
      'a:has-text("fotografi")',
      '[aria-label*="fotografi"]',
      '[aria-label*="galerie"]',
      'picture img',
      'main img[src*="sdn.cz"]',
      'main img[src*="sreality"]',
    ];

    let galleryOpened = false;
    for (const sel of galleryOpenSelectors) {
      try {
        const el = page.locator(sel).first();
        if ((await el.count()) > 0) {
          await el.scrollIntoViewIfNeeded?.().catch(() => undefined);
          await el.click({ timeout: 2500 }).catch(() => undefined);
          galleryOpened = true;
          await this.waitForGalleryImageLoaded(page);
          await this.drainResponseTasks(responseTasks);
          break;
        }
      } catch {
        /* ignore */
      }
    }

    if (!galleryOpened) {
      await page
        .getByRole('button', { name: /fotografi|galerie|zobrazit/i })
        .first()
        .click({ timeout: 2000 })
        .then(() => {
          galleryOpened = true;
        })
        .catch(() => undefined);
      if (galleryOpened) {
        await this.waitForGalleryImageLoaded(page);
        await this.drainResponseTasks(responseTasks);
      }
    }

    const nextSelectors = [
      '[data-e2e="gallery-next"]',
      'button[aria-label*="Další"]',
      'button[aria-label*="Next"]',
      'button[aria-label*="následuj"]',
      'button:has-text("Další")',
    ];

    const maxSteps = Math.max(24, pendingByKey.size + 8);
    for (let step = 0; step < maxSteps; step += 1) {
      if ([...pendingByKey.keys()].every((key) => capturedByKey.has(key))) break;

      await this.waitForGalleryImageLoaded(page).catch(() => undefined);
      await this.drainResponseTasks(responseTasks);

      let advanced = false;
      for (const sel of nextSelectors) {
        try {
          const next = page.locator(sel).first();
          if ((await next.count()) === 0) continue;
          await next.click({ timeout: 1500 }).catch(() => undefined);
          advanced = true;
          await this.waitForGalleryImageLoaded(page).catch(() => undefined);
          await this.drainResponseTasks(responseTasks);
          break;
        } catch {
          /* ignore */
        }
      }
      if (!advanced) {
        await page.keyboard?.press?.('ArrowRight').catch(() => undefined);
        await this.delay(page, 400);
        await this.drainResponseTasks(responseTasks);
      }
    }

    return galleryOpened;
  }

  private async waitForGalleryImageLoaded(page: PlaywrightPage): Promise<void> {
    await page
      .waitForFunction(
        () => {
          const selectors = [
            '[data-e2e="detail-gallery"] img',
            '[role="dialog"] img',
            '.gallery img',
            'picture img',
            'main img[src*="sdn.cz"]',
          ];
          for (const sel of selectors) {
            for (const img of Array.from(document.querySelectorAll(sel))) {
              const el = img as HTMLImageElement;
              if (el.complete && el.naturalWidth > 0 && el.naturalHeight > 0) return true;
            }
          }
          return false;
        },
        { timeout: SREALITY_BROWSER_MEDIA_TIMEOUTS.IMAGE_LOAD_MS },
      )
      .catch(() => undefined);
  }

  private async waitForActiveGalleryImage(page: PlaywrightPage): Promise<{
    visible: boolean;
    dimensions: string | null;
    naturalWidth: number;
    naturalHeight: number;
  }> {
    await page
      .waitForFunction(
        () => {
          const selectors = [
            '[role="dialog"] img',
            '[data-e2e="detail-gallery"] img',
            '[class*="Lightbox"] img',
            '[class*="Gallery"] img',
            '.gallery img',
            'picture img',
            'main img[src*="sdn.cz"]',
          ];
          for (const sel of selectors) {
            for (const img of Array.from(document.querySelectorAll(sel))) {
              const el = img as HTMLImageElement;
              const rect = el.getBoundingClientRect();
              if (rect.width < 40 || rect.height < 40) continue;
              if (el.complete && el.naturalWidth > 160 && el.naturalHeight > 120) return true;
            }
          }
          return false;
        },
        { timeout: SREALITY_BROWSER_MEDIA_TIMEOUTS.IMAGE_LOAD_MS },
      )
      .catch(() => undefined);
    await this.delay(page, 350);
    return this.getActiveGalleryImageState(page);
  }

  private async saveDiagnosticGalleryScreenshot(page: PlaywrightPage, imageIndex: number): Promise<void> {
    try {
      const { mkdir, writeFile, rm } = await import('node:fs/promises');
      const { join } = await import('node:path');
      const { tmpdir } = await import('node:os');
      const dir = join(tmpdir(), 'sreality-gallery-diag');
      await mkdir(dir, { recursive: true });
      const file = join(dir, `gallery-fail-${Date.now()}-${imageIndex}.png`);
      await page.screenshot({ path: file, fullPage: true, timeout: 8_000 });
      this.logger.warn(`SREALITY_GALLERY_DIAGNOSTIC_SCREENSHOT path=${file}`);
      setTimeout(() => {
        void rm(file, { force: true }).catch(() => undefined);
      }, 15 * 60_000);
    } catch {
      /* ignore */
    }
  }

  private async getActiveGalleryImageState(page: PlaywrightPage): Promise<{
    visible: boolean;
    dimensions: string | null;
    naturalWidth: number;
    naturalHeight: number;
  }> {
    const state = await page
      .evaluate(() => {
        const selectors = [
          '[role="dialog"] img',
          '[data-e2e="detail-gallery"] img',
          '[class*="Lightbox"] img',
          '[class*="Gallery"] img',
          '[class*="carousel"] img',
          '.gallery img',
          'picture img',
          'main img[src*="sdn.cz"]',
        ];
        let best: { w: number; h: number; viewportArea: number } | null = null;
        for (const sel of selectors) {
          for (const node of Array.from(document.querySelectorAll(sel))) {
            const img = node as HTMLImageElement;
            const rect = img.getBoundingClientRect();
            if (rect.width < 40 || rect.height < 40) continue;
            if (!img.complete || img.naturalWidth < 1 || img.naturalHeight < 1) continue;
            if (/logo|icon|sprite|avatar|profile|1x1/i.test(img.src || img.currentSrc || '')) continue;
            const viewportArea = rect.width * rect.height;
            const area = img.naturalWidth * img.naturalHeight;
            if (!best || viewportArea > best.viewportArea || (viewportArea === best.viewportArea && area > best.w * best.h)) {
              best = { w: img.naturalWidth, h: img.naturalHeight, viewportArea };
            }
          }
        }
        return best ? { w: best.w, h: best.h } : null;
      })
      .catch(() => null);
    if (!state) {
      return { visible: false, dimensions: null, naturalWidth: 0, naturalHeight: 0 };
    }
    return {
      visible: true,
      dimensions: `${state.w}x${state.h}`,
      naturalWidth: state.w,
      naturalHeight: state.h,
    };
  }

  private async captureActiveGalleryElementScreenshot(
    page: PlaywrightPage,
  ): Promise<{ buffer: Buffer; width: number; height: number; validated: SrealityValidatedImageBuffer } | null> {
    const selectors = [
      '[role="dialog"] img',
      '[data-e2e="detail-gallery"] img',
      '[class*="Lightbox"] img',
      '[class*="Gallery"] img',
      '[class*="carousel"] img',
      '.gallery img',
      'picture img',
      'main img[src*="sdn.cz"]',
      'main img[src*="sreality"]',
    ];

    await this.waitForActiveGalleryImage(page);

    let bestIndex = -1;
    let bestSelector = selectors[0]!;
    let bestViewportArea = 0;

    for (const sel of selectors) {
      const imgs = page.locator(sel);
      const count = await imgs.count();
      for (let i = 0; i < count; i += 1) {
        const meta = await imgs.nth(i).evaluate((el) => {
          const img = el as HTMLImageElement;
          const rect = img.getBoundingClientRect();
          const src = img.src || img.currentSrc || '';
          return {
            viewportArea: rect.width * rect.height,
            visible: rect.width > 80 && rect.height > 80,
            complete: img.complete && img.naturalWidth > 0 && img.naturalHeight > 0,
            w: img.naturalWidth,
            h: img.naturalHeight,
            isUiAsset: /logo|icon|sprite|avatar|profile|1x1/i.test(src),
          };
        });
        if (!meta.visible || !meta.complete || meta.isUiAsset) continue;
        if (meta.viewportArea > bestViewportArea) {
          bestViewportArea = meta.viewportArea;
          bestIndex = i;
          bestSelector = sel;
        }
      }
    }

    if (bestIndex < 0) return null;

    const img = page.locator(bestSelector).nth(bestIndex);
    const box = await img.boundingBox();
    if (!box || box.width < 20 || box.height < 20) return null;

    const screenshot = await img.screenshot({
      type: 'jpeg',
      quality: 92,
      timeout: SREALITY_BROWSER_MEDIA_TIMEOUTS.ELEMENT_CAPTURE_MS,
    });
    const validated = await validateSrealityImageBuffer(screenshot, 'image/jpeg');
    if (!validated) return null;
    return { buffer: screenshot, width: validated.width, height: validated.height, validated };
  }

  private async advanceGalleryStep(page: PlaywrightPage, responseTasks: Promise<void>[]): Promise<boolean> {
    const nextSelectors = [
      '[data-e2e="gallery-next"]',
      'button[aria-label*="Další"]',
      'button[aria-label*="Next"]',
      'button[aria-label*="následuj"]',
      'button:has-text("Další")',
    ];
    for (const sel of nextSelectors) {
      try {
        const next = page.locator(sel).first();
        if ((await next.count()) === 0) continue;
        await next.click({ timeout: 1500 }).catch(() => undefined);
        await this.waitForGalleryImageLoaded(page).catch(() => undefined);
        await this.drainResponseTasks(responseTasks);
        return true;
      } catch {
        /* ignore */
      }
    }
    await page.keyboard?.press?.('ArrowRight').catch(() => undefined);
    await this.delay(page, 400);
    await this.drainResponseTasks(responseTasks);
    return false;
  }

  private async tryBrowserContextImage(
    context: PlaywrightContext,
    sourceUrl: string,
    referer: string,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    const headers = {
      Referer: referer,
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    };
    for (const candidate of buildSdnFullSizeCandidates(sourceUrl)) {
      if (!isSrealityCdnResponseUrl(candidate)) continue;
      try {
        const res = await context.request.get(candidate, {
          headers,
          timeout: SREALITY_BROWSER_MEDIA_TIMEOUTS.IMAGE_LOAD_MS,
        });
        if (!isSuccessfulImageStatus(res.status())) continue;
        const ct = res.headers()['content-type'] ?? '';
        if (!isLikelyImageResponse(ct)) continue;
        const buffer = await res.body();
        const validated = await validateSrealityImageBuffer(buffer, ct);
        if (validated) return { buffer, contentType: validated.contentType };
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  private async captureElementForUrl(page: PlaywrightPage, sourceUrl: string): Promise<Buffer | null> {
    const matchKeys = new Set(matchKeysForImageUrl(sourceUrl));
    const gallerySelectors = [
      '[data-e2e="detail-gallery"] img',
      '[role="dialog"] img',
      '.gallery img',
      'picture img',
      'main img[src*="sdn.cz"]',
      'main img[src*="sreality"]',
    ];

    for (const sel of gallerySelectors) {
      const imgs = page.locator(sel);
      const count = await imgs.count();
      for (let i = 0; i < count; i += 1) {
        const img = imgs.nth(i);
        const attrs = await img.evaluate((el) => {
          const node = el as HTMLImageElement;
          const values = [
            node.getAttribute('src'),
            node.getAttribute('data-src'),
            node.getAttribute('data-original'),
            node.currentSrc,
          ].filter(Boolean) as string[];
          const srcset = node.getAttribute('srcset');
          if (srcset) {
            for (const part of srcset.split(',')) {
              values.push(part.trim().split(/\s+/)[0] ?? '');
            }
          }
          return {
            values,
            complete: node.complete,
            naturalWidth: node.naturalWidth,
            naturalHeight: node.naturalHeight,
          };
        });

        const matches = attrs.values.some((value) => matchKeys.has(imageDedupeKey(value)));
        if (!matches) continue;

        if (!attrs.complete || attrs.naturalWidth <= 0 || attrs.naturalHeight <= 0) {
          await page
            .waitForFunction(
              (index: number, selector: string) => {
                const nodes = document.querySelectorAll(selector);
                const node = nodes[index] as HTMLImageElement | undefined;
                return Boolean(node?.complete && node.naturalWidth > 0 && node.naturalHeight > 0);
              },
              { timeout: SREALITY_BROWSER_MEDIA_TIMEOUTS.IMAGE_LOAD_MS },
              i,
              sel,
            )
            .catch(() => undefined);
        }

        const screenshot = await img.screenshot({ type: 'jpeg', quality: 92 });
        const validated = await validateSrealityImageBuffer(screenshot, 'image/jpeg');
        if (validated) return screenshot;
      }
    }

    return null;
  }

  async renderPage(
    url: string,
    options?: { timeoutMs?: number; retries?: number },
  ): Promise<SrealityPlaywrightRenderResult> {
    this.logger.log(`Sreality prefill: start Playwright diagnostika url=${url}`);

    const timeoutMs = Math.min(
      15_000,
      Math.max(8_000, options?.timeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS),
    );
    const retries = 1;
    let lastErr: unknown = null;

    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        return await this.withTimeout(
          this.renderOnce(url),
          timeoutMs,
          `Playwright timeout po ${timeoutMs} ms`,
        );
      } catch (e) {
        lastErr = e;
        const errMsg = e instanceof Error ? e.message : String(e);
        this.logger.warn(
          `Sreality playwright retry ${attempt}/${retries} url=${url} err=${errMsg}`,
        );
      }
    }

    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    if (/timeout/i.test(msg)) {
      return {
        html: '',
        finalUrl: url,
        httpStatus: null,
        playwrightLoaded: false,
        cloudflareDetected: false,
        errorCode: 'TIMEOUT',
        errorDetail: `Playwright timeout po ${timeoutMs} ms: ${msg}`,
      };
    }
    if (this.isPlaywrightUnavailableError(msg)) {
      return {
        html: '',
        finalUrl: url,
        httpStatus: null,
        playwrightLoaded: false,
        cloudflareDetected: false,
        errorCode: 'PLAYWRIGHT_UNAVAILABLE',
        errorDetail: msg,
      };
    }
    return {
      html: '',
      finalUrl: url,
      httpStatus: null,
      playwrightLoaded: false,
      cloudflareDetected: false,
      errorCode: 'PLAYWRIGHT_ERROR',
      errorDetail: msg,
    };
  }

  private isPlaywrightUnavailableError(message: string): boolean {
    return (
      /cannot find module ['"]playwright['"]/i.test(message) ||
      /playwright is not installed/i.test(message) ||
      /executable doesn't exist/i.test(message) ||
      /failed to launch.*chromium/i.test(message) ||
      /browser.*not found/i.test(message) ||
      /host system is missing dependencies/i.test(message)
    );
  }

  private async loadPlaywrightModule(): Promise<PlaywrightModule> {
    const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<unknown>;
    try {
      const playwright = (await dynamicImport('playwright')) as PlaywrightModule;
      this.logger.log('Playwright nalezen');
      return playwright;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Playwright nenalezen: ${msg}`);
      throw new Error(`Cannot find module 'playwright': ${msg}`);
    }
  }

  private resolveChromiumExecutable(playwright: PlaywrightModule): string {
    let executablePath = '';
    try {
      executablePath = playwright.chromium.executablePath();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Chromium executablePath selhalo: ${msg}`);
      throw new Error(`Chromium nenalezeno: ${msg}`);
    }

    if (!executablePath || !existsSync(executablePath)) {
      const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '(default)';
      const detail = `Chromium executable neexistuje: ${executablePath || 'prázdná cesta'} (PLAYWRIGHT_BROWSERS_PATH=${browsersPath}). Spusťte: npx playwright install chromium`;
      this.logger.error(detail);
      throw new Error(detail);
    }

    this.logger.log(`Chromium nalezeno: ${executablePath}`);
    return executablePath;
  }

  private async launchChromiumBrowser(playwright: PlaywrightModule): Promise<PlaywrightBrowser> {
    this.resolveChromiumExecutable(playwright);

    const channel = this.config.get<string>('SREALITY_PLAYWRIGHT_CHANNEL')?.trim();
    const launchOptions: Record<string, unknown> = {
      headless: true,
      args: CHROMIUM_LAUNCH_ARGS,
    };
    if (channel) {
      launchOptions.channel = channel;
    }

    try {
      const browser = await playwright.chromium.launch(launchOptions);
      this.logger.log('Browser spuštěn');
      return browser;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Browser launch failed: ${msg}`);
      throw new Error(`Browser launch failed: ${msg}`);
    }
  }

  private readStorageState(): { path: string } | { cookies: PlaywrightCookie[] } | undefined {
    const storagePath = this.config.get<string>('SREALITY_PLAYWRIGHT_STORAGE_STATE_PATH')?.trim();
    if (storagePath && existsSync(storagePath)) {
      return { path: storagePath };
    }
    const rawCookies = this.config.get<string>('SREALITY_PLAYWRIGHT_COOKIES_JSON')?.trim();
    if (!rawCookies) return undefined;
    try {
      const parsed = JSON.parse(rawCookies) as PlaywrightCookie[];
      if (!Array.isArray(parsed) || !parsed.length) return undefined;
      return { cookies: parsed };
    } catch {
      this.logger.warn('SREALITY_PLAYWRIGHT_COOKIES_JSON není platné JSON pole.');
      return undefined;
    }
  }

  private async renderOnce(url: string): Promise<SrealityPlaywrightRenderResult> {
    const playwright = await this.loadPlaywrightModule();
    const storage = this.readStorageState();
    const browser = await this.launchChromiumBrowser(playwright);

    let httpStatus: number | null = null;

    try {
      const contextOptions: Record<string, unknown> = {
        viewport: { width: 1440, height: 2400 },
        locale: 'cs-CZ',
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        extraHTTPHeaders: {
          'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
        },
      };
      if (storage && 'path' in storage) {
        contextOptions.storageState = storage.path;
      }

      const context = await browser.newContext(contextOptions);
      if (storage && 'cookies' in storage) {
        await context.addCookies(
          storage.cookies.map((c) => ({
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path ?? '/',
          })),
        );
      }

      const page = await context.newPage();
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });

      await page
        .goto('https://www.sreality.cz/', { waitUntil: 'domcontentloaded', timeout: 5_000 })
        .catch(() => undefined);
      await this.delay(page, 200);

      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: GOTO_TIMEOUT_MS,
      });
      httpStatus = response?.status() ?? null;

      if (httpStatus === 403) {
        await context.close();
        return {
          html: '',
          finalUrl: page.url(),
          httpStatus,
          playwrightLoaded: true,
          cloudflareDetected: false,
          errorCode: 'HTTP_403',
          errorDetail: 'Sreality vrátilo HTTP 403 — přístup odepřen.',
        };
      }

      await this.handleSeznamConsent(page, url, context);
      await page
        .waitForLoadState('domcontentloaded', { timeout: LOAD_STATE_TIMEOUT_MS })
        .catch(() => undefined);
      await this.delay(page, 500);

      await page
        .waitForSelector('h1, script#__NEXT_DATA__, [data-e2e="detail-heading"], main', {
          timeout: SELECTOR_TIMEOUT_MS,
        })
        .catch(() => undefined);

      await this.delay(page, 300);

      await page
        .evaluate(async () => {
          window.scrollTo(0, document.body.scrollHeight / 3);
        })
        .catch(() => undefined);
      await this.delay(page, 200);

      const html = await page.evaluate(() => document.documentElement.outerHTML);
      const finalUrl = page.url();
      const cloudflareDetected = this.detectCloudflare(html, finalUrl);

      await context.close();

      if (cloudflareDetected) {
        return {
          html,
          finalUrl,
          httpStatus,
          playwrightLoaded: true,
          cloudflareDetected: true,
          errorCode: 'CLOUDFLARE',
          errorDetail: 'Stránka je chráněna Cloudflare — obsah inzerátu nebyl načten.',
        };
      }

      if (this.isCookieConsentPage(finalUrl, html)) {
        const hint = storage
          ? ''
          : ' Nastavte SREALITY_PLAYWRIGHT_STORAGE_STATE_PATH nebo SREALITY_PLAYWRIGHT_COOKIES_JSON na serveru.';
        return {
          html,
          finalUrl,
          httpStatus,
          playwrightLoaded: true,
          cloudflareDetected: false,
          errorCode: 'COOKIE_CONSENT',
          errorDetail: `Playwright zůstal na stránce souhlasu cookies Seznam — detail inzerátu nebyl načten.${hint}`,
        };
      }

      this.logger.log(
        `Sreality playwright loaded url=${url} status=${httpStatus ?? 'n/a'} htmlLen=${html.length} final=${finalUrl}`,
      );

      return {
        html,
        finalUrl,
        httpStatus,
        playwrightLoaded: true,
        cloudflareDetected: false,
      };
    } finally {
      await browser.close();
    }
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error(message)), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private extractReturnUrl(pageUrl: string): string | null {
    try {
      const parsed = new URL(pageUrl);
      const returnUrl = parsed.searchParams.get('return_url');
      return returnUrl ? decodeURIComponent(returnUrl) : null;
    } catch {
      return null;
    }
  }

  private async handleSeznamConsent(
    page: PlaywrightPage,
    originalUrl: string,
    context: PlaywrightContext,
  ): Promise<void> {
    const returnUrl = this.extractReturnUrl(page.url()) ?? originalUrl;

    for (let round = 0; round < 4; round += 1) {
      if (!this.isCookieConsentPage(page.url(), '')) break;

      await this.delay(page, round === 0 ? 2500 : 1500);

      const selectors = [
        'button:has-text("Souhlasím se vším")',
        'button:has-text("Přijmout vše")',
        'button:has-text("Souhlasím")',
        'button:has-text("Souhlasit se vším")',
        'button:has-text("Souhlasit")',
        'button:has-text("Accept all")',
        '[data-testid="cw-button-agree-with-ads"]',
        '[data-testid="cw-button-agree"]',
      ];

      for (const selector of selectors) {
        try {
          const el = page.locator(selector).first();
          if ((await el.count()) > 0) {
            await el.click({ timeout: 2500 }).catch(() => undefined);
            break;
          }
        } catch {
          /* ignore */
        }
      }

      await page
        .getByRole('button', { name: /souhlas|přijm|accept/i })
        .first()
        .click({ timeout: 1500 })
        .catch(() => undefined);

      const cwri = new URL(page.url()).searchParams.get('cwri');
      if (cwri) {
        await context.request
          .get(
            `https://cmp.seznam.cz/check-point/v1/check-consent?fetch_filter=1&cwri=${encodeURIComponent(cwri)}&service_id=sreality`,
            { headers: { Referer: page.url() } },
          )
          .catch(() => undefined);
      }

      await page
        .waitForURL(/sreality\.cz\/detail/i, { timeout: 8_000 })
        .catch(() => undefined);
      await this.delay(page, 600);

      if (!this.isCookieConsentPage(page.url(), '')) return;
    }

    if (this.isCookieConsentPage(page.url(), '')) {
      await page
        .goto(returnUrl, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT_MS })
        .catch(() => undefined);
      await this.dismissCookieBanners(page);
      await this.delay(page, 800);
    }
  }

  private async delay(page: PlaywrightPage, ms: number): Promise<void> {
    if (page.waitForTimeout) {
      await page.waitForTimeout(ms);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isCookieConsentPage(finalUrl: string, html: string): boolean {
    if (/cmp\.seznam\.cz/i.test(finalUrl)) return true;
    const sample = html.slice(0, 40_000).toLowerCase();
    return (
      sample.includes('nastavení souhlasu') ||
      sample.includes('nastaveni souhlasu') ||
      sample.includes('cmp.seznam.cz')
    );
  }

  private detectCloudflare(html: string, finalUrl: string): boolean {
    const sample = html.slice(0, 80_000).toLowerCase();
    if (/just a moment|cf-browser-verification|challenge-platform|turnstile/i.test(sample)) {
      return true;
    }
    if (/cdn-cgi\/challenge/i.test(finalUrl)) return true;
    return false;
  }

  private async dismissCookieBanners(page: PlaywrightPage): Promise<void> {
    const candidates = [
      'button:has-text("Souhlasím se vším")',
      'button:has-text("Přijmout vše")',
      'button:has-text("Souhlasím")',
      'button:has-text("Přijmout")',
      'button:has-text("Souhlasit")',
      'button:has-text("Accept all")',
      '[id*="cookie"] button',
      '[class*="cookie"] button',
    ];
    for (const selector of candidates) {
      try {
        const el = page.locator(selector).first();
        if ((await el.count()) > 0) {
          await el.click({ timeout: 900 }).catch(() => undefined);
          await this.delay(page, 300);
          return;
        }
      } catch {
        /* ignore */
      }
    }
  }
}

type PlaywrightContext = {
  newPage: () => Promise<PlaywrightPage>;
  addCookies: (cookies: PlaywrightCookie[]) => Promise<void>;
  close: () => Promise<void>;
  request: {
    get: (
      url: string,
      opts: Record<string, unknown>,
    ) => Promise<{
      status: () => number;
      headers: () => Record<string, string>;
      body: () => Promise<Buffer>;
    }>;
  };
};

type PlaywrightResponse = {
  url: () => string;
  status: () => number;
  headers: () => Record<string, string>;
  json: () => Promise<unknown>;
  body: () => Promise<Buffer>;
};

type PlaywrightLocator = {
  count: () => Promise<number>;
  click: (opts?: Record<string, unknown>) => Promise<void>;
  first: () => PlaywrightLocator;
  nth: (index: number) => PlaywrightLocator;
  boundingBox: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
  screenshot: (opts?: Record<string, unknown>) => Promise<Buffer>;
  evaluate: <T>(fn: (el: Element) => T | Promise<T>) => Promise<T>;
  scrollIntoViewIfNeeded?: () => Promise<void>;
};

type PlaywrightPage = {
  goto: (url: string, opts: Record<string, unknown>) => Promise<{ status: () => number } | null>;
  url: () => string;
  title: () => Promise<string>;
  close: () => Promise<void>;
  on: (event: 'response', handler: (response: PlaywrightResponse) => void) => void;
  addInitScript: (fn: () => void) => Promise<void>;
  waitForSelector: (sel: string, opts: Record<string, unknown>) => Promise<void>;
  waitForLoadState: (state: string, opts: Record<string, unknown>) => Promise<void>;
  waitForURL: (pattern: RegExp | string, opts: Record<string, unknown>) => Promise<void>;
  waitForFunction: (
    fn: (...args: unknown[]) => boolean | Promise<boolean>,
    opts: Record<string, unknown>,
    ...args: unknown[]
  ) => Promise<void>;
  waitForTimeout?: (ms: number) => Promise<void>;
  evaluate: <T>(
    fn: string | ((...args: unknown[]) => T | Promise<T>),
    ...args: unknown[]
  ) => Promise<T>;
  locator: (sel: string) => PlaywrightLocator;
  keyboard?: { press: (key: string) => Promise<void> };
  getByRole: (
    role: string,
    opts: { name: RegExp },
  ) => { first: () => { click: (opts: Record<string, unknown>) => Promise<void> } };
  screenshot: (opts?: Record<string, unknown>) => Promise<Buffer>;
};
