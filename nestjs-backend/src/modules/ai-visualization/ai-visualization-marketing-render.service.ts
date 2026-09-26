import { Injectable, Logger } from '@nestjs/common';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import sharp, { assertSharpReady } from '../../lib/sharp-instance';
import { resolveFfmpegBinary } from '../../lib/ffmpeg-binary';
import { runFfmpegCapture } from '../../lib/ffmpeg-run';
import { resolveShortsLogoPath } from '../properties/shorts-overlay-assets';
import type { MarketingReelContext } from './ai-visualization-marketing-copy.util';
import { buildReelSlideCopy } from './ai-visualization-marketing-copy.util';

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;

export type MarketingReelRenderInput = {
  beforeBuffer: Buffer;
  afterBuffer: Buffer;
  context: MarketingReelContext;
  musicFilePath?: string | null;
  musicVolumePercent?: number;
};

export type MarketingReelRenderResult = {
  outputPath: string;
  tmpRoot: string;
  durationSec: number;
};

@Injectable()
export class AiVisualizationMarketingRenderService {
  private readonly log = new Logger(AiVisualizationMarketingRenderService.name);

  async render(input: MarketingReelRenderInput): Promise<MarketingReelRenderResult> {
    assertSharpReady('ai-viz-marketing-reel');
    const ffmpeg = resolveFfmpegBinary();
    if (!ffmpeg.path) {
      throw new Error('ffmpeg není dostupný — nelze vytvořit marketingový Reel.');
    }

    const tmpRoot = join(tmpdir(), `ai-viz-reel-${randomBytes(8).toString('hex')}`);
    await mkdir(tmpRoot, { recursive: true });

    try {
      const beforePath = join(tmpRoot, 'before.jpg');
      const afterPath = join(tmpRoot, 'after.jpg');
      await writeFile(beforePath, await this.stripExif(input.beforeBuffer));
      await writeFile(afterPath, await this.stripExif(input.afterBuffer));

      const copy = buildReelSlideCopy(input.context);
      const logoPath = resolveShortsLogoPath();
      const slidePaths: string[] = [];
      const durations: number[] = [];

      slidePaths.push(
        await this.composeImageSlide(beforePath, join(tmpRoot, 's0.jpg'), copy.hook.headline, copy.hook.subline, logoPath),
      );
      durations.push(2);

      for (let i = 0; i < 4; i += 1) {
        const t = (i + 1) / 4;
        slidePaths.push(
          await this.composeWipeSlide(beforePath, afterPath, join(tmpRoot, `wipe-${i}.jpg`), t, copy.transform.headline),
        );
        durations.push(1);
      }

      slidePaths.push(
        await this.composeImageSlide(afterPath, join(tmpRoot, 's-after.jpg'), copy.result.headline, undefined, logoPath),
      );
      durations.push(3);

      slidePaths.push(
        await this.composeImageSlide(afterPath, join(tmpRoot, 's-contractors.jpg'), copy.contractors.headline, undefined, logoPath),
      );
      durations.push(2);

      slidePaths.push(
        await this.buildOutroSlide(tmpRoot, copy.outro.headline, copy.outro.subline, logoPath),
      );
      durations.push(3);

      const ffconcatPath = await this.writeFfconcat(tmpRoot, slidePaths, durations);
      const silentPath = join(tmpRoot, 'silent.mp4');
      await this.encodeSlideshow(ffmpeg.path, ffconcatPath, silentPath);

      const durationSec = durations.reduce((a, b) => a + b, 0);
      const outputPath = join(tmpRoot, 'reel-final.mp4');
      if (input.musicFilePath) {
        await this.muxMusic(
          ffmpeg.path,
          silentPath,
          input.musicFilePath,
          outputPath,
          durationSec,
          input.musicVolumePercent ?? 12,
        );
      } else {
        await writeFile(outputPath, await readFile(silentPath));
      }

      return { outputPath, tmpRoot, durationSec };
    } catch (err) {
      await this.safeRm(tmpRoot);
      throw err;
    }
  }

