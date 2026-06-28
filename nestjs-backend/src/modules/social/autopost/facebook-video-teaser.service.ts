import { Injectable, Logger } from '@nestjs/common';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { resolveFfmpegBinary } from '../../../lib/ffmpeg-binary';
import {
  parseDurationSecondsFromFfmpegStderr,
  runFfmpegCapture,
} from '../../../lib/ffmpeg-run';
import { PropertyMediaCloudinaryService } from '../../properties/property-media-cloudinary.service';

export const FACEBOOK_TEASER_MAX_SECONDS = 5;

export type FacebookVideoTeaserResult = {
  teaserUrl: string;
  teaserDurationSec: number;
  originalDurationSec: number | null;
};

@Injectable()
export class FacebookVideoTeaserService {
  private readonly log = new Logger(FacebookVideoTeaserService.name);

  constructor(private readonly cloudinary: PropertyMediaCloudinaryService) {}

  async createTeaserFromVideoUrl(
    videoUrl: string,
    maxSeconds = FACEBOOK_TEASER_MAX_SECONDS,
  ): Promise<FacebookVideoTeaserResult> {
    const ffmpeg = resolveFfmpegBinary();
    if (!ffmpeg.path) {
      throw new Error('ffmpeg není dostupný — nelze vytvořit teaser videa.');
    }

    const tmpRoot = join(tmpdir(), `fb-teaser-${randomBytes(8).toString('hex')}`);
    await mkdir(tmpRoot, { recursive: true });
    const sourcePath = join(tmpRoot, 'source.mp4');
    const teaserPath = join(tmpRoot, 'teaser.mp4');

    try {
      await this.downloadVideo(videoUrl, sourcePath);
      const originalDurationSec = await this.probeDuration(ffmpeg.path, sourcePath);
      const teaserDurationSec =
        originalDurationSec != null
          ? Math.min(maxSeconds, Math.max(0.5, originalDurationSec))
          : maxSeconds;

      const { code, stderr } = await runFfmpegCapture(ffmpeg.path, [
        '-hide_banner',
        '-y',
        '-loglevel',
        'error',
        '-i',
        sourcePath,
        '-t',
        String(teaserDurationSec),
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart',
        teaserPath,
      ]);

      if (code !== 0) {
        throw new Error(`ffmpeg teaser selhal: ${stderr.slice(-500)}`);
      }

      const buffer = await readFile(teaserPath);
      if (!buffer.length) {
        throw new Error('Teaser video je prázdné.');
      }

      const teaserUrl = await this.cloudinary.uploadVideoBuffer(buffer, 'facebook-teaser.mp4');
      return {
        teaserUrl,
        teaserDurationSec,
        originalDurationSec,
      };
    } finally {
      await rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async downloadVideo(url: string, destPath: string): Promise<void> {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok || !res.body) {
      throw new Error(`Stažení videa selhalo (HTTP ${res.status}).`);
    }
    const contentLength = Number(res.headers.get('content-length') ?? 0);
    if (contentLength > 250 * 1024 * 1024) {
      throw new Error('Video je příliš velké pro teaser.');
    }
    await pipeline(res.body as unknown as NodeJS.ReadableStream, createWriteStream(destPath));
  }

  private async probeDuration(ffmpegPath: string, videoPath: string): Promise<number | null> {
    const { stderr } = await runFfmpegCapture(ffmpegPath, [
      '-hide_banner',
      '-i',
      videoPath,
    ]);
    return parseDurationSecondsFromFfmpegStderr(stderr);
  }
}
