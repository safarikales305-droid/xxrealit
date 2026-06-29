/**
 * Jednorázově uloží Playwright storage state po ručním odsouhlasení cookies na Sreality.
 * Použití: npx tsx src/modules/properties/sreality-prefill.save-storage.ts ./sreality-storage.json
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

type SaveStoragePage = {
  goto: (url: string, opts: { waitUntil?: string; timeout?: number }) => Promise<void>;
  waitForTimeout: (ms: number) => Promise<void>;
};

type SaveStorageContext = {
  newPage: () => Promise<SaveStoragePage>;
  storageState: (opts: { path: string }) => Promise<void>;
  close: () => Promise<void>;
};

async function main() {
  const outPath = resolve(process.argv[2] ?? './sreality-playwright-storage.json');
  mkdirSync(dirname(outPath), { recursive: true });
  const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<unknown>;
  const playwright = (await dynamicImport('playwright')) as {
    chromium: {
      launch: (opts: Record<string, unknown>) => Promise<{
        newContext: (opts: Record<string, unknown>) => Promise<SaveStorageContext>;
        close: () => Promise<void>;
      }>;
    };
  };
  const browser = await playwright.chromium.launch({ headless: false });
  const context = await browser.newContext({ locale: 'cs-CZ' });
  const page = await context.newPage();
  const sample =
    'https://www.sreality.cz/detail/prodej/byt/3+kk/praha-liben-na-kopecku/951038028';
  console.log('Otevřen prohlížeč — odsouhlaste cookies a počkejte na detail inzerátu.');
  await page.goto(sample, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.waitForTimeout(3_000);
  await page.waitForTimeout(120_000);
  await context.storageState({ path: outPath });
  console.log(`Uloženo: ${outPath}`);
  console.log(`Nastavte env: SREALITY_PLAYWRIGHT_STORAGE_STATE_PATH=${outPath}`);
  await context.close();
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
