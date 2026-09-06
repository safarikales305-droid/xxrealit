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
  isSrealityCdnResponseUrl,
  matchKeysForImageUrl,
  SREALITY_BROWSER_MEDIA_TIMEOUTS,
  validateSrealityImageBuffer,
  type SrealityBrowserCapturedImage,
  type SrealityImageCaptureMethod,
} from './sreality-browser-media.util';

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
    failed: number;
  };
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
  }): Promise<SrealityGalleryCaptureResult> {
    const targetUrls = dedupeSrealityImageUrls(options.targetUrls);
    const enrichContact = options.enrichContact ?? false;
    if (!targetUrls.length && !enrichContact) {
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
          failed: 0,
        },
      };
    }

    try {
      return await this.captureGalleryImagesOnce(options.listingUrl, targetUrls, enrichContact);
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
          failed: targetUrls.length,
        },
      };
    }
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

      const extracted = await page.evaluate(() => {
        const urls = new Set<string>();
        const addUrl = (raw: string | null | undefined) => {
          if (!raw) return;
          const s = raw.trim();
          if (!s || /logo|icon|sprite|1x1|avatar|profile/i.test(s)) return;
          if (/sreality\.cz/i.test(s) || /^\/.*\.(jpe?g|webp|png)/i.test(s)) {
            urls.add(s.startsWith('//') ? `https:${s}` : s);
          }
        };
        for (const img of Array.from(document.querySelectorAll('img'))) {
          addUrl(img.getAttribute('src'));
          addUrl(img.getAttribute('data-src'));
          addUrl(img.getAttribute('data-original'));
          const srcset = img.getAttribute('srcset');
          if (srcset) {
            for (const part of srcset.split(',')) {
              addUrl(part.trim().split(/\s+/)[0]);
            }
          }
        }
        for (const source of Array.from(document.querySelectorAll('picture source'))) {
          addUrl(source.getAttribute('srcset')?.split(',')[0]?.trim().split(/\s+/)[0]);
        }
        return Array.from(urls);
      });

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
    const contentHashes = new Set<string>();
    const networkJson: unknown[] = [];

    const tryCaptureFromBuffer = async (
      url: string,
      buffer: Buffer,
      contentType: string | null,
      method: SrealityImageCaptureMethod,
    ) => {
      const validated = await validateSrealityImageBuffer(buffer, contentType);
      if (!validated) return;
      if (contentHashes.has(validated.contentHash)) return;

      for (const key of matchKeysForImageUrl(url)) {
        if (!pendingByKey.has(key) || capturedByKey.has(key)) continue;
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

    page.on('response', (response: PlaywrightResponse) => {
      void (async () => {
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
        if (status !== 200 || !ct.startsWith('image/')) return;
        try {
          const body = await response.body();
          await tryCaptureFromBuffer(resUrl, body, ct, 'BROWSER_RESPONSE');
        } catch {
          /* ignore */
        }
      })();
    });

    let contactClickAttempted = false;
    let contactClickSucceeded = false;
    let galleryOpened = false;
    let html = '';
    let imageUrlsFound: string[] = [];
    let enrichmentStatus: SrealityGalleryCaptureResult['enrichmentStatus'] = 'PASS';

    try {
      await this.withTimeout(
        (async () => {
          await page
            .goto('https://www.sreality.cz/', { waitUntil: 'domcontentloaded', timeout: 5_000 })
            .catch(() => undefined);
          await this.delay(page, 200);
          await page.goto(listingUrl, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT_MS });
          await this.handleSeznamConsent(page, listingUrl, context);
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
        })(),
        SREALITY_BROWSER_MEDIA_TIMEOUTS.PAGE_LOAD_MS,
        `PAGE_LOAD timeout po ${SREALITY_BROWSER_MEDIA_TIMEOUTS.PAGE_LOAD_MS} ms`,
      );

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
        galleryOpened = await this.withTimeout(
          this.openGalleryAndBrowse(page, pendingByKey, capturedByKey),
          SREALITY_BROWSER_MEDIA_TIMEOUTS.GALLERY_OPEN_MS +
            targetUrls.length * SREALITY_BROWSER_MEDIA_TIMEOUTS.IMAGE_LOAD_MS,
          `GALLERY_OPEN timeout`,
        );
      } catch {
        enrichmentStatus = 'PARTIAL';
      }

      const extracted = await page.evaluate(() => {
        const urls = new Set<string>();
        const addUrl = (raw: string | null | undefined) => {
          if (!raw) return;
          const s = raw.trim();
          if (!s || /logo|icon|sprite|1x1|avatar|profile/i.test(s)) return;
          if (/sdn\.cz|sreality\.cz/i.test(s) || /^\/.*\.(jpe?g|webp|png)/i.test(s)) {
            urls.add(s.startsWith('//') ? `https:${s}` : s);
          }
        };
        for (const img of Array.from(document.querySelectorAll('img'))) {
          addUrl(img.getAttribute('src'));
          addUrl(img.getAttribute('data-src'));
          addUrl(img.getAttribute('data-original'));
          const srcset = img.getAttribute('srcset');
          if (srcset) {
            for (const part of srcset.split(',')) {
              addUrl(part.trim().split(/\s+/)[0]);
            }
          }
        }
        return Array.from(urls);
      });
      imageUrlsFound = dedupeSrealityImageUrls(extracted);
      html = await page.evaluate(() => document.documentElement.outerHTML);

      const stillPending = [...pendingByKey.entries()].filter(([key]) => !capturedByKey.has(key));
      for (const [key, sourceUrl] of stillPending) {
        try {
          await this.withTimeout(
            (async () => {
              const contextResult = await this.tryBrowserContextImage(context, sourceUrl, listingUrl);
              if (contextResult) {
                await tryCaptureFromBuffer(
                  sourceUrl,
                  contextResult.buffer,
                  contextResult.contentType,
                  'BROWSER_CONTEXT',
                );
                if (capturedByKey.has(key)) return;
              }
              const elementBuffer = await this.captureElementForUrl(page, sourceUrl);
              if (elementBuffer) {
                await tryCaptureFromBuffer(sourceUrl, elementBuffer, 'image/jpeg', 'ELEMENT_CAPTURE');
              }
            })(),
            SREALITY_BROWSER_MEDIA_TIMEOUTS.ELEMENT_CAPTURE_MS,
            `ELEMENT_CAPTURE timeout pro ${sourceUrl.slice(0, 80)}`,
          );
        } catch {
          enrichmentStatus = 'PARTIAL';
        }
      }

      const htmlBroker = extractSrealityBrokerFromHtml(html);
      const networkBrokerParts = networkJson.map((payload) =>
        extractSrealityBrokerFromRaw(
          payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null,
        ),
      );
      const broker = mergeBrokerParts([htmlBroker, ...networkBrokerParts]);

      const captured = this.orderCapturedImages(targetUrls, capturedByKey, contentHashes);
      const stats = {
        browserResponseSuccess: captured.filter((x) => x.method === 'BROWSER_RESPONSE').length,
        elementCaptureSuccess: captured.filter((x) => x.method === 'ELEMENT_CAPTURE').length,
        browserContextSuccess: captured.filter((x) => x.method === 'BROWSER_CONTEXT').length,
        failed: Math.max(0, targetUrls.length - captured.length),
      };

      if (stats.failed > 0 && captured.length > 0) enrichmentStatus = 'PARTIAL';
      if (captured.length === 0 && targetUrls.length > 0) enrichmentStatus = 'FAIL';

      this.logger.log(
        `SREALITY_BROWSER_MEDIA_DONE captured=${captured.length}/${targetUrls.length} response=${stats.browserResponseSuccess} element=${stats.elementCaptureSuccess} context=${stats.browserContextSuccess}`,
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
        stats,
      };
    } finally {
      await page.close().catch(() => undefined);
      await context.close().catch(() => undefined);
    }
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

  private async openGalleryAndBrowse(
    page: PlaywrightPage,
    pendingByKey: Map<string, string>,
    capturedByKey: Map<string, SrealityBrowserCapturedImage>,
  ): Promise<boolean> {
    const galleryOpenSelectors = [
      '[data-e2e="detail-gallery"] img',
      '[data-e2e="detail-image"]',
      '[data-e2e="detail-gallery"] button',
      '.gallery img',
      'picture img',
      'main img[src*="sdn.cz"]',
      'main img[src*="sreality"]',
    ];

    let galleryOpened = false;
    for (const sel of galleryOpenSelectors) {
      try {
        const el = page.locator(sel).first();
        if ((await el.count()) > 0) {
          await el.click({ timeout: 2000 }).catch(() => undefined);
          galleryOpened = true;
          await this.waitForGalleryImageLoaded(page);
          break;
        }
      } catch {
        /* ignore */
      }
    }

    const nextSelectors = [
      '[data-e2e="gallery-next"]',
      'button[aria-label*="Další"]',
      'button[aria-label*="Next"]',
      'button:has-text("Další")',
    ];

    const maxSteps = Math.max(20, pendingByKey.size + 5);
    for (let step = 0; step < maxSteps; step += 1) {
      if ([...pendingByKey.keys()].every((key) => capturedByKey.has(key))) break;

      await this.waitForGalleryImageLoaded(page).catch(() => undefined);

      let advanced = false;
      for (const sel of nextSelectors) {
        try {
          const next = page.locator(sel).first();
          if ((await next.count()) === 0) continue;
          await next.click({ timeout: 1500 }).catch(() => undefined);
          advanced = true;
          await this.waitForGalleryImageLoaded(page).catch(() => undefined);
          break;
        } catch {
          /* ignore */
        }
      }
      if (!advanced) break;
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

  private async tryBrowserContextImage(
    context: PlaywrightContext,
    sourceUrl: string,
    referer: string,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    for (const candidate of buildSrealityImageFetchCandidates(sourceUrl)) {
      if (!isSrealityCdnResponseUrl(candidate)) continue;
      try {
        const res = await context.request.get(candidate, {
          headers: { Referer: referer },
          timeout: SREALITY_BROWSER_MEDIA_TIMEOUTS.IMAGE_LOAD_MS,
        });
        if (res.status() !== 200) continue;
        const ct = res.headers()['content-type'] ?? '';
        if (!ct.startsWith('image/')) continue;
        const buffer = await res.body();
        const validated = await validateSrealityImageBuffer(buffer, ct);
        if (validated) return { buffer, contentType: ct };
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
  screenshot: (opts?: Record<string, unknown>) => Promise<Buffer>;
  evaluate: <T>(fn: (el: Element) => T | Promise<T>) => Promise<T>;
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
  evaluate: <T>(fn: () => T | Promise<T>) => Promise<T>;
  locator: (sel: string) => PlaywrightLocator;
  getByRole: (
    role: string,
    opts: { name: RegExp },
  ) => { first: () => { click: (opts: Record<string, unknown>) => Promise<void> } };
};
