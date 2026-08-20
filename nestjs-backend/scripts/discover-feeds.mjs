async function discover(baseUrl) {
  try {
    const r = await fetch(baseUrl, { headers: { 'User-Agent': 'XXREALIT' } });
    const h = await r.text();
    const links = [...h.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]);
    const feedLinks = links.filter((l) => /\.rss|\.xml|\/rss|\/feed/i.test(l));
    console.log('\n===', baseUrl, '===');
    for (const l of [...new Set(feedLinks)].slice(0, 20)) {
      const u = l.startsWith('http') ? l : new URL(l, baseUrl).href;
      try {
        const fr = await fetch(u, { headers: { 'User-Agent': 'XXREALIT' } });
        const t = await fr.text();
        const ok = fr.ok && (t.includes('<rss') || t.includes('<feed'));
        if (ok) console.log('OK', fr.status, (t.match(/<item|<entry/g) || []).length, u);
      } catch {
        /* skip */
      }
    }
  } catch (e) {
    console.log('ERR', baseUrl, e.message);
  }
}

await discover('https://www.czso.cz/');
await discover('https://csu.gov.cz/');
await discover('https://mmr.gov.cz/cs/');
await discover('https://www.mmr.cz/cs/');
