import { Injectable, Logger } from '@nestjs/common';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import sharp, { assertSharpReady } from '../../lib/sharp-instance';
import { resolveFfmpegBinary } from '../../lib/ffmpeg-binary';
import { runFfmpegCapture } from '../../lib/ffmpeg-run';
import {
  REEL_CANVAS_HEIGHT,
  REEL_CANVAS_WIDTH,
  REEL_FPS,
  type AiInfluencerRenderSettings,
} from './ai-influencer-render.types';
import {
  classifyFfmpegStderr,
  FfmpegRenderError,
  buildFfmpegDebugSnapshot,
} from './ai-influencer-ffmpeg.util';
import { isAvatarSceneType, isVisualSceneType } from './ai-influencer-storyboard.util';
import type { ReelScenePlan } from './ai-influencer.types';

export type SceneCompositorInput = {
  tmpRoot: string;
  avatarVideoPath: string;
  scenes: ReelScenePlan[];
  targetDuration: number;
  settings: AiInfluencerRenderSettings;
  mediaBySceneIndex: Map<number, string>;
};

@Injectable()
export class AiInfluencerSceneCompositorService {
  private readonly log = new Logger(AiInfluencerSceneCompositorService.name);
  private zoompanAvailable: boolean | null = null;

  async composeTimeline(input: SceneCompositorInput): Promise<string> {
    assertSharpReady('ai-influencer-scene-compositor');
    const ffmpeg = resolveFfmpegBinary();
    if (!ffmpeg.path) {
      throw new Error('ffmpeg není dostupný pro scene compositor.');
    }

    const segmentsDir = join(input.tmpRoot, 'segments');
    await mkdir(segmentsDir, { recursive: true });

    const segmentPaths: string[] = [];
    let avatarOffsetSec = 0;

    for (let i = 0; i < input.scenes.length; i++) {
      const scene = input.scenes[i];
      const outPath = join(segmentsDir, `scene-${String(i).padStart(2, '0')}.mp4`);
      const duration = Math.max(2, scene.duration);
      const imagePath = input.mediaBySceneIndex.get(i) ?? null;

      if (isVisualSceneType(scene.type) || scene.type === 'BROLL_FULL') {
        await this.renderImageScene(ffmpeg.path, {
          imagePath,
          duration,
          motion: i % 3 === 0 ? 'zoom_in' : i % 3 === 1 ? 'zoom_out' : 'pan_right',
          outPath,
          settings: input.settings,
        });
      } else if (isAvatarSceneType(scene.type)) {
        await this.renderAvatarScene(ffmpeg.path, {
          avatarVideoPath: input.avatarVideoPath,
          avatarOffsetSec,
          duration,
          sceneType: scene.type,
          imagePath,
          settings: input.settings,
          outPath,
        });
        avatarOffsetSec += duration;
      } else {
        await this.renderImageScene(ffmpeg.path, {
          imagePath,
          duration,
          motion: 'zoom_in',
          outPath,
          settings: input.settings,
        });
      }

      segmentPaths.push(outPath);
    }

    const composed = join(input.tmpRoot, 'timeline-composed.mp4');
    await this.concatSegments(ffmpeg.path, segmentPaths, composed, input.targetDuration);
    return composed;
  }

