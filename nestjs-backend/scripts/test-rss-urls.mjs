const urls = process.argv.slice(2);
const extra = [
  'https://www.cnb.cz/cs/obecne/rss/',
];

async function testUrl(u) {
  try {
    const r = await fetch(u, { redirect: 'follow', headers: { 'User-Agent': 'XXREALIT' } });
    const t = await r.text();
    const ok = r.ok && (t.includes('<rss') || t.includes('<feed'));
    const items = (t.match(/<item|<entry/g) || []).length;
    console.log(ok ? 'OK' : 'NO', r.status, items, u);
    return ok;
  } catch (e) {
    console.log('ERR', u, e.message);
    return false;
  }
}

async function main() {
  if (urls.length) {
    for (const u of urls) await testUrl(u);
    return;
  }
  const r = await fetch('https://www.cnb.cz/cs/obecne/rss/', {
    headers: { 'User-Agent': 'XXREALIT' },
  });
  const h = await r.text();
  const links = [...h.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]);
  const feedLinks = links.filter((l) => /rss|feed|xml|atom/i.test(l));
  console.log('CNB page links:', feedLinks);
  for (const l of feedLinks) {
    const u = l.startsWith('http') ? l : `https://www.cnb.cz${l.startsWith('/') ? '' : '/'}${l}`;
    await testUrl(u);
  }
}

main();
