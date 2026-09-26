import { Injectable } from '@nestjs/common';
import sharp from '../../lib/sharp-instance';
import type { AiVisualizationWatermarkPosition } from '@prisma/client';

@Injectable()
export class AiVisualizationWatermarkService {
  async applyPreviewWatermark(
    input: Buffer,
    enabled: boolean,
    position: AiVisualizationWatermarkPosition,
  ): Promise<Buffer> {
    if (!enabled) return input;
    const meta = await sharp(input).metadata();
    const width = meta.width ?? 1024;
    const height = meta.height ?? 1024;
    const fontSize = Math.max(14, Math.round(Math.min(width, height) * 0.035));
    const pad = Math.round(fontSize * 0.6);
    const text = 'XXREALIT AI';
    const textWidth = Math.round(text.length * fontSize * 0.55);
    const textHeight = Math.round(fontSize * 1.4);
    const x =
      position === 'BOTTOM_LEFT' ? pad : Math.max(pad, width - textWidth - pad * 2);
    const y = Math.max(pad, height - textHeight - pad);

    const svg = `<svg width="${width}" height="${height}">
  <rect x="${x}" y="${y}" width="${textWidth + pad}" height="${textHeight}" rx="8" fill="rgba(0,0,0,0.45)"/>
  <text x="${x + pad / 2}" y="${y + textHeight - pad / 2}" font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="700" fill="white">${text}</text>
</svg>`;

    return sharp(input)
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
  }
}
