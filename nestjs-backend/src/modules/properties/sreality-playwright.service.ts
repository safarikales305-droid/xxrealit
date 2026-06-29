import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'node:fs';

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
export class SrealityPlaywrightService {
  private readonly logger = new Logger(SrealityPlaywrightService.name);

  constructor(private readonly config: ConfigService) {}

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
    get: (url: string, opts: Record<string, unknown>) => Promise<{ text: () => Promise<string> }>;
  };
};

type PlaywrightPage = {
  goto: (url: string, opts: Record<string, unknown>) => Promise<{ status: () => number } | null>;
  url: () => string;
  addInitScript: (fn: () => void) => Promise<void>;
  waitForSelector: (sel: string, opts: Record<string, unknown>) => Promise<void>;
  waitForLoadState: (state: string, opts: Record<string, unknown>) => Promise<void>;
  waitForURL: (pattern: RegExp | string, opts: Record<string, unknown>) => Promise<void>;
  waitForTimeout?: (ms: number) => Promise<void>;
  evaluate: <T>(fn: () => T | Promise<T>) => Promise<T>;
  locator: (sel: string) => {
    first: () => { count: () => Promise<number>; click: (opts: Record<string, unknown>) => Promise<void> };
  };
  getByRole: (
    role: string,
    opts: { name: RegExp },
  ) => { first: () => { click: (opts: Record<string, unknown>) => Promise<void> } };
};
