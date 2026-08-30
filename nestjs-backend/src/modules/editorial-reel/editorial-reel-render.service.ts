import { Injectable, Logger } from '@nestjs/common';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import sharp from 'sharp';
import { resolveFfmpegBinary } from '../../lib/ffmpeg-binary';
import { runFfmpegCapture } from '../../lib/ffmpeg-run';
import type { EditorialReelTemplate } from '@prisma/client';

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;

export type ReelRenderSegment = {
  thumbnailUrl: string;
  title: string;
  channelTitle?: string;
  categoryLabel?: string;
};

export type ReelRenderInput = {
  template: Pick<
    EditorialReelTemplate,
    | 'introSec'
    | 'segmentSec'
    | 'outroSec'
    | 'introText'
    | 'ctaText'
    | 'transition'
    | 'showVideoTitle'
    | 'showChannelTitle'
    | 'showCategory'
  >;
  segments: ReelRenderSegment[];
  musicFilePath?: string | null;
  logoPath?: string | null;
  minSegments?: number;
};

export type ReelRenderResult = {
  outputPath: string;
  tmpRoot: string;
  durationSec: number | null;
  validSegmentCount: number;
  skippedSegmentCount: number;
};

@Injectable()
export class EditorialReelRenderService {
  private readonly log = new Logger(EditorialReelRenderService.name);

