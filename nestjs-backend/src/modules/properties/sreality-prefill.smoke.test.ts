import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  hasMinimumPrefillData,
  parseSrealityListingMulti,
} from './sreality-listing-prefill.util';
import { ConfigService } from '@nestjs/config';
import { SrealityPlaywrightService } from './sreality-playwright.service';

const SAMPLE_URLS: Array<{ label: string; url: string }> = [
  {
    label: 'byt',
    url: 'https://www.sreality.cz/detail/prodej/byt/3+kk/praha-liben-na-kopecku/951038028',
  },
  {
    label: 'dům',
    url: 'https://www.sreality.cz/detail/prodej/dum/rodinny/praha-reporyje-mrakovska/2940224076',
  },
  {
    label: 'pozemek',
    url: 'https://www.sreality.cz/detail/prodej/pozemek/zahrada/prostejov-prostejov-lidicka/3044057676',
  },
  {
    label: 'komerční',
    url: 'https://www.sreality.cz/detail/prodej/komercni/vyrobni-prostor/kostelec-nad-orlici-kostelec-nad-orlici-/1608786764',
  },
  {
    label: 'garáž',
    url: 'https://www.sreality.cz/detail/prodej/ostatni/garaz/praha-michle-jihlavska/3220312908',
  },
  {
    label: 'chalupa',
    url: 'https://www.sreality.cz/detail/prodej/dum/rodinny/petrov-chlomek-na-pijavkach/2326340428',
  },
  {
    label: 'byt pronájem',
    url: 'https://www.sreality.cz/detail/prodej/byt/2+kk/praha-nusle-mnatova/2695914316',
  },
  {
    label: 'dům 2',
    url: 'https://www.sreality.cz/detail/prodej/dum/rodinny/rusava-rusava-/1251279692',
  },
  {
    label: 'komerční restaurace',
    url: 'https://www.sreality.cz/detail/prodej/komercni/restaurace/orlova-lutyne-rydultowska/3380548428',
  },
  {
    label: 'byt 2+1',
    url: 'https://www.sreality.cz/detail/prodej/byt/2+1/praha-zizkov-basilejske-namesti/3623773004',
  },
];

const RUN_LIVE =
  process.env.SREALITY_PREFILL_LIVE === '1' &&
  Boolean(process.env.SREALITY_PLAYWRIGHT_STORAGE_STATE_PATH || process.env.SREALITY_PLAYWRIGHT_COOKIES_JSON);

describe('sreality prefill parsers (offline fixtures)', () => {
  it('parses JSON-LD + NEXT_DATA sample HTML', () => {
    const html = `
      <html><head>
        <script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"estate":{"name":"Prodej bytu 2+kk","description":"Krásný byt","locality":{"city":"Praha"}}}}}</script>
        <script type="application/ld+json">{"@type":"Product","name":"Prodej bytu 2+kk","description":"Krásný byt","offers":{"price":"4500000"}}</script>
        <meta property="og:title" content="Prodej bytu 2+kk Praha" />
        <meta property="og:description" content="Krásný byt v centru" />
      </head><body><h1>Prodej bytu 2+kk</h1></body></html>`;
    const { data, debug } = parseSrealityListingMulti(
      html,
      'https://www.sreality.cz/detail/prodej/byt/2+kk/praha/123',
    );
    assert.ok(debug.foundNextData || debug.foundJsonLd);
    assert.ok(hasMinimumPrefillData(data), `fields=${debug.fieldsFound.join(',')}`);
    assert.ok(data.title);
    assert.ok(data.city || data.location);
  });

  it('parses HTML-only fallback with h1 and params table', () => {
    const html = `
      <html><body>
        <h1>Prodej rodinného domu</h1>
        <p>Popis nemovitosti v klidné lokalitě.</p>
        <dl><dt>Město</dt><dd>Brno</dd><dt>Užitná plocha</dt><dd>120 m²</dd></dl>
      </body></html>`;
    const { data, debug } = parseSrealityListingMulti(
      html,
      'https://www.sreality.cz/detail/prodej/dum/rodinny/brno/999',
    );
    assert.ok(debug.foundHtmlParser);
    assert.ok(hasMinimumPrefillData(data));
  });
});

const liveDescribe = RUN_LIVE ? describe : describe.skip;

liveDescribe('sreality prefill live playwright', () => {
  const config = {
    get: (key: string) => process.env[key],
  } as ConfigService;
  const playwright = new SrealityPlaywrightService(config);

  for (const sample of SAMPLE_URLS) {
    it(`live import: ${sample.label}`, async () => {
      const rendered = await playwright.renderPage(sample.url, { timeoutMs: 60_000, retries: 1 });
      if (rendered.errorCode) {
        assert.fail(
          `${sample.label}: ${rendered.errorCode} — ${rendered.errorDetail ?? 'bez detailu'}`,
        );
      }
      assert.ok(rendered.html.length > 500, `${sample.label}: prázdné HTML`);
      const { data, debug } = parseSrealityListingMulti(rendered.html, rendered.finalUrl || sample.url);
      assert.ok(
        hasMinimumPrefillData(data),
        `${sample.label}: minimum nenalezeno, fields=${debug.fieldsFound.join(',')}, parsers=${debug.parsersUsed.join(',')}`,
      );
    });
  }
});
