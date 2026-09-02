import { Injectable, Logger } from '@nestjs/common';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import sharp, { assertSharpReady } from '../../lib/sharp-instance';
import { resolveFfmpegBinary } from '../../lib/ffmpeg-binary';
import {
  parseDurationSecondsFromFfmpegStderr,
  runFfmpegCapture,
} from '../../lib/ffmpeg-run';
import type { ReelScenePlan } from './ai-influencer.types';

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;

export type AiInfluencerRenderInput = {
  avatarVideoPath: string;
  voiceAudioPath: string;
  scenes: ReelScenePlan[];
  hookText: string;
  musicFilePath?: string | null;
  logoPath?: string | null;
};

export type AiInfluencerRenderResult = {
  outputPath: string;
  tmpRoot: string;
  durationSec: number | null;
};

@Injectable()
export class AiInfluencerRenderService {
  private readonly log = new Logger(AiInfluencerRenderService.name);

  async render(input: AiInfluencerRenderInput): Promise<AiInfluencerRenderResult> {
    assertSharpReady('ai-influencer-render');
    const ffmpeg = resolveFfmpegBinary();
    if (!ffmpeg.path) {
      throw new Error('ffmpeg není dostupný — nelze vytvořit AI Influencer Reel.');
    }

    const tmpRoot = join(tmpdir(), `ai-influencer-reel-${randomBytes(8).toString('hex')}`);
    await mkdir(tmpRoot, { recursive: true });

    try {
      const durationSec = await this.probeDuration(ffmpeg.path, input.voiceAudioPath);
      const targetDuration = Math.max(8, durationSec ?? 30);
      const srtPath = join(tmpRoot, 'captions.srt');
      await writeFile(srtPath, this.buildSrt(input.scenes, targetDuration, input.hookText));

      const scaledAvatar = join(tmpRoot, 'avatar-scaled.mp4');
      await this.runFfmpeg(ffmpeg.path, [
        '-y',
        '-i',
        input.avatarVideoPath,
        '-vf',
        `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`,
        '-an',
        '-r',
        String(FPS),
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        scaledAvatar,
      ]);

      const loopedAvatar = join(tmpRoot, 'avatar-looped.mp4');
      await this.runFfmpeg(ffmpeg.path, [
        '-y',
        '-stream_loop',
        '-1',
        '-i',
        scaledAvatar,
        '-t',
        String(targetDuration),
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        loopedAvatar,
      ]);

      const slidePaths: string[] = [];
      for (let i = 0; i < input.scenes.length; i++) {
        const scene = input.scenes[i];
        if (scene.type === 'IMAGE_FULL' || scene.type === 'BROLL_FULL') {
          const slide = await this.buildSceneSlide(tmpRoot, i, scene, input.logoPath);
          if (slide) slidePaths.push(slide);
        }
      }

      let videoPath = loopedAvatar;
      if (slidePaths.length > 0) {
        const overlayPath = join(tmpRoot, 'with-broll.mp4');
        const firstSlide = slidePaths[0];
        await this.runFfmpeg(ffmpeg.path, [
          '-y',
          '-i',
          loopedAvatar,
          '-loop',
          '1',
          '-i',
          firstSlide,
          '-filter_complex',
          `[0:v][1:v]overlay=0:0:enable='between(t,4,${Math.min(targetDuration - 4, 14)})'[v]`,
          '-map',
          '[v]',
          '-t',
          String(targetDuration),
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          overlayPath,
        ]);
        videoPath = overlayPath;
      }

      const withSubs = join(tmpRoot, 'with-subs.mp4');
      await this.runFfmpeg(ffmpeg.path, [
        '-y',
        '-i',
        videoPath,
        '-vf',
        `subtitles='${srtPath.replace(/\\/g, '/').replace(/:/g, '\\:')}'`,
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        withSubs,
      ]);

      const outputPath = join(tmpRoot, 'final.mp4');
      const audioInputs = ['-i', input.voiceAudioPath];
      const filter: string[] = [];
      if (input.musicFilePath) {
        audioInputs.push('-i', input.musicFilePath);
        filter.push('[0:a]volume=1[voice]');
        filter.push('[1:a]volume=0.1[music]');
        filter.push('[voice][music]amix=inputs=2:duration=first:dropout_transition=2[aout]');
      }

      const args = [
        '-y',
        '-i',
        withSubs,
        ...audioInputs,
        '-t',
        String(targetDuration),
        '-map',
        '0:v:0',
      ];

      if (filter.length) {
        args.push('-filter_complex', filter.join(';'), '-map', '[aout]');
      } else {
        args.push('-map', '1:a:0');
      }

      args.push(
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        '23',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart',
        '-pix_fmt',
        'yuv420p',
        outputPath,
      );

      await this.runFfmpeg(ffmpeg.path, args);

      return { outputPath, tmpRoot, durationSec: targetDuration };
    } catch (err) {
      await rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
      throw err;
    }
  }

