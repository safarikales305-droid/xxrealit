import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Logger } from '@nestjs/common';
import sharp, { assertSharpReady } from '../../lib/sharp-instance';

const log = new Logger('ShortsOverlayAssets');

const FALLBACK_LOGO_CACHE: { buf: Buffer | null } = { buf: null };

/** Cílová šířka loga ve shorts overlay (150–220 px). */
export const SHORTS_LOGO_TARGET_WIDTH = 180;

export type ShortsPortalLogoLoadResult = {
  buffer: Buffer;
  path: string | null;
  logoExists: boolean;
  logoLoaded: boolean;
  logoUsedAsImage: boolean;
};

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

function collectRelativeLogoPaths(): string[] {
  return [
    'public/logo.png',
    'public/xxrealit-logo.png',
    'public/logo-watermark.png',
    'assets/xxrealit-logo.png',
    'assets/logo.png',
    '../zdroj/public/logo.png',
    '../zdroj/public/xxrealit-logo.png',
    '../zdroj/public/logo-watermark.png',
    '../zdroj/public/favicon.svg',
    '../zdroj/public/icons/icon.svg',
  ];
}

/** Kandidáti na raster logo (PNG/WebP) nebo SVG. */
export function shortsLogoCandidates(): string[] {
  const envPath = process.env.WATERMARK_LOGO_PATH?.trim();
  const roots = assetRoots();
  const out: string[] = [];
  if (envPath) out.push(resolve(envPath));
  for (const root of roots) {
    for (const r of collectRelativeLogoPaths()) {
      out.push(join(root, r));
    }
  }
  return out;
}

export function resolveShortsLogoPath(): string | null {
  return firstExisting(shortsLogoCandidates());
}

async function rasterizeLogoBuffer(input: Buffer, targetWidth: number): Promise<Buffer> {
  assertSharpReady('shorts logo rasterize');
  return sharp(input)
    .resize(targetWidth, 52, { fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();
}

/** Oranžový badge — pouze jako poslední fallback po zalogování chyby. */
export async function generateFallbackLogoPng(): Promise<Buffer> {
  if (FALLBACK_LOGO_CACHE.buf) return FALLBACK_LOGO_CACHE.buf;
  assertSharpReady('shorts fallback logo');
  const svg = `<svg width="168" height="44" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="168" height="44" rx="8" fill="#FF6A00"/>
  <text x="84" y="30" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="700" fill="#FFFFFF" text-anchor="middle">XXREALIT</text>
</svg>`;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  FALLBACK_LOGO_CACHE.buf = buf;
  return buf;
}

/**
 * Načte grafické logo portálu. Priorita: PNG → SVG (favicon) → textový fallback.
 */
export async function loadShortsPortalLogo(
  targetWidth = SHORTS_LOGO_TARGET_WIDTH,
): Promise<ShortsPortalLogoLoadResult> {
  const path = resolveShortsLogoPath();
  if (path) {
    try {
      const raw = readFileSync(path);
      if (raw.length > 0) {
        const buffer = await rasterizeLogoBuffer(raw, targetWidth);
        return {
          buffer,
          path,
          logoExists: true,
          logoLoaded: true,
          logoUsedAsImage: true,
        };
      }
    } catch (e) {
      log.warn(
        `Logo soubor nalezen (${path}), ale nepodařilo se načíst: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  log.error(
    `[shorts-logo] Chybí grafické logo (logo.png / xxrealit-logo.png / favicon.svg). Zkontrolujte zdroj/public/. Používám textový fallback.`,
  );
  const buffer = await generateFallbackLogoPng();
  return {
    buffer,
    path: null,
    logoExists: false,
    logoLoaded: true,
    logoUsedAsImage: false,
  };
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
