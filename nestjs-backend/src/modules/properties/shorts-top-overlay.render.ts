import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import {
  generateFallbackLogoPng,
  resolveShortsLogoPath,
} from './shorts-overlay-assets';
import {
  SHORTS_OVERLAY_STYLE_PRESETS,
  type ShortsOverlayAlignment,
  type ShortsOverlayConfig,
  type ShortsOverlayStylePreset,
} from './shorts-overlay.types';

export const SHORTS_WIDTH = 720;
export const SHORTS_HEIGHT = 1280;
export const SHORTS_TOP_SAFE_MARGIN = 48;
export const SHORTS_OVERLAY_BAR_HEIGHT = 108;
export const SHORTS_LOGO_MAX_HEIGHT = 52;

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '').trim();
  if (h.length !== 6) return `rgba(15,23,42,${alpha})`;
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function resolvedPreset(config: ShortsOverlayConfig): ShortsOverlayStylePreset {
  const preset = SHORTS_OVERLAY_STYLE_PRESETS[config.styleKey];
  return {
    ...preset,
    fontFamily: config.fontFamily || preset.fontFamily,
    fontSize: config.fontSize || preset.fontSize,
    textColor: config.textColor || preset.textColor,
  };
}

export function loadShortsLogoPng(): Buffer | null {
  const path = resolveShortsLogoPath();
  if (!path) return null;
  try {
    const buf = readFileSync(path);
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}

export async function resolveShortsLogoBuffer(showLogo: boolean): Promise<{
  buffer: Buffer | null;
  width: number;
  path: string | null;
}> {
  if (!showLogo) {
    return { buffer: null, width: 0, path: null };
  }
  const path = resolveShortsLogoPath();
  let buffer = loadShortsLogoPng();
  if (!buffer) {
    buffer = await generateFallbackLogoPng();
  }
  const meta = await sharp(buffer).metadata();
  const logoH = Math.min(
    SHORTS_LOGO_MAX_HEIGHT,
    Math.max(28, meta.height ?? SHORTS_LOGO_MAX_HEIGHT),
  );
  const logoW = Math.round(
    ((meta.width ?? logoH) / Math.max(1, meta.height ?? logoH)) * logoH,
  );
  const resized = await sharp(buffer)
    .resize(logoW, logoH, { fit: 'inside' })
    .png()
    .toBuffer();
  return { buffer: resized, width: logoW, path: path ?? '(fallback-generated)' };
}

/**
 * Průhledný PNG 720×1280 — horní pruh + logo (text jde přes ffmpeg drawtext).
 */
export async function renderShortsTopBarPng(
  config: ShortsOverlayConfig,
  logoBuffer: Buffer | null,
): Promise<Buffer> {
  const preset = resolvedPreset(config);
  const barTop = SHORTS_TOP_SAFE_MARGIN;
  const barHeight = SHORTS_OVERLAY_BAR_HEIGHT;
  const barWidth = SHORTS_WIDTH - 32;
  const barLeft = 16;
  const bg = hexToRgba(preset.labelBackground, preset.labelBackgroundOpacity);

  const barSvg = `<svg width="${SHORTS_WIDTH}" height="${SHORTS_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${barLeft}" y="${barTop}" width="${barWidth}" height="${barHeight}" rx="14" ry="14" fill="${bg}" />
</svg>`;

  const barLayer = await sharp(Buffer.from(barSvg)).png().toBuffer();
  const composites: sharp.OverlayOptions[] = [{ input: barLayer, left: 0, top: 0 }];

  if (config.showLogo && logoBuffer) {
    const meta = await sharp(logoBuffer).metadata();
    const logoH = meta.height ?? SHORTS_LOGO_MAX_HEIGHT;
    composites.push({
      input: logoBuffer,
      left: barLeft + 12,
      top: barTop + Math.round((barHeight - logoH) / 2),
    });
  }

  return sharp({
    create: {
      width: SHORTS_WIDTH,
      height: SHORTS_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

export function overlayTextDrawY(): number {
  return SHORTS_TOP_SAFE_MARGIN + Math.round(SHORTS_OVERLAY_BAR_HEIGHT * 0.62);
}

export function overlayTextDrawXExpr(
  alignment: ShortsOverlayAlignment,
  showLogo: boolean,
  logoWidth: number,
): string {
  const pad = 24;
  if (alignment === 'left') {
    return showLogo ? String(pad + logoWidth + 16) : String(pad);
  }
  if (alignment === 'right') {
    return `w-text_w-${pad}`;
  }
  return '(w-text_w)/2';
}

/** ffmpeg fontcolor z #RRGGBB */
export function hexToFfmpegColor(hex: string): string {
  const h = hex.replace('#', '').trim();
  if (h.length === 6) return `0x${h.toUpperCase()}`;
  return 'white';
}
