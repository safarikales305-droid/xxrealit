import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import {
  ListingWatermarkSettingsService,
  type ListingWatermarkPosition,
} from './listing-watermark-settings.service';

@Injectable()
export class ListingPhotoWatermarkService {
  private readonly log = new Logger(ListingPhotoWatermarkService.name);
  private logoPngBuffer: Buffer | null = null;
  private logoLoadAttempted = false;

  constructor(
    private readonly watermarkSettings: ListingWatermarkSettingsService,
  ) {}

  private watermarkLogoCandidates(): string[] {
    const envPath = process.env.WATERMARK_LOGO_PATH?.trim();
    const cwd = process.cwd();
    return [
      ...(envPath ? [resolve(envPath)] : []),
      join(cwd, 'public', 'logo-watermark.png'),
      join(cwd, '..', 'zdroj', 'public', 'logo-watermark.png'),
      join(cwd, '..', 'zdroj', 'public', 'logo.png'),
    ];
  }

  private loadLogoOnce(): Buffer | null {
    if (this.logoLoadAttempted) return this.logoPngBuffer;
    this.logoLoadAttempted = true;
    for (const p of this.watermarkLogoCandidates()) {
      if (!p || !fs.existsSync(p)) continue;
      try {
        const buf = fs.readFileSync(p);
        if (buf.length > 0) {
          this.logoPngBuffer = buf;
          this.log.log(`[listing-watermark] logo loaded from ${p}`);
          return buf;
        }
      } catch {
        /* try next candidate */
      }
    }
    this.log.warn(
      '[listing-watermark] Logo file not found, watermark generation disabled.',
    );
    return null;
  }

  private gravityFromPosition(
    p: ListingWatermarkPosition,
  ): sharp.Gravity {
    if (p === 'right-top') return 'northeast';
    if (p === 'left-bottom') return 'southwest';
    if (p === 'right-bottom') return 'southeast';
    return 'northwest';
  }

  async applyWatermark(
    originalBuffer: Buffer,
  ): Promise<Buffer | null> {
    const settings = await this.watermarkSettings.getSettings();
    if (!settings.enabled) return null;
    const logoRaw = this.loadLogoOnce();
    if (!logoRaw || !originalBuffer.length) return null;

    try {
      const base = sharp(originalBuffer, { failOn: 'none' });
      const meta = await base.metadata();
      const baseWidth = Math.max(1, Math.trunc(meta.width ?? 0));
      const baseHeight = Math.max(1, Math.trunc(meta.height ?? 0));
      if (baseWidth <= 1 || baseHeight <= 1) return null;

      const logoWidth = Math.max(
        36,
        Math.trunc(baseWidth * settings.logoWidthRatio),
      );
      const margin = Math.min(
        Math.max(0, settings.marginPx),
        Math.trunc(Math.min(baseWidth, baseHeight) / 3),
      );

      const logoPngRaw = await sharp(logoRaw, { failOn: 'none' })
        .resize({ width: logoWidth, withoutEnlargement: true })
        .ensureAlpha(settings.opacity)
        .png()
        .toBuffer();
      const logoPng = await sharp(logoPngRaw)
        .extend({
          top: margin,
          right: margin,
          bottom: margin,
          left: margin,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();

      const output = await base
        .composite([
          {
            input: logoPng,
            gravity: this.gravityFromPosition(settings.position),
            blend: 'over',
          },
        ])
        .jpeg({ quality: 86, mozjpeg: true })
        .toBuffer();

      return output.length > 0 ? output : null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`[listing-watermark] apply failed: ${msg}`);
      return null;
    }
  }
}
