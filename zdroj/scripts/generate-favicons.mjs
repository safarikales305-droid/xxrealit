/**
 * Generuje PNG ikony a favicon.ico z public/icons/icon.svg
 * Spusť: node scripts/generate-favicons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import toIco from 'png-to-ico';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const svgPath = path.join(root, 'public', 'icons', 'icon.svg');
const outDir = path.join(root, 'public', 'icons');

const svg = fs.readFileSync(svgPath);

async function png(size) {
  return sharp(svg).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
}

const sizes = [16, 32, 192, 512];
const buffers = {};

for (const s of sizes) {
  buffers[s] = await png(s);
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon-32.png'), buffers[32]);
fs.writeFileSync(path.join(outDir, 'icon-192.png'), buffers[192]);
fs.writeFileSync(path.join(outDir, 'icon-512.png'), buffers[512]);

const icoBuf = await toIco([buffers[32], buffers[16]]);
fs.writeFileSync(path.join(root, 'public', 'favicon.ico'), icoBuf);

console.log('OK: public/favicon.ico, public/icons/icon-32.png, icon-192.png, icon-512.png');
