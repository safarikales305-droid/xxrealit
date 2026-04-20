import { Injectable, Logger } from '@nestjs/common';

type RenderedDetailResult = {
  html: string;
  finalUrl: string;
};

@Injectable()
export class Century21DetailPlaywrightService {
  private readonly logger = new Logger(Century21DetailPlaywrightService.name);

  async renderDetailHtml(
    url: string,
    options?: { timeoutMs?: number; retries?: number },
  ): Promise<RenderedDetailResult> {
    const timeoutMs = Math.max(10_000, options?.timeoutMs ?? 45_000);
    const retries = Math.max(1, Math.min(4, options?.retries ?? 2));
    let lastErr: unknown = null;

    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        return await this.renderOnce(url, timeoutMs);
      } catch (e) {
        lastErr = e;
        this.logger.warn(
          `CENTURY21 playwright detail retry ${attempt}/${retries} url=${url} err=${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }

    throw new Error(lastErr instanceof Error ? lastErr.message : String(lastErr));
  }

  private async renderOnce(url: string, timeoutMs: number): Promise<RenderedDetailResult> {
    const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;
    const playwright = await dynamicImport('playwright');
    const browser = await playwright.chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });

    try {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 2200 },
        locale: 'cs-CZ',
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      });
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

      await this.dismissCookieBanners(page);

      await page
        .waitForSelector('main, [class*="gallery"], [class*="listing"], [class*="contact"]', {
          timeout: Math.min(12_000, timeoutMs / 2),
        })
        .catch(() => undefined);
      await page.waitForTimeout(900);

      const html = await page.content();
      const finalUrl = page.url();
      await context.close();
      return { html, finalUrl };
    } finally {
      await browser.close();
    }
  }

  private async dismissCookieBanners(page: any): Promise<void> {
    const candidates = [
      'button:has-text("Souhlasím")',
      'button:has-text("Přijmout")',
      'button:has-text("Accept")',
      '[id*="cookie"] button',
      '[class*="cookie"] button',
    ];
    for (const selector of candidates) {
      try {
        const el = page.locator(selector).first();
        if ((await el.count()) > 0) {
          await el.click({ timeout: 800 }).catch(() => undefined);
          await page.waitForTimeout(250);
          return;
        }
      } catch {
        /* ignore */
      }
    }
  }
}
