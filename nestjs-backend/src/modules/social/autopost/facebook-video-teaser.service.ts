import { Injectable, Logger } from '@nestjs/common';
import { SocialIntroPropertyType } from '@prisma/client';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { resolveFfmpegBinary } from '../../../lib/ffmpeg-binary';
import {
  parseDurationSecondsFromFfmpegStderr,
  probeFfmpegSupportsDrawtext,
  runFfmpegCapture,
} from '../../../lib/ffmpeg-run';
import { PropertyMediaCloudinaryService } from '../../properties/property-media-cloudinary.service';
import { SocialAutopostSettingsService } from './social-autopost-settings.service';

export const FACEBOOK_TEASER_MAX_SECONDS = 5;

export type FacebookVideoTeaserResult = {
  teaserUrl: string;
  teaserDurationSec: number;
  originalDurationSec: number | null;
  /** Lokální cesta k souboru před uploadem (pro log). */
  teaserLocalPath?: string;
  /** Zda byl použit ffmpeg filtr drawtext. */
  drawtextUsed?: boolean;
  /** Důvod, proč drawtext nebyl použit (text je v popisu Reelu). */
  drawtextSkippedReason?: string | null;
  introVideoUsed?: boolean;
  introVideoPropertyType?: SocialIntroPropertyType | null;
  introVideoDurationSec?: number | null;
  introVideoId?: string | null;
  introVideoTitle?: string | null;
  totalReelDurationSec?: number | null;
  introVideoError?: string | null;
};

function escapeFfmpegDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%');
}

