import { Injectable, Logger } from '@nestjs/common';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { resolveFfmpegBinary } from '../../../lib/ffmpeg-binary';
import {
  parseDurationSecondsFromFfmpegStderr,
  probeHasAudioStreamFromFfmpegStderr,
  runFfmpegCapture,
} from '../../../lib/ffmpeg-run';

const REEL_WIDTH = 1080;
const REEL_HEIGHT = 1920;
const REEL_FPS = 30;
const AUDIO_SAMPLE_RATE = 48000;
const AUDIO_CHANNELS = 2;

export type ReelComposeProgressStage =
  | 'download-intro'
  | 'normalize-intro'
  | 'normalize-listing'
  | 'concat'
  | 'probe';

export type ReelComposeResult = {
  outputPath: string;
  durationSec: number | null;
  tmpRoot: string;
  ffmpegCommands: string[];
  introLocalPath: string;
  listingLocalPath: string;
  outputSizeBytes: number | null;
  introHasAudio: boolean;
  listingHasAudio: boolean;
  outputHasAudio: boolean;
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
    onProgress?: (stage: ReelComposeProgressStage, percent: number) => void,
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
    const outputPath = join(tmpRoot, 'final.mp4');
    const ffmpegCommands: string[] = [];

    try {
      onProgress?.('download-intro', 10);
      this.log.log(`[compose] Stahuji úvodní video: ${introUrl}`);
      await this.downloadToFile(introUrl, introPath);

      const introHasAudio = await this.probeHasAudio(ffmpeg.path, introPath);
      const listingHasAudio = await this.probeHasAudio(ffmpeg.path, listingLocalPath);
      this.log.log(
        `[compose] Audio vstupy: intro=${introHasAudio ? 'ANO' : 'NE'}, listing=${listingHasAudio ? 'ANO' : 'NE'}`,
      );

      onProgress?.('normalize-intro', 30);
      this.log.log(`[compose] Normalizuji intro: ${introPath} → ${introNorm}`);
      const introNormCmd = await this.normalizeSegment(ffmpeg.path, introPath, introNorm, introHasAudio);
      ffmpegCommands.push(introNormCmd);

      onProgress?.('normalize-listing', 50);
      this.log.log(`[compose] Normalizuji ukázku inzerátu: ${listingLocalPath} → ${listingNorm}`);
      const listingNormCmd = await this.normalizeSegment(
        ffmpeg.path,
        listingLocalPath,
        listingNorm,
        listingHasAudio,
      );
      ffmpegCommands.push(listingNormCmd);

      const introNormHasAudio = await this.probeHasAudio(ffmpeg.path, introNorm);
      const listingNormHasAudio = await this.probeHasAudio(ffmpeg.path, listingNorm);
      if (!introNormHasAudio || !listingNormHasAudio) {
        throw new Error(
          `Normalizovaný segment nemá audio stopu (intro=${introNormHasAudio}, listing=${listingNormHasAudio}).`,
        );
      }

      onProgress?.('concat', 70);
      this.log.log(`[compose] Spojuji intro + inzerát → ${outputPath}`);
      const concatCmd = await this.concatNormalized(ffmpeg.path, introNorm, listingNorm, outputPath, tmpRoot);
      ffmpegCommands.push(concatCmd);

      if (!(await this.isValidFile(outputPath))) {
        throw new Error('Výsledné spojené video je neplatné.');
      }

      onProgress?.('probe', 90);
      const durationSec = await this.probeDuration(ffmpeg.path, outputPath);
      const outputHasAudio = await this.probeHasAudio(ffmpeg.path, outputPath);
      const outputSizeBytes = await this.fileSize(outputPath);

      this.log.log(
        `[compose] final.mp4 hotovo: délka=${durationSec ?? '—'}s, velikost=${outputSizeBytes ?? '—'} B, výstupní audio=${outputHasAudio ? 'ANO' : 'NE'}`,
      );
      this.log.log(`[compose] FFmpeg příkazy:\n${ffmpegCommands.join('\n')}`);

      if (!outputHasAudio) {
        throw new Error('Výsledné spojené video neobsahuje audio stopu.');
      }

      return {
        outputPath,
        durationSec,
        tmpRoot,
        ffmpegCommands,
        introLocalPath: introPath,
        listingLocalPath,
        outputSizeBytes,
        introHasAudio,
        listingHasAudio,
        outputHasAudio,
      };
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

  private videoFilter(): string {
    return [
      `[0:v]scale=${REEL_WIDTH}:${REEL_HEIGHT}:force_original_aspect_ratio=decrease,`,
      `pad=${REEL_WIDTH}:${REEL_HEIGHT}:(ow-iw)/2:(oh-ih)/2,`,
      `setsar=1,fps=${REEL_FPS},format=yuv420p[v]`,
    ].join('');
  }

  private videoEncodeArgs(): string[] {
    return [
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
    ];
  }

  private audioEncodeArgs(): string[] {
    return [
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-ar',
      String(AUDIO_SAMPLE_RATE),
      '-ac',
      String(AUDIO_CHANNELS),
    ];
  }

  private async normalizeSegment(
    ffmpegPath: string,
    inputPath: string,
    outputPath: string,
    inputHasAudio: boolean,
  ): Promise<string> {
    const videoFilter = this.videoFilter();

    if (inputHasAudio) {
      const filter = [
        videoFilter,
        `[0:a]aresample=${AUDIO_SAMPLE_RATE},aformat=channel_layouts=stereo:sample_rates=${AUDIO_SAMPLE_RATE},asetpts=PTS-STARTPTS[a]`,
      ].join(';');

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
        ...this.videoEncodeArgs(),
        ...this.audioEncodeArgs(),
        '-movflags',
        '+faststart',
        outputPath,
      ];

      const { code, stderr } = await runFfmpegCapture(ffmpegPath, withAudioArgs);
      if (code === 0 && (await this.isValidFile(outputPath))) {
        const hasOutputAudio = await this.probeHasAudio(ffmpegPath, outputPath);
        if (hasOutputAudio) {
          return this.formatFfmpegCommand(ffmpegPath, withAudioArgs);
        }
        this.log.warn(
          `[compose] Normalizace s audio vstupem nevytvořila audio stopu, zkouším jednodušší audio filtr: ${inputPath}`,
        );
      } else {
        this.log.warn(
          `[compose] Normalizace s audio selhala (${stderr.slice(-300)}), zkouším jednodušší audio filtr: ${inputPath}`,
        );
      }

      const simpleAudioFilter = [
        `scale=${REEL_WIDTH}:${REEL_HEIGHT}:force_original_aspect_ratio=decrease`,
        `pad=${REEL_WIDTH}:${REEL_HEIGHT}:(ow-iw)/2:(oh-ih)/2`,
        `setsar=1`,
        `fps=${REEL_FPS}`,
        `format=yuv420p`,
      ].join(',');

      const simpleAudioArgs = [
        '-hide_banner',
        '-y',
        '-loglevel',
        'error',
        '-i',
        inputPath,
        '-vf',
        simpleAudioFilter,
        '-af',
        `aresample=${AUDIO_SAMPLE_RATE},aformat=channel_layouts=stereo:sample_rates=${AUDIO_SAMPLE_RATE}`,
        ...this.videoEncodeArgs(),
        ...this.audioEncodeArgs(),
        '-movflags',
        '+faststart',
        outputPath,
      ];

      const simpleResult = await runFfmpegCapture(ffmpegPath, simpleAudioArgs);
      if (simpleResult.code === 0 && (await this.isValidFile(outputPath))) {
        const hasOutputAudio = await this.probeHasAudio(ffmpegPath, outputPath);
        if (hasOutputAudio) {
          return this.formatFfmpegCommand(ffmpegPath, simpleAudioArgs);
        }
        this.log.warn(
          `[compose] Jednodušší audio filtr nevytvořil audio stopu, doplním tiché audio: ${inputPath}`,
        );
      }
    } else {
      this.log.log(`[compose] Vstup bez audio stopy, doplním tiché audio: ${inputPath}`);
    }

    const silentFilter = `${videoFilter};[1:a]asetpts=N/SR/TB[a]`;
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
      `anullsrc=channel_layout=stereo:sample_rate=${AUDIO_SAMPLE_RATE}`,
      '-filter_complex',
      silentFilter,
      '-map',
      '[v]',
      '-map',
      '[a]',
      '-shortest',
      ...this.videoEncodeArgs(),
      ...this.audioEncodeArgs(),
      '-movflags',
      '+faststart',
      outputPath,
    ];

    const { code, stderr } = await runFfmpegCapture(ffmpegPath, silentArgs);
    if (code !== 0 || !(await this.isValidFile(outputPath))) {
      throw new Error(`Normalizace videa selhala: ${stderr.slice(-600) || 'neznámá chyba'}`);
    }
    const hasOutputAudio = await this.probeHasAudio(ffmpegPath, outputPath);
    if (!hasOutputAudio) {
      throw new Error('Normalizovaný segment neobsahuje audio stopu.');
    }
    return this.formatFfmpegCommand(ffmpegPath, silentArgs);
  }

  private formatFfmpegCommand(ffmpegPath: string, args: string[]): string {
    return `${ffmpegPath} ${args.join(' ')}`;
  }

  private async fileSize(filePath: string): Promise<number | null> {
    try {
      const info = await stat(filePath);
      return info.isFile() ? info.size : null;
    } catch {
      return null;
    }
  }

  private escapeConcatPath(filePath: string): string {
    return filePath.replace(/\\/g, '/').replace(/'/g, "'\\''");
  }

  private async concatNormalized(
    ffmpegPath: string,
    firstPath: string,
    secondPath: string,
    outputPath: string,
    tmpRoot: string,
  ): Promise<string> {
    const listPath = join(tmpRoot, 'concat-list.txt');
    await writeFile(
      listPath,
      `file '${this.escapeConcatPath(firstPath)}'\nfile '${this.escapeConcatPath(secondPath)}'\n`,
      'utf8',
    );

    const demuxerArgs = [
      '-hide_banner',
      '-y',
      '-loglevel',
      'error',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listPath,
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      outputPath,
    ];

    let { code, stderr } = await runFfmpegCapture(ffmpegPath, demuxerArgs);
    if (code === 0 && (await this.isValidFile(outputPath))) {
      const hasAudio = await this.probeHasAudio(ffmpegPath, outputPath);
      if (hasAudio) {
        return this.formatFfmpegCommand(ffmpegPath, demuxerArgs);
      }
      this.log.warn('[compose] Concat demuxer vytvořil video bez audio, zkouším filter concat');
    }

    const filter = '[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]';
    const filterArgs = [
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
      ...this.videoEncodeArgs(),
      ...this.audioEncodeArgs(),
      '-movflags',
      '+faststart',
      outputPath,
    ];

    ({ code, stderr } = await runFfmpegCapture(ffmpegPath, filterArgs));
    if (code !== 0 || !(await this.isValidFile(outputPath))) {
      throw new Error(`Spojení videí selhalo: ${stderr.slice(-600) || 'neznámá chyba'}`);
    }
    const hasAudio = await this.probeHasAudio(ffmpegPath, outputPath);
    if (!hasAudio) {
      throw new Error('Spojené video neobsahuje audio stopu.');
    }
    return this.formatFfmpegCommand(ffmpegPath, filterArgs);
  }

  private async isValidFile(filePath: string): Promise<boolean> {
    try {
      const info = await stat(filePath);
      return info.isFile() && info.size > 0;
    } catch {
      return false;
    }
  }

  private async probeHasAudio(ffmpegPath: string, videoPath: string): Promise<boolean> {
    const { stderr } = await runFfmpegCapture(ffmpegPath, ['-hide_banner', '-i', videoPath]);
    return probeHasAudioStreamFromFfmpegStderr(stderr);
  }

  private async probeDuration(ffmpegPath: string, videoPath: string): Promise<number | null> {
    const { stderr } = await runFfmpegCapture(ffmpegPath, ['-hide_banner', '-i', videoPath]);
    return parseDurationSecondsFromFfmpegStderr(stderr);
  }
}
