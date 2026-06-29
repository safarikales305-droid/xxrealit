import { existsSync, readFileSync } from 'node:fs';
import sharp, { assertSharpReady, type OverlayOptions } from '../../lib/sharp-instance';
import {
  generateFallbackLogoPng,
  resolveShortsLogoPath,
  resolveShortsOverlayFontPath,
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
export const SHORTS_OVERLAY_STRIP_HEIGHT = 160;
export const SHORTS_LOGO_MAX_HEIGHT = 52;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '').trim();
  if (h.length !== 6) return `rgba(15,23,42,${alpha})`;
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function textAnchor(alignment: ShortsOverlayAlignment): string {
  if (alignment === 'left') return 'start';
  if (alignment === 'right') return 'end';
  return 'middle';
}

function textX(alignment: ShortsOverlayAlignment, logoWidth: number): number {
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

/** Vloží TTF/OTF do SVG jako base64 — české znaky bez ffmpeg drawtext. */
function embedFontFaceCss(): { css: string; fontFamily: string } {
  const fontPath = resolveShortsOverlayFontPath();
  if (fontPath && existsSync(fontPath)) {
    try {
      const b64 = readFileSync(fontPath).toString('base64');
      const isOtf = fontPath.toLowerCase().endsWith('.otf');
      const mime = isOtf ? 'font/otf' : 'font/ttf';
      const format = isOtf ? 'opentype' : 'truetype';
      return {
        css: `@font-face{font-family:'ShortsOverlayFont';src:url('data:${mime};base64,${b64}') format('${format}');}`,
        fontFamily: 'ShortsOverlayFont',
      };
    } catch {
      /* fallback */
    }
  }
  return { css: '', fontFamily: 'Arial, Helvetica, sans-serif' };
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
  assertSharpReady('shorts logo resize');
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
 * Transparentní PNG 720×160 — horní lišta, logo i text (bez ffmpeg drawtext).
 */
export async function renderShortsTopOverlayPng(
  config: ShortsOverlayConfig,
  logoBuffer: Buffer | null,
  logoWidth: number,
): Promise<Buffer> {
  assertSharpReady('shorts overlay PNG');
  const preset = resolvedPreset(config);
  const barTop = SHORTS_TOP_SAFE_MARGIN;
  const barHeight = SHORTS_OVERLAY_BAR_HEIGHT;
  const barWidth = SHORTS_WIDTH - 32;
  const barLeft = 16;
  const bg = hexToRgba(preset.labelBackground, preset.labelBackgroundOpacity);
  const shadow = `rgba(0,0,0,${preset.shadowOpacity})`;
  const stroke =
    preset.outlineWidth > 0
      ? `stroke="${escapeXml(preset.outlineColor)}" stroke-width="${preset.outlineWidth}"`
      : '';
  const { css: fontCss, fontFamily } = embedFontFaceCss();
  const fontSize = Math.max(24, Math.min(72, config.fontSize || preset.fontSize));
  const textColor = config.textColor || preset.textColor;
  const tx = textX(config.alignment, config.showLogo ? logoWidth : 0);
  const ty = barTop + Math.round(barHeight * 0.62);

  const textSvg = config.showOverlayText
    ? `<text x="${tx}" y="${ty}" font-family="${escapeXml(fontFamily)}" font-size="${fontSize}" font-weight="${preset.fontWeight}" fill="${escapeXml(textColor)}" fill-opacity="${preset.textOpacity}" text-anchor="${textAnchor(config.alignment)}" ${stroke} style="filter: drop-shadow(2px 2px 3px ${shadow})">${escapeXml(config.text)}</text>`
    : '';

  const barRect =
    config.showLogo || config.showOverlayText
      ? `<rect x="${barLeft}" y="${barTop}" width="${barWidth}" height="${barHeight}" rx="14" ry="14" fill="${bg}" />`
      : '';

  const svg = `<svg width="${SHORTS_WIDTH}" height="${SHORTS_OVERLAY_STRIP_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs><style>${fontCss}</style></defs>
  ${barRect}
  ${textSvg}
</svg>`;

  const base = await sharp(Buffer.from(svg)).png().toBuffer();
  const composites: OverlayOptions[] = [{ input: base, left: 0, top: 0 }];

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
      height: SHORTS_OVERLAY_STRIP_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}