  async cleanup(tmpRoot: string): Promise<void> {
    await rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
  }

  async downloadToFile(url: string, destPath: string): Promise<void> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Stažení souboru selhalo (HTTP ${res.status}).`);
    await mkdir(dirname(destPath), { recursive: true });
    const fileStream = createWriteStream(destPath);
    if (!res.body) throw new Error('Prázdná odpověď při stahování.');
    await pipeline(res.body as unknown as NodeJS.ReadableStream, fileStream);
  }

  private async probeDuration(ffmpegPath: string, audioPath: string): Promise<number | null> {
    const { code, stderr } = await runFfmpegCapture(ffmpegPath, ['-i', audioPath]);
    if (code === 0 || stderr.includes('Duration:')) {
      return parseDurationSecondsFromFfmpegStderr(stderr);
    }
    return null;
  }

  private async runFfmpeg(ffmpegPath: string, args: string[]): Promise<void> {
    const { code, stderr } = await runFfmpegCapture(ffmpegPath, args);
    if (code !== 0) {
      this.log.warn(`ffmpeg failed: ${stderr.slice(-500)}`);
      throw new Error(`ffmpeg selhalo: ${stderr.split('\n').slice(-3).join(' ')}`);
    }
  }

  private buildSrt(scenes: ReelScenePlan[], totalSec: number, hookText: string): string {
    const lines: string[] = [];
    const usable = scenes.length
      ? scenes
      : [{ start: 0, duration: totalSec, type: 'AVATAR_FULL' as const, text: hookText }];
    let idx = 1;
    for (const scene of usable) {
      const text = (scene.headline || scene.text || hookText || '').trim();
      if (!text) continue;
      const start = scene.start ?? 0;
      const end = Math.min(totalSec, start + (scene.duration ?? 4));
      lines.push(String(idx));
      lines.push(`${this.toSrtTime(start)} --> ${this.toSrtTime(end)}`);
      lines.push(text.slice(0, 120));
      lines.push('');
      idx += 1;
    }
    return lines.join('\n');
  }

  private toSrtTime(sec: number): string {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.round((sec % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  }

  private async buildSceneSlide(
    tmpRoot: string,
    idx: number,
    scene: ReelScenePlan,
    logoPath?: string | null,
  ): Promise<string | null> {
    const outPath = join(tmpRoot, `scene-${idx}.jpg`);
    const headline = this.escapeXml((scene.headline || scene.text || '').slice(0, 100));
    let base: Buffer;
    if (scene.mediaUrl) {
      try {
        const res = await fetch(scene.mediaUrl);
        if (!res.ok) throw new Error('fetch failed');
        base = await sharp(Buffer.from(await res.arrayBuffer()))
          .resize(WIDTH, HEIGHT, { fit: 'cover' })
          .jpeg({ quality: 88 })
          .toBuffer();
      } catch {
        base = await this.solidSlide(headline);
      }
    } else {
      base = await this.solidSlide(headline);
    }

    const svg = `
      <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.35)" />
        <text x="50%" y="82%" text-anchor="middle" fill="white" font-size="42" font-family="Arial, sans-serif" font-weight="700">${headline}</text>
      </svg>`;
    let pipeline = sharp(base).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]);
    if (logoPath) {
      try {
        const logo = await sharp(logoPath).resize(120, 120, { fit: 'inside' }).png().toBuffer();
        pipeline = sharp(await pipeline.jpeg({ quality: 88 }).toBuffer()).composite([
          { input: logo, top: 40, left: 40 },
        ]);
      } catch {
        /* optional */
      }
    }
    await pipeline.jpeg({ quality: 88 }).toFile(outPath);
    return outPath;
  }

  private async solidSlide(headline: string): Promise<Buffer> {
    const svg = `
      <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#111827"/>
        <text x="50%" y="50%" text-anchor="middle" fill="white" font-size="48" font-family="Arial, sans-serif" font-weight="700">${headline || 'XXREALIT'}</text>
      </svg>`;
    return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
