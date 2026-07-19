import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePageMetaFromHtml,
  probeCrawlerAccess,
  runMetaUrlDiagnostics,
} from './meta-url-diagnostics.util';

test('parsePageMetaFromHtml extracts OG and Twitter tags', () => {
  const html = `<!doctype html><html><head>
<link rel="canonical" href="https://www.xxrealit.cz/nemovitost/1" />
<meta name="robots" content="index,follow" />
<meta property="og:type" content="website" />
<meta property="og:title" content="Prodej pole" />
<meta property="og:description" content="Popis" />
<meta property="og:image" content="https://cdn.example/og.jpg" />
<meta property="og:video" content="https://cdn.example/v.mp4" />
<meta name="twitter:card" content="summary_large_image" />
</head><body></body></html>`;
  const meta = parsePageMetaFromHtml(html);
  assert.equal(meta.ogTitle, 'Prodej pole');
  assert.equal(meta.ogType, 'website');
  assert.equal(meta.twitterCard, 'summary_large_image');
  assert.equal(meta.canonical, 'https://www.xxrealit.cz/nemovitost/1');
});

test('probeCrawlerAccess rejects login redirect for Facebook UA', async () => {
  const fetchFn = async (url: string | URL) => {
    const target = String(url);
    if (target.includes('/login')) {
      return new Response('<html>login</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }
    return new Response('', {
      status: 302,
      headers: { location: 'https://www.xxrealit.cz/login' },
    });
  };
  const result = await probeCrawlerAccess(
    'https://www.xxrealit.cz/nemovitost/x',
    'facebookexternalhit/1.1',
    { fetchFn },
  );
  assert.equal(result.ok, false);
  assert.equal(result.requiresLogin, true);
});

test('runMetaUrlDiagnostics passes for complete public page', async () => {
  const html = `<!doctype html><html><head>
<link rel="canonical" href="https://www.xxrealit.cz/nemovitost/1" />
<meta property="og:title" content="T" />
<meta property="og:description" content="D" />
<meta property="og:image" content="https://cdn.example/og.jpg" />
<meta name="twitter:card" content="summary_large_image" />
</head><body>ok</body></html>`;
  const fetchFn = async () =>
    new Response(html, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  const result = await runMetaUrlDiagnostics('https://www.xxrealit.cz/nemovitost/1', {
    fetchFn,
  });
  assert.equal(result.httpStatus, 200);
  assert.equal(result.facebookCrawler.ok, true);
  assert.equal(result.meta.ogTitle, 'T');
});
