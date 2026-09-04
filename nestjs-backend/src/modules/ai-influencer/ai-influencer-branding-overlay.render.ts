import { existsSync, readFileSync } from 'node:fs';
import sharp, { assertSharpReady, type OverlayOptions } from '../../lib/sharp-instance';
import {
  loadShortsPortalLogo,
  resolveShortsOverlayFontPath,
} from '../properties/shorts-overlay-assets';
import {
  REEL_CANVAS_HEIGHT,
  REEL_CANVAS_WIDTH,
  type AiInfluencerRenderSettings,
} from './ai-influencer-render.types';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function embedFontFaceCss(): { css: string; fontFamily: string } {
  const fontPath = resolveShortsOverlayFontPath();
  if (fontPath && existsSync(fontPath)) {
    try {
      const b64 = readFileSync(fontPath).toString('base64');
      const isOtf = fontPath.toLowerCase().endsWith('.otf');
      const mime = isOtf ? 'font/otf' : 'font/ttf';
      const format = isOtf ? 'opentype' : 'truetype';
      return {
        css: `@font-face{font-family:'AiInfluencerBrandFont';src:url('data:${mime};base64,${b64}') format('${format}');}`,
        fontFamily: 'AiInfluencerBrandFont',
      };
    } catch {
      /* fallback */
    }
  }
  return { css: '', fontFamily: 'Arial, Helvetica, sans-serif' };
}

async function logoWithOpacity(buffer: Buffer, opacity: number): Promise<Buffer> {
  const alpha = Math.max(0, Math.min(1, opacity));
  return sharp(buffer)
    .ensureAlpha()
    .linear([1, 1, 1, alpha], [0, 0, 0, 0])
    .png()
    .toBuffer();
}

/**
 * Transparentní PNG 1080×1920 — logo + web watermark (bez ffmpeg drawtext).
 */
export async function renderAiInfluencerBrandingOverlayPng(
  settings: AiInfluencerRenderSettings,
  logoFilePath: string | null,
): Promise<Buffer> {
  assertSharpReady('ai-influencer branding overlay');
  const composites: OverlayOptions[] = [];
  const branding = settings.branding;
  const watermark = settings.watermark;

  if (branding.logoEnabled) {
    const logoBuffer =
      logoFilePath && existsSync(logoFilePath)
        ? await readFileSync(logoFilePath)
        : (await loadShortsPortalLogo()).buffer;
    const logoSize = branding.logoSize;
    const resized = await sharp(logoBuffer)
      .resize(logoSize, logoSize, { fit: 'inside', withoutEnlargement: false })
      .png()
      .toBuffer();
    const opaqueLogo = await logoWithOpacity(resized, branding.logoOpacity);
    composites.push({
      input: opaqueLogo,
      left: Math.round(branding.logoX),
      top: Math.round(branding.logoY),
    });
  }

  if (watermark.enabled && watermark.text.trim()) {
    const { css, fontFamily } = embedFontFaceCss();
    const fontSize = watermark.fontSize;
    const alpha = watermark.opacity;
    const y = watermark.y;
    const textSvg = `<text x="${Math.round(REEL_CANVAS_WIDTH / 2)}" y="${y}" font-family="${escapeXml(fontFamily)}" font-size="${fontSize}" font-weight="bold" fill="white" fill-opacity="${alpha}" text-anchor="middle" style="filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.45))">${escapeXml(watermark.text.trim())}</text>`;
    const svg = `<svg width="${REEL_CANVAS_WIDTH}" height="${REEL_CANVAS_HEIGHT}" xmlns="http://www.w3.org/2000/svg"><defs><style>${css}</style></defs>${textSvg}</svg>`;
    const textLayer = await sharp(Buffer.from(svg)).png().toBuffer();
    composites.push({ input: textLayer, left: 0, top: 0 });
  }

  return sharp({
    create: {
      width: REEL_CANVAS_WIDTH,
      height: REEL_CANVAS_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}