  async cleanup(tmpRoot: string) {
    await this.safeRm(tmpRoot);
  }

  private async stripExif(buffer: Buffer): Promise<Buffer> {
    return sharp(buffer).rotate().jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  }

  private async composeImageSlide(
    imagePath: string,
    outPath: string,
    headline: string,
    subline: string | undefined,
    logoPath: string | null,
  ): Promise<string> {
    const base = await this.composeBlurredContain(imagePath);
    const withText = await this.overlayText(base, headline, subline);
    if (logoPath) {
      try {
        const logo = await sharp(logoPath).resize(160, 48, { fit: 'inside' }).png().toBuffer();
        const buf = await sharp(withText)
          .composite([{ input: logo, top: 48, left: WIDTH - 180 }])
          .jpeg({ quality: 88 })
          .toBuffer();
        await writeFile(outPath, buf);
        return outPath;
      } catch {
        /* optional logo */
      }
    }
    await writeFile(outPath, withText);
    return outPath;
  }

  private async composeWipeSlide(
    beforePath: string,
    afterPath: string,
    outPath: string,
    progress: number,
    headline: string,
  ): Promise<string> {
    const before = await this.composeBlurredContain(beforePath);
    const after = await this.composeBlurredContain(afterPath);
    const splitX = Math.round(WIDTH * progress);
    const beforeCrop = await sharp(before).extract({ left: 0, top: 0, width: Math.max(1, splitX), height: HEIGHT }).toBuffer();
    const afterCrop = await sharp(after)
      .extract({ left: Math.max(0, splitX), top: 0, width: Math.max(1, WIDTH - splitX), height: HEIGHT })
      .toBuffer();
    const afterMeta = await sharp(afterCrop).metadata();
    const beforeMeta = await sharp(beforeCrop).metadata();
    const composed = await sharp(before)
      .composite([
        { input: beforeCrop, left: 0, top: 0 },
        {
          input: afterCrop,
          left: splitX,
          top: 0,
        },
      ])
      .jpeg({ quality: 88 })
      .toBuffer();
    void beforeMeta;
    void afterMeta;
    const withText = await this.overlayText(composed, headline, 'PŘED ↔ PO REKONSTRUKCI');
    await writeFile(outPath, withText);
    return outPath;
  }

  private async composeBlurredContain(imagePath: string): Promise<Buffer> {
    const bg = await sharp(imagePath).resize(WIDTH, HEIGHT, { fit: 'cover', position: 'centre' }).blur(28).toBuffer();
    const fg = await sharp(imagePath).resize(WIDTH, HEIGHT, { fit: 'inside' }).toBuffer();
    const meta = await sharp(fg).metadata();
    const w = meta.width ?? WIDTH;
    const h = meta.height ?? HEIGHT;
    const left = Math.max(0, Math.floor((WIDTH - w) / 2));
    const top = Math.max(0, Math.floor((HEIGHT - h) / 2));
    return sharp(bg).composite([{ input: fg, left, top }]).jpeg({ quality: 88 }).toBuffer();
  }

  private async overlayText(base: Buffer, headline: string, subline?: string): Promise<Buffer> {
    const lines = headline.split('\n').slice(0, 3).map((l) => this.escapeXml(l.trim())).filter(Boolean);
    const sub = subline ? this.escapeXml(subline.trim().slice(0, 80)) : '';
    const svgLines = lines
      .map(
        (line, i) =>
          `<text x="50%" y="${HEIGHT - 220 + i * 52}" text-anchor="middle" fill="white" font-size="40" font-family="Arial, sans-serif" font-weight="700" stroke="#000" stroke-width="2" paint-order="stroke">${line}</text>`,
      )
      .join('');
    const svg = `
      <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="${HEIGHT - 320}" width="100%" height="320" fill="rgba(0,0,0,0.35)"/>
        ${svgLines}
        ${sub ? `<text x="50%" y="${HEIGHT - 80}" text-anchor="middle" fill="#f97316" font-size="28" font-family="Arial, sans-serif">${sub}</text>` : ''}
      </svg>`;
    return sharp(base)
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .jpeg({ quality: 88 })
      .toBuffer();
  }

