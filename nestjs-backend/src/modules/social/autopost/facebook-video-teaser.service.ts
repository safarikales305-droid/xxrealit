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
import { SocialAutopostSettingsService } from './social-autopost-settings.service';

export const FACEBOOK_TEASER_MAX_SECONDS = 5;

export type FacebookVideoTeaserResult = {
  teaserUrl: string;
  teaserDurationSec: number;
  originalDurationSec: number | null;
};

function escapeFfmpegDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%');
}

@Injectable()
export class FacebookVideoTeaserService {
  private readonly log = new Logger(FacebookVideoTeaserService.name);

  constructor(
    private readonly cloudinary: PropertyMediaCloudinaryService,
    private readonly settings: SocialAutopostSettingsService,
  ) {}

  async createTeaserFromVideoUrl(
    videoUrl: string,
    maxSecondsOverride?: number,
  ): Promise<FacebookVideoTeaserResult> {
    await this.settings.reload();
    const global = this.settings.getSettings().global;
    const maxSeconds =
      maxSecondsOverride ??
      global.videoTeaserMaxSeconds ??
      FACEBOOK_TEASER_MAX_SECONDS;
    const endSlideEnabled = global.videoTeaserEndSlideEnabled !== false;
    const endSlideText = global.videoTeaserEndSlideText?.trim() || 'Více na XXREALIT.cz';

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

      const vfParts: string[] = [];
      if (endSlideEnabled && endSlideText) {
        const slideStart = Math.max(0, teaserDurationSec - 1.5);
        const escaped = escapeFfmpegDrawtext(endSlideText);
        vfParts.push(
          `drawtext=enable='gte(t,${slideStart.toFixed(2)})':text='${escaped}':fontsize=28:fontcolor=white:x=(w-text_w)/2:y=h-100:box=1:boxcolor=black@0.55:boxborderw=8`,
        );
      }

      const ffmpegArgs = [
        '-hide_banner',
        '-y',
        '-loglevel',
        'error',
        '-i',
        sourcePath,
        '-t',
        String(teaserDurationSec),
        ...(vfParts.length ? ['-vf', vfParts.join(',')] : []),
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
      ];

      const { code, stderr } = await runFfmpegCapture(ffmpeg.path, ffmpegArgs);

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
    const { stderr } = await runFfmpegCapture(ffmpegPath, ['-hide_banner', '-i', videoPath]);
    return parseDurationSecondsFromFfmpegStderr(stderr);
  }

  /** Připraví video pro publikování na sociální sítě (teaser nebo celé video). */
  async prepareVideoForSocialShare(videoUrl: string): Promise<FacebookVideoTeaserResult> {
    await this.settings.reload();
    const global = this.settings.getSettings().global;
    const absolute = videoUrl.trim();
    if (!absolute) {
      throw new Error('Chybí URL videa.');
    }

    if (global.socialVideoPublishFull) {
      return {
        teaserUrl: absolute,
        teaserDurationSec: 0,
        originalDurationSec: null,
      };
    }

    const maxSeconds =
      global.socialVideoUsePortalTeaserRule !== false
        ? (global.videoTeaserMaxSeconds ?? FACEBOOK_TEASER_MAX_SECONDS)
        : (global.socialVideoTeaserSeconds ??
          global.videoTeaserMaxSeconds ??
          FACEBOOK_TEASER_MAX_SECONDS);

    return this.createTeaserFromVideoUrl(absolute, maxSeconds);
  }
}