  async render(input: ReelRenderInput): Promise<ReelRenderResult> {
    const ffmpeg = resolveFfmpegBinary();
    if (!ffmpeg.path) {
      throw new Error('ffmpeg není dostupný — nelze vytvořit Facebook Reel.');
    }

    const tmpRoot = join(tmpdir(), `editorial-reel-${randomBytes(8).toString('hex')}`);
    await mkdir(tmpRoot, { recursive: true });

    try {
      const introSec = Math.max(1, input.template.introSec);
      const segmentSec = Math.max(2, input.template.segmentSec);
      const outroSec = Math.max(1, input.template.outroSec);
      const slidePaths: string[] = [];
      let idx = 0;

      const introSlide = await this.buildTextSlide(tmpRoot, idx++, {
        title: input.template.introText ?? 'Co je nového ve světě realit',
        subtitle: 'XXREALIT',
        durationSec: introSec,
        logoPath: input.logoPath,
      });
      slidePaths.push(introSlide);

      let skippedSegmentCount = 0;
      const segmentDurations: number[] = [];

      for (const seg of input.segments) {
        try {
          const thumbPath = join(tmpRoot, `thumb-${idx}.jpg`);
          const downloaded = await this.tryDownloadThumbnail(seg.thumbnailUrl, thumbPath);
          if (!downloaded) {
            skippedSegmentCount += 1;
            this.log.warn(`Reel segment skipped — thumbnail unavailable: ${seg.title?.slice(0, 40)}`);
            continue;
          }
          const slidePath = join(tmpRoot, `slide-${idx}.jpg`);
          await this.composeThumbnailSlide(thumbPath, slidePath, {
            title: input.template.showVideoTitle ? seg.title : '',
            channelTitle: input.template.showChannelTitle ? seg.channelTitle : '',
            categoryLabel: input.template.showCategory ? seg.categoryLabel : '',
          });
          slidePaths.push(slidePath);
          segmentDurations.push(segmentSec);
          idx += 1;
        } catch (err) {
          skippedSegmentCount += 1;
          this.log.warn(
            `Reel segment skipped: ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      const minSegments = input.minSegments ?? 2;
      const validSegmentCount = segmentDurations.length;
      if (validSegmentCount < minSegments) {
        throw new Error(
          `NOT_ENOUGH_VALID_SEGMENTS: pouze ${validSegmentCount} z ${input.segments.length} segmentů (minimum ${minSegments})`,
        );
      }

      const outroSlide = await this.buildTextSlide(tmpRoot, idx++, {
        title: input.template.ctaText ?? 'Další videa najdete na XXREALIT.cz',
        subtitle: 'XXREALIT.cz',
        durationSec: outroSec,
        logoPath: input.logoPath,
      });
      slidePaths.push(outroSlide);

      const durations: number[] = [introSec, ...segmentDurations, outroSec];

      const ffconcatPath = await this.writeFfconcat(tmpRoot, slidePaths, durations);
      const silentPath = join(tmpRoot, 'silent.mp4');
      await this.encodeSlideshow(ffmpeg.path, ffconcatPath, silentPath);

      const outputPath = join(tmpRoot, 'reel-final.mp4');
      if (input.musicFilePath) {
        await this.muxMusic(ffmpeg.path, silentPath, input.musicFilePath, outputPath);
      } else {
        const { readFile: rf, writeFile: wf } = await import('node:fs/promises');
        await wf(outputPath, await rf(silentPath));
      }

      const durationSec = durations.reduce((a, b) => a + b, 0);
      return { outputPath, tmpRoot, durationSec, validSegmentCount, skippedSegmentCount };
    } catch (err) {
      await this.safeRm(tmpRoot);
      throw err;
    }
  }

  async cleanup(tmpRoot: string) {
    await this.safeRm(tmpRoot);
  }

  private async safeRm(dir: string) {
    try {
      await rm(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  private async tryDownloadThumbnail(url: string, dest: string): Promise<boolean> {
    const trimmed = url?.trim();
    if (!trimmed) return false;
    try {
      const res = await fetch(trimmed, { redirect: 'follow' });
      if (!res.ok || !res.body) return false;
      const contentType = res.headers.get('content-type') ?? '';
      if (contentType && !contentType.startsWith('image/')) return false;
      await pipeline(res.body as unknown as NodeJS.ReadableStream, createWriteStream(dest));
      const buf = await readFile(dest);
      return buf.length > 512;
    } catch {
      return false;
    }
  }

  private async downloadThumbnail(url: string, dest: string) {
    const ok = await this.tryDownloadThumbnail(url, dest);
    if (!ok) throw new Error(`Stažení thumbnailu selhalo (${url.slice(0, 80)})`);
  }

  private async composeThumbnailSlide(
    thumbPath: string,
    outPath: string,
    overlay: { title?: string; channelTitle?: string; categoryLabel?: string },
  ) {
    const base = await sharp(thumbPath)
      .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 88 })
      .toBuffer();

    const lines: string[] = [];
    if (overlay.title?.trim()) lines.push(this.escapeXml(overlay.title.trim().slice(0, 80)));
    if (overlay.channelTitle?.trim()) lines.push(this.escapeXml(overlay.channelTitle.trim().slice(0, 60)));
    if (overlay.categoryLabel?.trim()) lines.push(this.escapeXml(overlay.categoryLabel.trim().toUpperCase()));

    if (lines.length === 0) {
      await writeFile(outPath, base);
      return;
    }

    const svg = `
      <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgba(0,0,0,0)" />
            <stop offset="55%" stop-color="rgba(0,0,0,0)" />
            <stop offset="100%" stop-color="rgba(0,0,0,0.75)" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#g)" />
        <text x="48" y="${HEIGHT - 180}" fill="white" font-size="42" font-family="Arial, sans-serif" font-weight="700">${lines[0] ?? ''}</text>
        ${lines[1] ? `<text x="48" y="${HEIGHT - 120}" fill="#f97316" font-size="28" font-family="Arial, sans-serif">${lines[1]}</text>` : ''}
        ${lines[2] ? `<text x="48" y="${HEIGHT - 72}" fill="#d4d4d8" font-size="22" font-family="Arial, sans-serif" letter-spacing="2">${lines[2]}</text>` : ''}
      </svg>`;

    await sharp(base)
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .jpeg({ quality: 88 })
      .toFile(outPath);
  }

  private async buildTextSlide(
    tmpRoot: string,
    idx: number,
    input: { title: string; subtitle?: string; durationSec: number; logoPath?: string | null },
  ): Promise<string> {
    const outPath = join(tmpRoot, `text-${idx}.jpg`);
    const title = this.escapeXml(input.title.slice(0, 100));
    const subtitle = input.subtitle ? this.escapeXml(input.subtitle) : '';
    const svg = `
      <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#111827"/>
        <text x="50%" y="45%" text-anchor="middle" fill="white" font-size="52" font-family="Arial, sans-serif" font-weight="700">${title}</text>
        ${subtitle ? `<text x="50%" y="55%" text-anchor="middle" fill="#f97316" font-size="32" font-family="Arial, sans-serif">${subtitle}</text>` : ''}
      </svg>`;
    let pipeline = sharp(Buffer.from(svg)).resize(WIDTH, HEIGHT).jpeg({ quality: 90 });
    if (input.logoPath) {
      try {
        const logo = await sharp(input.logoPath).resize(200, 200, { fit: 'inside' }).png().toBuffer();
        pipeline = sharp(await pipeline.toBuffer()).composite([
          { input: logo, top: 80, left: Math.floor((WIDTH - 200) / 2) },
        ]);
      } catch {
        /* logo optional */
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
      const abs = join(tmpRoot, rel);
      const buf = await readFile(slides[i]!);
      await writeFile(abs, buf);
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
      "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.0015,1.15)':d=125:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30";
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

  private async muxMusic(ffmpegBin: string, videoPath: string, musicPath: string, outPath: string) {
    const args = [
      '-hide_banner',
      '-y',
      '-i',
      videoPath,
      '-i',
      musicPath,
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-shortest',
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      outPath,
    ];
    const { code, stderr } = await runFfmpegCapture(ffmpegBin, args);
    if (code !== 0) {
      throw new Error(`ffmpeg audio mux selhal: ${stderr.slice(-600)}`);
    }
  }
}