  private async buildOutroSlide(
    tmpRoot: string,
    title: string,
    subtitle: string | undefined,
    logoPath: string | null,
  ): Promise<string> {
    const outPath = join(tmpRoot, 'outro.jpg');
    const svg = `
      <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#111827"/>
        <text x="50%" y="42%" text-anchor="middle" fill="white" font-size="48" font-family="Arial, sans-serif" font-weight="700">${this.escapeXml(title)}</text>
        <text x="50%" y="50%" text-anchor="middle" fill="#f97316" font-size="30" font-family="Arial, sans-serif">${subtitle ? this.escapeXml(subtitle) : 'XXREALIT.cz'}</text>
        <text x="50%" y="58%" text-anchor="middle" fill="#e5e7eb" font-size="24" font-family="Arial, sans-serif">📸 Nahrajte fotku · ✨ AI vizualizace · 💰 Rozpočet · 🏗️ Firmy</text>
      </svg>`;
    let pipeline = sharp(Buffer.from(svg)).jpeg({ quality: 90 });
    if (logoPath) {
      try {
        const logo = await sharp(logoPath).resize(200, 60, { fit: 'inside' }).png().toBuffer();
        pipeline = sharp(await pipeline.toBuffer()).composite([
          { input: logo, top: 120, left: Math.floor((WIDTH - 200) / 2) },
        ]);
      } catch {
        /* ignore */
      }
    }
    await pipeline.toFile(outPath);
    return outPath;
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private async writeFfconcat(tmpRoot: string, slides: string[], durations: number[]) {
    const listPath = join(tmpRoot, 'ffconcat.txt');
    const lines = ['ffconcat version 1.0'];
    for (let i = 0; i < slides.length; i += 1) {
      const rel = `slide_${String(i).padStart(4, '0')}.jpg`;
      await writeFile(join(tmpRoot, rel), await readFile(slides[i]!));
      lines.push(`file '${rel}'`);
      lines.push(`duration ${durations[i]!.toFixed(3)}`);
    }
    if (slides.length > 0) {
      lines.push(`file 'slide_${String(slides.length - 1).padStart(4, '0')}.jpg'`);
    }
    await writeFile(listPath, `${lines.join('\n')}\n`, 'utf8');
    return listPath;
  }

  private async encodeSlideshow(ffmpegBin: string, ffconcatPath: string, outPath: string) {
    const zoomFilter =
      "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.0012,1.12)':d=125:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30";
    const args = [
      '-hide_banner',
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      ffconcatPath,
      '-vf',
      zoomFilter,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-r',
      String(FPS),
      '-an',
      outPath,
    ];
    const { code, stderr } = await runFfmpegCapture(ffmpegBin, args);
    if (code !== 0) {
      throw new Error(`ffmpeg slideshow selhal: ${stderr.slice(-600)}`);
    }
  }

  private async muxMusic(
    ffmpegBin: string,
    videoPath: string,
    musicPath: string,
    outPath: string,
    videoDurationSec: number,
    volumePercent: number,
  ) {
    const vol = Math.max(0.01, Math.min(1, volumePercent / 100));
    const fadeOutStart = Math.max(0, videoDurationSec - 1);
    const audioFilter = `[1:a]volume=${vol.toFixed(2)},afade=t=in:st=0:d=0.5,afade=t=out:st=${fadeOutStart.toFixed(2)}:d=1[a]`;
    const args = [
      '-hide_banner',
      '-y',
      '-i',
      videoPath,
      '-stream_loop',
      '-1',
      '-i',
      musicPath,
      '-filter_complex',
      audioFilter,
      '-map',
      '0:v:0',
      '-map',
      '[a]',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-shortest',
      outPath,
    ];
    const { code, stderr } = await runFfmpegCapture(ffmpegBin, args);
    if (code !== 0) {
      throw new Error(`ffmpeg audio mux selhal: ${stderr.slice(-600)}`);
    }
  }

  private async safeRm(dir: string) {
    try {
      await rm(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
