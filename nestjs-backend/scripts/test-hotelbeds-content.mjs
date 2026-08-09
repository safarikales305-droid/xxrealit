/**
 * Smoke test Hotelbeds Content API — hotel 6741 (Hotel Duo).
 * Usage: HOTELBEDS_API_KEY=... HOTELBEDS_API_SECRET=... node scripts/test-hotelbeds-content.mjs
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env');
try {
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {
  // optional .env
}

const apiKey = process.env.HOTELBEDS_API_KEY?.trim();
const secret = process.env.HOTELBEDS_API_SECRET?.trim();
const base =
  process.env.HOTELBEDS_ENV === 'production'
    ? 'https://api.hotelbeds.com/hotel-content-api/1.0'
    : 'https://api.test.hotelbeds.com/hotel-content-api/1.0';

if (!apiKey || !secret) {
  console.error('Missing HOTELBEDS_API_KEY or HOTELBEDS_API_SECRET');
  process.exit(1);
}

function authHeaders() {
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHash('sha256').update(`${apiKey}${secret}${ts}`, 'utf8').digest('hex');
  return { Accept: 'application/json', 'Api-key': apiKey, 'X-Signature': sig };
}

async function testLanguage(language) {
  const url = `${base}/hotels?fields=all&language=${language}&useSecondaryLanguage=false&codes=6741`;
  const res = await fetch(url, { headers: authHeaders() });
  const text = await res.text();
  let hotels = 0;
  let images = 0;
  let name = null;
  try {
    const json = JSON.parse(text);
    const hotel = json.hotels?.[0];
    name = hotel?.name?.content ?? hotel?.name ?? null;
    images = hotel?.images?.length ?? 0;
    hotels = json.hotels?.length ?? 0;
  } catch {
    // ignore
  }
  return { language, status: res.status, hotels, images, name, bodyPreview: text.slice(0, 200) };
}

const results = [];
for (const lang of ['ENG']) {
  results.push(await testLanguage(lang));
}

for (const r of results) {
  console.log(
    `language=${r.language} HTTP ${r.status} hotels=${r.hotels} images=${r.images} name=${r.name ?? '—'}`,
  );
  if (r.status >= 400) console.log(`  error: ${r.bodyPreview}`);
}

const ok = results.find((r) => r.status === 200 && r.images > 0);
process.exit(ok ? 0 : 1);
