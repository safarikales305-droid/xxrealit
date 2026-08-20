import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeedXml } from './news-feed.util';

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <item>
      <title>Ceny nemovitostí rostou</title>
      <link>https://example.com/clanek-1</link>
      <description>Shrnutí článku o cenách nemovitostí.</description>
      <pubDate>Mon, 01 Aug 2026 10:00:00 GMT</pubDate>
      <guid>guid-1</guid>
    </item>
    <item>
      <title>Hypotéky zdražily</title>
      <link>https://example.com/clanek-2</link>
      <description>Druhý článek o hypotékách.</description>
      <pubDate>Tue, 02 Aug 2026 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const SAMPLE_ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <entry>
    <title>Nájmy v Brně</title>
    <link href="https://example.com/atom-1"/>
    <summary>Nájemné v Brně roste.</summary>
    <updated>2026-08-03T08:00:00Z</updated>
    <id>atom-1</id>
  </entry>
</feed>`;

describe('news feed util', () => {
  it('parses RSS items', async () => {
    const items = await parseFeedXml(SAMPLE_RSS);
    assert.equal(items.length, 2);
    assert.equal(items[0]?.title, 'Ceny nemovitostí rostou');
    assert.equal(items[0]?.link, 'https://example.com/clanek-1');
    assert.ok(items[0]?.publishedAt instanceof Date);
  });

  it('parses Atom entries', async () => {
    const items = await parseFeedXml(SAMPLE_ATOM);
    assert.equal(items.length, 1);
    assert.equal(items[0]?.title, 'Nájmy v Brně');
    assert.equal(items[0]?.link, 'https://example.com/atom-1');
  });

  it('returns empty array for invalid xml root', async () => {
    const items = await parseFeedXml('<html><body>not a feed</body></html>');
    assert.deepEqual(items, []);
  });
});