function isDrawtextFilterError(stderr: string): boolean {
  const s = stderr.toLowerCase();
  return (
    s.includes('drawtext') &&
    (s.includes('no such filter') ||
      s.includes('filter not found') ||
      s.includes('unknown filter') ||
      s.includes('error while opening encoder') ||
      s.includes('error reinitializing filters'))
  );
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
    const rendered = await this.renderTeaserArtifacts(videoUrl, maxSecondsOverride);
    try {
      const buffer = await readFile(rendered.teaserPath);
      if (!buffer.length) {
        throw new Error('Teaser video je prázdné.');
      }
      const teaserUrl = await this.cloudinary.uploadVideoBuffer(buffer, 'facebook-teaser.mp4');
      this.log.log(
        `Teaser připraven: délka=${rendered.teaserDurationSec}s, drawtext=${rendered.drawtextUsed}, soubor=${rendered.teaserPath}, url=${teaserUrl}`,
      );
      return {
        teaserUrl,
        teaserDurationSec: rendered.teaserDurationSec,
        originalDurationSec: rendered.originalDurationSec,
        teaserLocalPath: rendered.teaserPath,
        drawtextUsed: rendered.drawtextUsed,
        drawtextSkippedReason: rendered.drawtextSkippedReason,
      };
    } finally {
      await rm(rendered.tmpRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async renderTeaserArtifacts(
    videoUrl: string,
    maxSecondsOverride?: number,
  ): Promise<{
    tmpRoot: string;
    teaserPath: string;
    teaserDurationSec: number;
    originalDurationSec: number | null;
    drawtextUsed: boolean;
    drawtextSkippedReason: string | null;
  }> {
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

      const drawtextFilter =
        endSlideEnabled && endSlideText
          ? this.buildDrawtextFilter(endSlideText, teaserDurationSec)
          : null;

      const supportsDrawtext = drawtextFilter
        ? await probeFfmpegSupportsDrawtext(ffmpeg.path)
        : false;

      const attempts: Array<{ vf: string[]; label: 'with-drawtext' | 'without-drawtext' }> = [];
      if (drawtextFilter && supportsDrawtext) {
        attempts.push({ vf: [drawtextFilter], label: 'with-drawtext' });
      }
      attempts.push({ vf: [], label: 'without-drawtext' });

      let drawtextUsed = false;
      let drawtextSkippedReason: string | null = null;
      let lastStderr = '';

      if (drawtextFilter && !supportsDrawtext) {
        drawtextSkippedReason =
          'ffmpeg na serveru nepodporuje filtr drawtext — text je v popisu Reelu na XXREALIT.';
        this.log.warn(
          `drawtext není dostupný (${ffmpeg.path}), teaser se vytvoří bez textového overlaye.`,
        );
      }

      for (let i = 0; i < attempts.length; i++) {
        const attempt = attempts[i];
        const ffmpegArgs = this.buildFfmpegArgs(
          sourcePath,
          teaserPath,
          teaserDurationSec,
          attempt.vf,
        );

        this.log.log(
          `ffmpeg teaser export (${attempt.label}): ${teaserPath}, délka=${teaserDurationSec}s`,
        );

        const { code, stderr } = await runFfmpegCapture(ffmpeg.path, ffmpegArgs);
        lastStderr = stderr;

        if (code === 0 && (await this.isValidOutputFile(teaserPath))) {
          drawtextUsed = attempt.label === 'with-drawtext';
          if (!drawtextUsed && drawtextFilter) {
            if (attempt.label === 'without-drawtext' && i > 0) {
              drawtextSkippedReason =
                drawtextSkippedReason ??
                `drawtext selhal, použit export bez overlaye: ${stderr.slice(-240)}`;
              this.log.warn(
                `drawtext export selhal, teaser vytvořen bez overlaye: ${stderr.slice(-240)}`,
              );
            } else if (!drawtextSkippedReason) {
              drawtextSkippedReason = 'text je v popisu Reelu na XXREALIT';
            }
          }
          break;
        }

        const drawtextFailure = isDrawtextFilterError(stderr);
        const hasMoreAttempts = i < attempts.length - 1;

        if (attempt.label === 'with-drawtext' && (drawtextFailure || hasMoreAttempts)) {
          this.log.warn(
            `ffmpeg drawtext selhal, opakuji bez overlaye: ${stderr.slice(-400)}`,
          );
          drawtextSkippedReason = `drawtext selhal: ${stderr.slice(-240)}`;
          continue;
        }

        throw new Error(
          `ffmpeg teaser selhal (${attempt.label}): ${stderr.slice(-800) || 'neznámá chyba'}`,
        );
      }

      if (!(await this.isValidOutputFile(teaserPath))) {
        throw new Error(
          `ffmpeg teaser selhal: výstupní soubor je neplatný. ${lastStderr.slice(-800)}`,
        );
      }

      return {
        tmpRoot,
        teaserPath,
        teaserDurationSec,
        originalDurationSec,
        drawtextUsed,
        drawtextSkippedReason,
      };
    } catch (err) {
      await rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
      throw err;
    }
  }

  private buildDrawtextFilter(endSlideText: string, teaserDurationSec: number): string {
    const slideStart = Math.max(0, teaserDurationSec - 1.5);
    const escaped = escapeFfmpegDrawtext(endSlideText);
    return `drawtext=enable='gte(t,${slideStart.toFixed(2)})':text='${escaped}':fontsize=28:fontcolor=white:x=(w-text_w)/2:y=h-100:box=1:boxcolor=black@0.55:boxborderw=8`;
  }

  private buildFfmpegArgs(
    sourcePath: string,
    teaserPath: string,
    teaserDurationSec: number,
    vfParts: string[],
  ): string[] {
    return [
      '-hide_banner',
      '-y',
      '-loglevel',
      'error',
      '-i',
      sourcePath,
      '-t',
      String(teaserDurationSec),
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      ...(vfParts.length ? ['-vf', vfParts.join(',')] : []),
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
      teaserPath,
    ];
  }

  private async isValidOutputFile(filePath: string): Promise<boolean> {
    try {
      const info = await stat(filePath);
      return info.isFile() && info.size > 0;
    } catch {
      return false;
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
        drawtextUsed: false,
        drawtextSkippedReason: 'publikováno celé video bez teaseru',
        introVideoUsed: false,
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

  /** Vytvoří lokální ukázku videa inzerátu (caller uklidí tmpRoot). */
  async createListingTeaserLocal(videoUrl: string, maxSecondsOverride?: number) {
    return this.renderTeaserArtifacts(videoUrl, maxSecondsOverride);
  }
}
