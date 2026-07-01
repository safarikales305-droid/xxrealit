import { Injectable, Logger } from '@nestjs/common';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { resolveFfmpegBinary } from '../../../lib/ffmpeg-binary';
import {
  parseDurationSecondsFromFfmpegStderr,
  runFfmpegCapture,
} from '../../../lib/ffmpeg-run';

const REEL_WIDTH = 1080;
const REEL_HEIGHT = 1920;
const REEL_FPS = 30;

export type ReelComposeResult = {
  outputPath: string;
  durationSec: number | null;
  tmpRoot: string;
};

@Injectable()
export class ReelVideoComposerService {
  private readonly log = new Logger(ReelVideoComposerService.name);

  async downloadToFile(url: string, destPath: string): Promise<void> {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok || !res.body) {
      throw new Error(`Stažení videa selhalo (HTTP ${res.status}).`);
    }
    const contentLength = Number(res.headers.get('content-length') ?? 0);
    if (contentLength > 400 * 1024 * 1024) {
      throw new Error('Video je příliš velké pro zpracování.');
    }
    await pipeline(res.body as unknown as NodeJS.ReadableStream, createWriteStream(destPath));
  }

  async composeIntroAndListing(
    introUrl: string,
    listingLocalPath: string,
  ): Promise<ReelComposeResult> {
    const ffmpeg = resolveFfmpegBinary();
    if (!ffmpeg.path) {
      throw new Error('ffmpeg není dostupný — nelze spojit úvodní video s Reel inzerátu.');
    }

    const tmpRoot = join(tmpdir(), `reel-compose-${randomBytes(8).toString('hex')}`);
    await mkdir(tmpRoot, { recursive: true });
    const introPath = join(tmpRoot, 'intro-source.mp4');
    const introNorm = join(tmpRoot, 'intro-norm.mp4');
    const listingNorm = join(tmpRoot, 'listing-norm.mp4');
    const outputPath = join(tmpRoot, 'composed-reel.mp4');

    try {
      await this.downloadToFile(introUrl, introPath);
      await this.normalizeSegment(ffmpeg.path, introPath, introNorm);
      await this.normalizeSegment(ffmpeg.path, listingLocalPath, listingNorm);
      await this.concatNormalized(ffmpeg.path, introNorm, listingNorm, outputPath);

      if (!(await this.isValidFile(outputPath))) {
        throw new Error('Výsledné spojené video je neplatné.');
      }

      const durationSec = await this.probeDuration(ffmpeg.path, outputPath);
      this.log.log(
        `Reel složen: intro + ukázka inzerátu, délka=${durationSec ?? '—'}s, soubor=${outputPath}`,
      );
      return { outputPath, durationSec, tmpRoot };
    } catch (err) {
      await rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
      throw err;
    }
  }

  async readOutputBuffer(result: ReelComposeResult): Promise<Buffer> {
    return readFile(result.outputPath);
  }

  async cleanup(result: ReelComposeResult): Promise<void> {
    await rm(result.tmpRoot, { recursive: true, force: true }).catch(() => undefined);
  }

  private async normalizeSegment(
    ffmpegPath: string,
    inputPath: string,
    outputPath: string,
  ): Promise<void> {
    const filter = [
      `[0:v]scale=${REEL_WIDTH}:${REEL_HEIGHT}:force_original_aspect_ratio=decrease,`,
      `pad=${REEL_WIDTH}:${REEL_HEIGHT}:(ow-iw)/2:(oh-ih)/2,`,
      `setsar=1,fps=${REEL_FPS},format=yuv420p[v]`,
      `[0:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a]`,
    ].join('');

    const withAudioArgs = [
      '-hide_banner',
      '-y',
      '-loglevel',
      'error',
      '-i',
      inputPath,
      '-filter_complex',
      filter,
      '-map',
      '[v]',
      '-map',
      '[a]',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      outputPath,
    ];

    let { code, stderr } = await runFfmpegCapture(ffmpegPath, withAudioArgs);
    if (code === 0 && (await this.isValidFile(outputPath))) return;

    const silentFilter = [
      `[0:v]scale=${REEL_WIDTH}:${REEL_HEIGHT}:force_original_aspect_ratio=decrease,`,
      `pad=${REEL_WIDTH}:${REEL_HEIGHT}:(ow-iw)/2:(oh-ih)/2,`,
      `setsar=1,fps=${REEL_FPS},format=yuv420p[v]`,
    ].join('');

    const silentArgs = [
      '-hide_banner',
      '-y',
      '-loglevel',
      'error',
      '-i',
      inputPath,
      '-f',
      'lavfi',
      '-i',
      'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-filter_complex',
      `${silentFilter};[1:a]asetpts=N/SR/TB[a]`,
      '-map',
      '[v]',
      '-map',
      '[a]',
      '-shortest',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      outputPath,
    ];

    ({ code, stderr } = await runFfmpegCapture(ffmpegPath, silentArgs));
    if (code !== 0 || !(await this.isValidFile(outputPath))) {
      throw new Error(`Normalizace videa selhala: ${stderr.slice(-600) || 'neznámá chyba'}`);
    }
  }

  private async concatNormalized(
    ffmpegPath: string,
    firstPath: string,
    secondPath: string,
    outputPath: string,
  ): Promise<void> {
    const filter = [
      '[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]',
    ].join('');

    const args = [
      '-hide_banner',
      '-y',
      '-loglevel',
      'error',
      '-i',
      firstPath,
      '-i',
      secondPath,
      '-filter_complex',
      filter,
      '-map',
      '[v]',
      '-map',
      '[a]',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      outputPath,
    ];

    const { code, stderr } = await runFfmpegCapture(ffmpegPath, args);
    if (code !== 0 || !(await this.isValidFile(outputPath))) {
      throw new Error(`Spojení videí selhalo: ${stderr.slice(-600) || 'neznámá chyba'}`);
    }
  }

  private async isValidFile(filePath: string): Promise<boolean> {
    try {
      const info = await stat(filePath);
      return info.isFile() && info.size > 0;
    } catch {
      return false;
    }
  }

  private async probeDuration(ffmpegPath: string, videoPath: string): Promise<number | null> {
    const { stderr } = await runFfmpegCapture(ffmpegPath, ['-hide_banner', '-i', videoPath]);
    return parseDurationSecondsFromFfmpegStderr(stderr);
  }
}
