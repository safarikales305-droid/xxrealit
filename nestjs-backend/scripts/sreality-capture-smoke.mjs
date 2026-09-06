import { chromium } from 'playwright';
import { ConfigService } from '@nestjs/config';
import { SrealityPlaywrightService } from '../dist/modules/properties/sreality-playwright.service.js';
import { dedupeSrealityImageUrls } from '../dist/modules/properties/sreality-image.util.js';

const listingUrl =
  process.argv[2] || 'https://www.sreality.cz/detail/prodej/dum/rodinny/uholicky-uholicky-/832254028';

async function discoverImageUrls(url) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 2400 },
    locale: 'cs-CZ',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  await page.goto('https://www.sreality.cz/', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => undefined);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  for (const name of [/souhlas/i, /přijm/i, /accept/i]) {
    await page.getByRole('button', { name }).first().click({ timeout: 1500 }).catch(() => undefined);
  }
  await page.waitForTimeout(2000);
  const html = await page.content();
  const fromNext = [...html.matchAll(/https:\/\/[^"'\\s]+?\.sdn\.cz[^"'\\s]*/g)].map((m) => m[0]);
  const fromDom = await page.evaluate(() => {
    const urls = new Set();
    for (const img of document.querySelectorAll('img')) {
      for (const attr of ['src', 'data-src']) {
        const v = img.getAttribute(attr);
        if (v && /sdn\.cz/i.test(v)) urls.add(v.startsWith('//') ? `https:${v}` : v);
      }
    }
    return [...urls];
  });
  await browser.close();
  return dedupeSrealityImageUrls([...fromNext, ...fromDom]);
}

const config = { get: (key) => process.env[key] };
const playwright = new SrealityPlaywrightService(new ConfigService(config));

try {
  console.log('LISTING_URL', listingUrl);
  const imageUrls = await discoverImageUrls(listingUrl);
  console.log('GALLERY_FOUND', imageUrls.length, imageUrls.slice(0, 2));
  if (!imageUrls.length) throw new Error('No SDN image URLs discovered');

  const targets = imageUrls.slice(0, 5);
  const capture = await playwright.captureGalleryImages({
    listingUrl,
    targetUrls: targets,
    enrichContact: false,
  });
  console.log('CAPTURED', capture.captured.length, '/', targets.length);
  console.log('STATS', JSON.stringify(capture.stats));
  for (const item of capture.captured) {
    console.log('ITEM', item.method, `${item.width}x${item.height}`, item.buffer.length);
  }
  await playwright.onModuleDestroy();
  process.exit(capture.captured.length > 0 ? 0 : 1);
} catch (err) {
  console.error('SMOKE_FAIL', err instanceof Error ? err.message : err);
  await playwright.onModuleDestroy().catch(() => undefined);
  process.exit(1);
}
