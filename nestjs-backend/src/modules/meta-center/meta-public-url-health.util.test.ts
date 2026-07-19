import test from 'node:test';
import assert from 'node:assert/strict';
import { probeMetaPublicUrl } from './meta-public-url-health.util';

function htmlWithOg(title: string, description: string, image: string): string {
  return `<!doctype html><html><head>
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:image" content="${image}" />
</head><body>ok</body></html>`;
}

test('probeMetaPublicUrl accepts public HTML with Open Graph tags', async () => {
  const fetchFn = async () =>
    new Response(htmlWithOg('Test', 'Popis', 'https://cdn.example/og.jpg'), {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });

  const result = await probeMetaPublicUrl('https://www.xxrealit.cz/nemovitost/abc', {
    fetchFn,
  });
  assert.equal(result.ok, true);
  assert.equal(result.httpStatus, 200);
  assert.equal(result.anonymousAccess, true);
  assert.equal(result.hasOpenGraph, true);
});

test('probeMetaPublicUrl fails on login redirect', async () => {
  const fetchFn = async (url: string | URL) => {
    const target = String(url);
    if (target.includes('/login')) {
      return new Response('<html>login</html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
    return new Response('', {
      status: 302,
      headers: { location: 'https://www.xxrealit.cz/login?redirect=%2Fmakler%2Fjan' },
    });
  };

  const result = await probeMetaPublicUrl('https://www.xxrealit.cz/makler/jan', {
    fetchFn,
    maxRedirects: 3,
  });
  assert.equal(result.ok, false);
  assert.equal(result.requiresLogin, true);
  assert.match(result.errors.join(' '), /login/i);
});

test('probeMetaPublicUrl follows redirects and reports chain', async () => {
  let calls = 0;
  const fetchFn = async (url: string | URL) => {
    calls += 1;
    if (calls === 1) {
      return new Response('', {
        status: 301,
        headers: { location: 'https://www.xxrealit.cz/final' },
      });
    }
    return new Response(htmlWithOg('Finální', 'Stránka', 'https://cdn.example/img.jpg'), {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
  };

  const result = await probeMetaPublicUrl('https://www.xxrealit.cz/start', { fetchFn });
  assert.equal(result.redirects.length, 1);
  assert.equal(result.redirects[0]?.status, 301);
  assert.equal(result.ok, true);
  assert.equal(result.finalUrl, 'https://www.xxrealit.cz/final');
});

test('probeMetaPublicUrl rejects non-200 status', async () => {
  const fetchFn = async () =>
    new Response('not found', {
      status: 404,
      headers: { 'content-type': 'text/html' },
    });

  const result = await probeMetaPublicUrl('https://www.xxrealit.cz/chybi', { fetchFn });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /404/);
});
