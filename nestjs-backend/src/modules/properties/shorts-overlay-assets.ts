import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

const FALLBACK_LOGO_CACHE: { buf: Buffer | null } = { buf: null };

function assetRoots(): string[] {
  const cwd = process.cwd();
  return [
    cwd,
    join(cwd, 'dist'),
    resolve(__dirname, '..', '..', '..'),
    resolve(__dirname, '..', '..', '..', '..'),
  ];
}

function firstExisting(paths: string[]): string | null {
  for (const p of paths) {
    if (!p) continue;
    const abs = resolve(p);
    if (existsSync(abs)) return abs;
  }
  return null;
}

/** Kandidáti na logo XXREALIT (PNG). */
export function shortsLogoCandidates(): string[] {
  const envPath = process.env.WATERMARK_LOGO_PATH?.trim();
  const roots = assetRoots();
  const rel = [
    'assets/xxrealit-logo.png',
    'assets/logo.png',
    'public/logo-watermark.png',
    'public/logo.png',
    '../zdroj/public/logo-watermark.png',
    '../zdroj/public/logo.png',
  ];
  const out: string[] = [];
  if (envPath) out.push(resolve(envPath));
  for (const root of roots) {
    for (const r of rel) {
      out.push(join(root, r));
    }
  }
  return out;
}

export function resolveShortsLogoPath(): string | null {
  return firstExisting(shortsLogoCandidates());
}

/** Font s podporou české diakritiky — systém + volitelný asset/env. */
export function resolveShortsOverlayFontPath(): string | null {
  const envPath =
    process.env.SHORTS_OVERLAY_FONT_PATH?.trim() ||
    process.env.FONT_PATH?.trim() ||
    '';
  const roots = assetRoots();
  const rel = ['assets/fonts/DejaVuSans-Bold.ttf', 'assets/fonts/NotoSans-Bold.ttf'];
  const candidates = [
    ...(envPath ? [resolve(envPath)] : []),
    ...roots.flatMap((root) => rel.map((r) => join(root, r))),
    'C:/Windows/Fonts/segoeuib.ttf',
    'C:/Windows/Fonts/arialbd.ttf',
    'C:/Windows/Fonts/arial.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    '/Library/Fonts/Arial Bold.ttf',
  ];
  return firstExisting(candidates);
}

/** Oranžový badge „XXREALIT“ pokud chybí soubor loga. */
export async function generateFallbackLogoPng(): Promise<Buffer> {
  if (FALLBACK_LOGO_CACHE.buf) return FALLBACK_LOGO_CACHE.buf;
  const svg = `<svg width="168" height="44" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="168" height="44" rx="8" fill="#FF6A00"/>
  <text x="84" y="30" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="700" fill="#FFFFFF" text-anchor="middle">XXREALIT</text>
</svg>`;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  FALLBACK_LOGO_CACHE.buf = buf;
  return buf;
}
