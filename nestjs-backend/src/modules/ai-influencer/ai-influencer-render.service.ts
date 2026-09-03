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
import {
  REEL_CANVAS_HEIGHT,
  REEL_CANVAS_WIDTH,
  REEL_FPS,
  mergeRenderSettings,
  resolveSmartLayout,
  type AiInfluencerCompositorInput,
  type AiInfluencerLayoutMode,
  type AiInfluencerRenderSettings,
} from './ai-influencer-render.types';
import { AiInfluencerRenderValidatorService } from './ai-influencer-render-validator.service';
import { AiInfluencerSubtitleService } from './ai-influencer-subtitle.service';
import type { ReelScenePlan } from './ai-influencer.types';

export type AiInfluencerRenderInput = AiInfluencerCompositorInput;

export type AiInfluencerRenderResult = {
  outputPath: string;
  tmpRoot: string;
  durationSec: number | null;
  layoutUsed: AiInfluencerLayoutMode;
  validationWarnings: string[];
};

@Injectable()
export class AiInfluencerRenderService {
  private readonly log = new Logger(AiInfluencerRenderService.name);

  constructor(
    private readonly subtitles: AiInfluencerSubtitleService,
    private readonly validator: AiInfluencerRenderValidatorService,
  ) {}

  async render(input: AiInfluencerRenderInput): Promise<AiInfluencerRenderResult> {
    assertSharpReady('ai-influencer-render');
    const ffmpeg = resolveFfmpegBinary();
    if (!ffmpeg.path) {
      throw new Error('ffmpeg není dostupný — nelze vytvořit AI Influencer Reel.');
    }

    const settings = mergeRenderSettings(input.settings);
    const precheck = await this.validator.validateBeforeRender({ ...input, settings });
    if (!precheck.ok) {
      const msg = precheck.issues.map((i) => i.message).join(' ');
      throw new Error(`Pre-render validace selhala: ${msg}`);
    }

    const tmpRoot = join(tmpdir(), `ai-influencer-reel-${randomBytes(8).toString('hex')}`);
    await mkdir(tmpRoot, { recursive: true });

    try {
      const durationSec = await this.probeDuration(ffmpeg.path, input.voiceAudioPath);
      const targetDuration = Math.max(8, durationSec ?? 30);

      const sourceDims = await this.probeVideoDimensions(ffmpeg.path, input.avatarVideoPath);
      let layout = settings.layout;
      if (layout === 'SMART_AUTO') {
        layout = resolveSmartLayout(sourceDims?.width ?? 0, sourceDims?.height ?? 0);
      }

      const brollPath =
        input.brollImagePath ??
        (await this.resolveBrollImage(tmpRoot, input.scenes, settings));

      const composed = join(tmpRoot, 'composed.mp4');
      await this.composeVideo(ffmpeg.path, {
        avatarPath: input.avatarVideoPath,
        layout,
        settings,
        targetDuration,
        brollPath,
        outPath: composed,
      });

      const assPath = join(tmpRoot, 'captions.ass');
      const cues = this.subtitles.buildCues(
        input.scenes,
        targetDuration,
        input.hookText,
        input.spokenText,
        settings.subtitles,
      );
      await writeFile(
        assPath,
        this.subtitles.buildAss(cues, input.hookText, settings, targetDuration),
      );

      const withSubs = join(tmpRoot, 'with-subs.mp4');
      const assEscaped = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      await this.runFfmpeg(ffmpeg.path, [
        '-y',
        '-i',
        composed,
        '-vf',
        `ass='${assEscaped}',scale=${REEL_CANVAS_WIDTH}:${REEL_CANVAS_HEIGHT}:force_original_aspect_ratio=decrease,pad=${REEL_CANVAS_WIDTH}:${REEL_CANVAS_HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        '20',
        '-pix_fmt',
        'yuv420p',
        '-an',
        '-r',
        String(REEL_FPS),
        withSubs,
      ]);

      let videoForMux = withSubs;
      if (input.logoPath && settings.branding.logoEnabled) {
        const withLogo = join(tmpRoot, 'with-logo.mp4');
        await this.overlayLogo(ffmpeg.path, withSubs, input.logoPath, settings, withLogo, targetDuration);
        videoForMux = withLogo;
      }

      const outputPath = join(tmpRoot, 'final.mp4');
      await this.muxAudio(ffmpeg.path, {
        videoPath: videoForMux,
        voicePath: input.voiceAudioPath,
        musicPath: input.musicFilePath,
        settings,
        targetDuration,
        outputPath,
      });

      const postcheck = await this.validator.validateOutputFile(outputPath, targetDuration);
      if (!postcheck.ok) {
        const msg = postcheck.issues.map((i) => i.message).join(' ');
        throw new Error(`Post-render validace selhala: ${msg}`);
      }

      const warnings = [
        ...precheck.issues.filter((i) => i.severity === 'warning').map((i) => i.message),
        ...postcheck.issues.filter((i) => i.severity === 'warning').map((i) => i.message),
      ];

      return {
        outputPath,
        tmpRoot,
        durationSec: targetDuration,
        layoutUsed: layout,
        validationWarnings: warnings,
      };
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

  private async composeVideo(
    ffmpegPath: string,
    opts: {
      avatarPath: string;
      layout: AiInfluencerLayoutMode;
      settings: AiInfluencerRenderSettings;
      targetDuration: number;
      brollPath: string | null;
      outPath: string;
    },
  ): Promise<void> {
    const { avatarPath, layout, settings, targetDuration, brollPath, outPath } = opts;
    const W = REEL_CANVAS_WIDTH;
    const H = REEL_CANVAS_HEIGHT;
    const zoom = settings.avatar.zoom;

    let filter: string;
    switch (layout) {
      case 'AVATAR_FULLSCREEN':
        filter = `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,format=yuv420p[v]`;
        break;
      case 'AVATAR_BLUR':
        filter = [
          `[0:v]split=2[bg][fg]`,
          `[bg]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=30:5,eq=brightness=-0.08[blurred]`,
          `[fg]scale='min(${W},iw*${zoom})':'-2':force_original_aspect_ratio=decrease[avatar]`,
          `[blurred][avatar]overlay=(W-w)/2:(H-h)/2:format=auto,setsar=1,format=yuv420p[v]`,
        ].join(';');
        break;
      case 'AVATAR_CONTENT': {
        const avatarH = Math.round(H * 0.42);
        const brollInput = brollPath ? 1 : 0;
        if (brollPath) {
          filter = [
            `[1:v]scale=${W}:${H - avatarH}:force_original_aspect_ratio=increase,crop=${W}:${H - avatarH}[broll]`,
            `[0:v]scale=${W}:${avatarH}:force_original_aspect_ratio=increase,crop=${W}:${avatarH}[avatar]`,
            `[broll][avatar]vstack=inputs=2,setsar=1,format=yuv420p[v]`,
          ].join(';');
        } else {
          filter = [
            `color=c=${settings.colors.background.replace('#', '0x')}:s=${W}x${H - avatarH}:d=${targetDuration}[bg]`,
            `[0:v]scale=${W}:${avatarH}:force_original_aspect_ratio=increase,crop=${W}:${avatarH}[avatar]`,
            `[bg][avatar]vstack=inputs=2,setsar=1,format=yuv420p[v]`,
          ].join(';');
        }
        break;
      }
      case 'PICTURE_IN_PICTURE': {
        const pipH = Math.round(H * 0.32);
        if (brollPath) {
          filter = [
            `[1:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}[main]`,
            `[0:v]scale=${W}:${pipH}:force_original_aspect_ratio=increase,crop=${W}:${pipH}[pip]`,
            `[main][pip]overlay=0:H-h:format=auto,setsar=1,format=yuv420p[v]`,
          ].join(';');
        } else {
          filter = `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,format=yuv420p[v]`;
        }
        break;
      }
      default:
        filter = `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,format=yuv420p[v]`;
    }

    const inputs = brollPath && (layout === 'AVATAR_CONTENT' || layout === 'PICTURE_IN_PICTURE')
      ? ['-y', '-i', avatarPath, '-loop', '1', '-i', brollPath]
      : ['-y', '-i', avatarPath];

    await this.runFfmpeg(ffmpegPath, [
      ...inputs,
      '-t',
      String(targetDuration),
      '-filter_complex',
      filter,
      '-map',
      '[v]',
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-r',
      String(REEL_FPS),
      '-an',
      outPath,
    ]);
  }

  private async overlayLogo(
    ffmpegPath: string,
    videoPath: string,
    logoPath: string,
    settings: AiInfluencerRenderSettings,
    outPath: string,
    duration: number,
  ): Promise<void> {
    const size = settings.branding.logoSize;
    const x = settings.branding.logoX;
    const y = settings.branding.logoY;
    const opacity = settings.branding.logoOpacity;
    await this.runFfmpeg(ffmpegPath, [
      '-y',
      '-i',
      videoPath,
      '-i',
      logoPath,
      '-filter_complex',
      `[1:v]scale=${size}:${size}:force_original_aspect_ratio=decrease,format=rgba,colorchannelmixer=aa=${opacity}[logo];[0:v][logo]overlay=${x}:${y}:format=auto,scale=${REEL_CANVAS_WIDTH}:${REEL_CANVAS_HEIGHT},setsar=1`,
      '-t',
      String(duration),
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-an',
      outPath,
    ]);
  }

  private async muxAudio(
    ffmpegPath: string,
    opts: {
      videoPath: string;
      voicePath: string;
      musicPath?: string | null;
      settings: AiInfluencerRenderSettings;
      targetDuration: number;
      outputPath: string;
    },
  ): Promise<void> {
    const { videoPath, voicePath, musicPath, settings, targetDuration, outputPath } = opts;
    const music = settings.music;
    const args = ['-y', '-i', videoPath, '-i', voicePath];

    if (musicPath) {
      args.push('-stream_loop', '-1', '-i', musicPath);
      const fadeOutStart = Math.max(0, targetDuration - music.fadeOutSec);
      const musicFilter = music.ducking
        ? `[1:a]volume=${music.voiceVolume}[voice];[2:a]volume=${music.musicVolume},afade=t=in:st=0:d=${music.fadeInSec},afade=t=out:st=${fadeOutStart}:d=${music.fadeOutSec}[bg];[voice][bg]amix=inputs=2:duration=first:dropout_transition=2[aout]`
        : `[1:a]volume=${music.voiceVolume}[voice];[2:a]volume=${music.musicVolume},afade=t=in:st=0:d=${music.fadeInSec},afade=t=out:st=${fadeOutStart}:d=${music.fadeOutSec}[bg];[voice][bg]amix=inputs=2:duration=first[aout]`;
      args.push(
        '-t',
        String(targetDuration),
        '-filter_complex',
        musicFilter,
        '-map',
        '0:v:0',
        '-map',
        '[aout]',
      );
    } else {
      args.push('-t', String(targetDuration), '-map', '0:v:0', '-map', '1:a:0');
    }

    args.push(
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '20',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      '-pix_fmt',
      'yuv420p',
      '-s',
      `${REEL_CANVAS_WIDTH}x${REEL_CANVAS_HEIGHT}`,
      outputPath,
    );

    await this.runFfmpeg(ffmpegPath, args);
  }

  private async resolveBrollImage(
    tmpRoot: string,
    scenes: ReelScenePlan[],
    settings: AiInfluencerRenderSettings,
  ): Promise<string | null> {
    const scene = scenes.find(
      (s) => (s.type === 'IMAGE_FULL' || s.type === 'BROLL_FULL') && s.mediaUrl,
    );
    if (!scene?.mediaUrl) return null;
    const outPath = join(tmpRoot, 'broll.jpg');
    try {
      const res = await fetch(scene.mediaUrl);
      if (!res.ok) return null;
      await sharp(Buffer.from(await res.arrayBuffer()))
        .resize(REEL_CANVAS_WIDTH, REEL_CANVAS_HEIGHT, { fit: 'cover' })
        .jpeg({ quality: 90 })
        .toFile(outPath);
      return outPath;
    } catch {
      return null;
    }
  }

  private async probeDuration(ffmpegPath: string, audioPath: string): Promise<number | null> {
    const { code, stderr } = await runFfmpegCapture(ffmpegPath, ['-i', audioPath]);
    if (code === 0 || stderr.includes('Duration:')) {
      return parseDurationSecondsFromFfmpegStderr(stderr);
    }
    return null;
  }

  private async probeVideoDimensions(
    ffmpegPath: string,
    filePath: string,
  ): Promise<{ width: number; height: number } | null> {
    const { stderr } = await runFfmpegCapture(ffmpegPath, ['-i', filePath]);
    const match = stderr.match(/,\s*(\d{2,5})x(\d{2,5})[,\s]/);
    if (!match) return null;
    return { width: Number.parseInt(match[1], 10), height: Number.parseInt(match[2], 10) };
  }

  private async runFfmpeg(ffmpegPath: string, args: string[]): Promise<void> {
    const { code, stderr } = await runFfmpegCapture(ffmpegPath, args);
    if (code !== 0) {
      this.log.warn(`ffmpeg failed: ${stderr.slice(-800)}`);
      throw new Error(`ffmpeg selhalo: ${stderr.split('\n').slice(-4).join(' ')}`);
    }
  }
}
