import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import {
  SHORTS_OVERLAY_STYLE_PRESETS,
  type ShortsOverlayConfig,
  type ShortsOverlayStylePreset,
} from './shorts-overlay.types';

export const SHORTS_WIDTH = 720;
export const SHORTS_HEIGHT = 1280;
export const SHORTS_TOP_SAFE_MARGIN = 48;
export const SHORTS_OVERLAY_BAR_HEIGHT = 108;
export const SHORTS_LOGO_MAX_HEIGHT = 52;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function shortsLogoCandidates(): string[] {
  const envPath = process.env.WATERMARK_LOGO_PATH?.trim();
  const cwd = process.cwd();
  return [
    ...(envPath ? [resolve(envPath)] : []),
    join(cwd, 'public', 'logo-watermark.png'),
    join(cwd, '..', 'zdroj', 'public', 'logo-watermark.png'),
    join(cwd, '..', 'zdroj', 'public', 'logo.png'),
    join(cwd, 'assets', 'logo.png'),
  ];
}

export function loadShortsLogoPng(): Buffer | null {
  for (const p of shortsLogoCandidates()) {
    if (!p || !existsSync(p)) continue;
    try {
      const buf = readFileSync(p);
      if (buf.length > 0) return buf;
    } catch {
      /* next */
    }
  }
  return null;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '').trim();
  if (h.length !== 6) return `rgba(15,23,42,${alpha})`;
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function textAnchor(alignment: ShortsOverlayConfig['alignment']): string {
  if (alignment === 'left') return 'start';
  if (alignment === 'right') return 'end';
  return 'middle';
}

function textX(alignment: ShortsOverlayConfig['alignment'], logoWidth: number): number {
  const pad = 24;
  if (alignment === 'left') return pad + logoWidth + 16;
  if (alignment === 'right') return SHORTS_WIDTH - pad;
  return Math.round(SHORTS_WIDTH / 2);
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

/** Vygeneruje průhledný PNG pruh (logo + text) pro horní overlay 9:16 videa. */
export async function renderShortsTopOverlayPng(
  config: ShortsOverlayConfig,
  logoBuffer: Buffer | null,
): Promise<Buffer> {
  const preset = resolvedPreset(config);
  const barTop = SHORTS_TOP_SAFE_MARGIN;
  const barHeight = SHORTS_OVERLAY_BAR_HEIGHT;
  const barWidth = SHORTS_WIDTH - 32;
  const barLeft = 16;

  let logoWidth = 0;
  let logoLayer: sharp.OverlayOptions | null = null;
  if (config.showLogo && logoBuffer) {
    const logoMeta = await sharp(logoBuffer).metadata();
    const logoH = Math.min(
      SHORTS_LOGO_MAX_HEIGHT,
      Math.max(28, logoMeta.height ?? SHORTS_LOGO_MAX_HEIGHT),
    );
    const logoW = Math.round(
      ((logoMeta.width ?? logoH) / Math.max(1, logoMeta.height ?? logoH)) * logoH,
    );
    logoWidth = logoW;
    const logoResized = await sharp(logoBuffer)
      .resize(logoW, logoH, { fit: 'inside' })
      .png()
      .toBuffer();
    logoLayer = {
      input: logoResized,
      left: barLeft + 12,
      top: barTop + Math.round((barHeight - logoH) / 2),
    };
  }

  const bg = hexToRgba(preset.labelBackground, preset.labelBackgroundOpacity);
  const shadow = `rgba(0,0,0,${preset.shadowOpacity})`;
  const stroke =
    preset.outlineWidth > 0
      ? `stroke="${escapeXml(preset.outlineColor)}" stroke-width="${preset.outlineWidth}"`
      : '';
  const tx = textX(config.alignment, config.showLogo ? logoWidth : 0);
  const ty = barTop + Math.round(barHeight * 0.62);
  const textSvg = config.showOverlayText
    ? `<text x="${tx}" y="${ty}" font-family="${escapeXml(preset.fontFamily)}" font-size="${preset.fontSize}" font-weight="${preset.fontWeight}" fill="${escapeXml(preset.textColor)}" fill-opacity="${preset.textOpacity}" text-anchor="${textAnchor(config.alignment)}" ${stroke} style="filter: drop-shadow(2px 2px 3px ${shadow})">${escapeXml(config.text)}</text>`
    : '';

  const svg = `
<svg width="${SHORTS_WIDTH}" height="${SHORTS_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${barLeft}" y="${barTop}" width="${barWidth}" height="${barHeight}" rx="14" ry="14" fill="${bg}" />
  ${textSvg}
</svg>`;

  const textBar = await sharp(Buffer.from(svg)).png().toBuffer();
  const composites: sharp.OverlayOptions[] = [{ input: textBar, left: 0, top: 0 }];
  if (logoLayer) composites.push(logoLayer);

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