  private async renderAvatarScene(
    ffmpegPath: string,
    opts: {
      avatarVideoPath: string;
      avatarOffsetSec: number;
      duration: number;
      sceneType: ReelScenePlan['type'];
      imagePath: string | null;
      settings: AiInfluencerRenderSettings;
      outPath: string;
    },
  ): Promise<void> {
    const W = REEL_CANVAS_WIDTH;
    const H = REEL_CANVAS_HEIGHT;
    const { avatarVideoPath, avatarOffsetSec, duration, sceneType, imagePath, settings, outPath } =
      opts;

    const cover = `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`;
    const blurBg = `[0:v]split=2[bg][fg];[bg]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=28:6,eq=brightness=-0.1[blurred];[fg]scale='min(${W},iw*0.92)':'-2':force_original_aspect_ratio=decrease[avatar];[blurred][avatar]overlay=(W-w)/2:(H-h)/2:format=auto`;

    let filter: string;
    let inputs = ['-y', '-ss', String(avatarOffsetSec), '-i', avatarVideoPath];

    switch (sceneType) {
      case 'AVATAR_LEFT': {
        const avatarW = Math.round(W * 0.48);
        if (imagePath) {
          inputs = ['-y', '-ss', String(avatarOffsetSec), '-i', avatarVideoPath, '-loop', '1', '-i', imagePath];
          filter = [
            `[1:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}[bg]`,
            `[0:v]scale=${avatarW}:${H}:force_original_aspect_ratio=increase,crop=${avatarW}:${H}[av]`,
            `[bg][av]overlay=0:0:format=auto,setsar=1,format=yuv420p[v]`,
          ].join(';');
        } else {
          filter = `${blurBg},setsar=1,format=yuv420p[v]`;
        }
        break;
      }
      case 'AVATAR_RIGHT': {
        const avatarW = Math.round(W * 0.48);
        if (imagePath) {
          inputs = ['-y', '-ss', String(avatarOffsetSec), '-i', avatarVideoPath, '-loop', '1', '-i', imagePath];
          filter = [
            `[1:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}[bg]`,
            `[0:v]scale=${avatarW}:${H}:force_original_aspect_ratio=increase,crop=${avatarW}:${H}[av]`,
            `[bg][av]overlay=W-w:0:format=auto,setsar=1,format=yuv420p[v]`,
          ].join(';');
        } else {
          filter = `${blurBg},setsar=1,format=yuv420p[v]`;
        }
        break;
      }
      case 'AVATAR_CIRCLE': {
        const pipH = Math.round(H * 0.34);
        if (imagePath) {
          inputs = ['-y', '-ss', String(avatarOffsetSec), '-i', avatarVideoPath, '-loop', '1', '-i', imagePath];
          filter = [
            `[1:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}[main]`,
            `[0:v]scale=${W}:${pipH}:force_original_aspect_ratio=increase,crop=${W}:${pipH}[pip]`,
            `[main][pip]overlay=0:H-h:format=auto,setsar=1,format=yuv420p[v]`,
          ].join(';');
        } else {
          filter = `${cover},setsar=1,format=yuv420p[v]`;
        }
        break;
      }
      case 'CTA':
      case 'AVATAR_FULL':
      default: {
        const ratio = await this.probeAspectRatio(ffmpegPath, avatarVideoPath);
        const useBlur = ratio > 0 && ratio > 1.12;
        if (useBlur) {
          filter = `${blurBg},setsar=1,format=yuv420p[v]`;
        } else if (imagePath && sceneType === 'CTA') {
          inputs = ['-y', '-ss', String(avatarOffsetSec), '-i', avatarVideoPath, '-loop', '1', '-i', imagePath];
          filter = [
            `[1:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}[bg]`,
            `[0:v]scale=${W}:${Math.round(H * 0.55)}:force_original_aspect_ratio=increase,crop=${W}:${Math.round(H * 0.55)}[av]`,
            `[bg][av]overlay=0:H-h:format=auto,setsar=1,format=yuv420p[v]`,
          ].join(';');
        } else {
          filter = `${cover},setsar=1,format=yuv420p[v]`;
        }
      }
    }

    await this.runFfmpeg(ffmpegPath, [
      ...inputs,
      '-t',
      String(duration),
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

  private async renderImageScene(
    ffmpegPath: string,
    opts: {
      imagePath: string | null;
      duration: number;
      motion: 'zoom_in' | 'zoom_out' | 'pan_right' | 'pan_left';
      outPath: string;
      settings: AiInfluencerRenderSettings;
    },
  ): Promise<void> {
    const W = REEL_CANVAS_WIDTH;
    const H = REEL_CANVAS_HEIGHT;
    const frames = Math.max(2, Math.round(opts.duration * REEL_FPS));
    const bg = opts.settings.colors.background.replace('#', '0x');

    if (!opts.imagePath) {
      await this.runFfmpeg(ffmpegPath, [
        '-y',
        '-f',
        'lavfi',
        '-i',
        `color=c=${bg}:s=${W}x${H}:d=${opts.duration}:r=${REEL_FPS}`,
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        '20',
        '-pix_fmt',
        'yuv420p',
        opts.outPath,
      ]);
      return;
    }

    const meta = await sharp(opts.imagePath).metadata();
    const landscape = (meta.width ?? W) / Math.max(meta.height ?? H, 1) > 1.15;
    const useZoompan = await this.hasZoompan(ffmpegPath);

    if (useZoompan) {
      const zStart = opts.motion === 'zoom_out' ? 1.12 : 1;
      const zEnd = opts.motion === 'zoom_in' ? 1.12 : opts.motion === 'zoom_out' ? 1 : 1.06;
      const zExpr =
        opts.motion === 'zoom_in'
          ? `min(zoom+0.0012,${zEnd})`
          : opts.motion === 'zoom_out'
            ? `max(zoom-0.0012,${zEnd})`
            : 'min(zoom+0.0008,1.1)';
      const xExpr =
        opts.motion === 'pan_right'
          ? `min(iw/2-(iw/zoom/2)+i*0.6,iw-iw/zoom)`
          : opts.motion === 'pan_left'
            ? `max(iw/2-(iw/zoom/2)-i*0.6,0)`
            : 'iw/2-(iw/zoom/2)';
      const filter = landscape
        ? `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},zoompan=z='${zExpr}':d=${frames}:x='${xExpr}':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${REEL_FPS}`
        : `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},zoompan=z='${zExpr}':d=${frames}:x='${xExpr}':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${REEL_FPS}`;

      await this.runFfmpeg(ffmpegPath, [
        '-y',
        '-loop',
        '1',
        '-i',
        opts.imagePath,
        '-filter_complex',
        filter,
        '-t',
        String(opts.duration),
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        '20',
        '-pix_fmt',
        'yuv420p',
        opts.outPath,
      ]);
      return;
    }

    const fallbackFilter = landscape
      ? [
          `[0:v]split=2[bg][fg]`,
          `[bg]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=24:5,eq=brightness=-0.12[blurred]`,
          `[fg]scale='min(${W},iw*0.94)':'-2':force_original_aspect_ratio=decrease[img]`,
          `[blurred][img]overlay=(W-w)/2:(H-h)/2:format=auto,setsar=1,format=yuv420p[v]`,
        ].join(';')
      : `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,format=yuv420p[v]`;

    await this.runFfmpeg(ffmpegPath, [
      '-y',
      '-loop',
      '1',
      '-i',
      opts.imagePath,
      '-t',
      String(opts.duration),
      '-filter_complex',
      fallbackFilter,
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
      opts.outPath,
    ]);
  }

  private async concatSegments(
    ffmpegPath: string,
    segmentPaths: string[],
    outPath: string,
    targetDuration: number,
  ): Promise<void> {
    const listPath = join(dirname(outPath), 'ffconcat.txt');
    const lines = ['ffconcat version 1.0'];
    for (const p of segmentPaths) {
      const escaped = p.replace(/'/g, "'\\''");
      lines.push(`file '${escaped}'`);
    }
    await writeFile(listPath, lines.join('\n'), 'utf8');

    await this.runFfmpeg(ffmpegPath, [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listPath,
      '-t',
      String(targetDuration),
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

  async prepareSceneMedia(
    tmpRoot: string,
    scenes: ReelScenePlan[],
  ): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    const mediaDir = join(tmpRoot, 'scene-media');
    await mkdir(mediaDir, { recursive: true });

    for (let i = 0; i < scenes.length; i++) {
      const url = scenes[i].mediaUrl?.trim();
      if (!url) continue;
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        const out = join(mediaDir, `scene-${i}.jpg`);
        await sharp(buf)
          .resize(REEL_CANVAS_WIDTH, REEL_CANVAS_HEIGHT, { fit: 'cover' })
          .jpeg({ quality: 90 })
          .toFile(out);
        map.set(i, out);
      } catch (err) {
        this.log.warn(`Scene media download failed index=${i}: ${err}`);
      }
    }
    return map;
  }

  private async hasZoompan(ffmpegPath: string): Promise<boolean> {
    if (this.zoompanAvailable != null) return this.zoompanAvailable;
    try {
      const { stderr } = await runFfmpegCapture(ffmpegPath, ['-hide_banner', '-filters']);
      this.zoompanAvailable = /\bzoompan\b/.test(stderr);
    } catch {
      this.zoompanAvailable = false;
    }
    return this.zoompanAvailable;
  }

  private async probeAspectRatio(ffmpegPath: string, videoPath: string): Promise<number> {
    const { stderr } = await runFfmpegCapture(ffmpegPath, ['-hide_banner', '-i', videoPath]);
    const m = stderr.match(/,\s*(\d{2,5})x(\d{2,5})/);
    if (!m) return 0;
    const w = Number.parseInt(m[1], 10);
    const h = Number.parseInt(m[2], 10);
    if (!w || !h) return 0;
    return w / h;
  }

  private async runFfmpeg(ffmpegPath: string, args: string[]): Promise<void> {
    const { code, stderr } = await runFfmpegCapture(ffmpegPath, args);
    if (code === 0) return;
    const classification = classifyFfmpegStderr(stderr, {
      outputPath: args[args.length - 1],
      branding: false,
    });
    const diagnostics = await buildFfmpegDebugSnapshot({
      ffmpegPath,
      inputVideoPath: args.find((a) => a.endsWith('.mp4') && !a.includes('scene-')),
      outputPath: args[args.length - 1],
      filterGraphUsed: args.includes('-filter_complex')
        ? args[args.indexOf('-filter_complex') + 1]
        : 'n/a',
      stderr,
    });
    throw new FfmpegRenderError(classification, diagnostics);
  }
}
