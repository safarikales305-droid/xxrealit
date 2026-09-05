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
  probeFfmpegCapabilities,
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
import { AiInfluencerSceneCompositorService } from './ai-influencer-scene-compositor.service';
import { AiInfluencerSubtitleService } from './ai-influencer-subtitle.service';
import { renderAiInfluencerBrandingOverlayPng } from './ai-influencer-branding-overlay.render';
import {
  SAFE_BRANDING_FILTER_GRAPH,
  buildFfmpegDebugSnapshot,
  classifyFfmpegStderr,
  FfmpegRenderError,
} from './ai-influencer-ffmpeg.util';
import type { ReelScenePlan } from './ai-influencer.types';

export type AiInfluencerRenderInput = AiInfluencerCompositorInput;

export type AiInfluencerRenderResult = {
  outputPath: string;
  baseVideoPath: string;
  tmpRoot: string;
  durationSec: number | null;
  layoutUsed: AiInfluencerLayoutMode;
  validationWarnings: string[];
};

@Injectable()
export class AiInfluencerRenderService {
  private readonly log = new Logger(AiInfluencerRenderService.name);
  private ffmpegCapsLogged = false;

  constructor(
    private readonly subtitles: AiInfluencerSubtitleService,
    private readonly validator: AiInfluencerRenderValidatorService,
    private readonly sceneCompositor: AiInfluencerSceneCompositorService,
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
      const useSceneTimeline =
        Array.isArray(input.scenes) &&
        input.scenes.length >= 2 &&
        input.scenes.some((s) => s.duration > 0);

      if (useSceneTimeline) {
        const mediaBySceneIndex = await this.sceneCompositor.prepareSceneMedia(
          tmpRoot,
          input.scenes,
        );
        const timelinePath = await this.sceneCompositor.composeTimeline({
          tmpRoot,
          avatarVideoPath: input.avatarVideoPath,
          scenes: input.scenes,
          targetDuration,
          settings,
          mediaBySceneIndex,
        });
        const fs = await import('node:fs/promises');
        await fs.copyFile(timelinePath, composed);
        layout = 'AVATAR_FULLSCREEN';
      } else {
        await this.composeVideo(ffmpeg.path, {
          avatarPath: input.avatarVideoPath,
          layout,
          settings,
          targetDuration,
          brollPath,
          outPath: composed,
        });

        if (await this.detectLikelyPillarbox(ffmpeg.path, composed)) {
          this.log.warn('Pillarbox detekován — přepínám na AVATAR_BLUR layout.');
          layout = 'AVATAR_BLUR';
          await this.composeVideo(ffmpeg.path, {
            avatarPath: input.avatarVideoPath,
            layout,
            settings,
            targetDuration,
            brollPath,
            outPath: composed,
          });
        }
      }

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
      await this.burnSubtitles(ffmpeg.path, composed, assPath, withSubs);

      const brandingNeeded =
        (input.logoPath && settings.branding.logoEnabled) ||
        (settings.watermark.enabled && settings.watermark.text.trim());

      let outputPath: string;
      if (brandingNeeded) {
        outputPath = await this.finalizeBranding({
          baseVideoPath: withSubs,
          voiceAudioPath: input.voiceAudioPath,
          musicFilePath: input.musicFilePath,
          logoPath: input.logoPath,
          settings,
          targetDuration,
          tmpRoot,
        });
      } else {
        outputPath = join(tmpRoot, 'final.mp4');
        await this.muxAudio(ffmpeg.path, {
          videoPath: withSubs,
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
      }

      const postcheck = await this.validator.validateOutputFile(outputPath, targetDuration);
      const warnings = [
        ...precheck.issues.filter((i) => i.severity === 'warning').map((i) => i.message),
        ...postcheck.issues.filter((i) => i.severity === 'warning').map((i) => i.message),
      ];

      return {
        outputPath,
        baseVideoPath: withSubs,
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

  /** Kompozice + titulky bez brandingu — pro uložení base masteru před branding krokem. */
  async renderBase(input: AiInfluencerRenderInput): Promise<AiInfluencerRenderResult> {
    const merged = mergeRenderSettings(input.settings);
    const withoutBranding: AiInfluencerRenderInput = {
      ...input,
      settings: {
        ...merged,
        branding: { ...merged.branding, logoEnabled: false },
        watermark: { ...merged.watermark, enabled: false },
      },
    };
    return this.render(withoutBranding);
  }

  async finalizeBranding(input: {
    baseVideoPath: string;
    voiceAudioPath: string;
    musicFilePath?: string | null;
    logoPath?: string | null;
    settings: AiInfluencerRenderSettings;
    targetDuration: number;
    tmpRoot: string;
  }): Promise<string> {
    const ffmpeg = resolveFfmpegBinary();
    if (!ffmpeg.path) throw new Error('ffmpeg není dostupný.');

    const withBranding = join(input.tmpRoot, 'with-branding.mp4');
    await this.applyBrandingOverlay(
      ffmpeg.path,
      input.baseVideoPath,
      input.logoPath ?? null,
      input.settings,
      withBranding,
      input.targetDuration,
    );

    const outputPath = join(input.tmpRoot, 'final.mp4');
    await this.muxAudio(ffmpeg.path, {
      videoPath: withBranding,
      voicePath: input.voiceAudioPath,
      musicPath: input.musicFilePath,
      settings: input.settings,
      targetDuration: input.targetDuration,
      outputPath,
    });

    const postcheck = await this.validator.validateOutputFile(outputPath, input.targetDuration);
    if (!postcheck.ok) {
      const msg = postcheck.issues.map((i) => i.message).join(' ');
      throw new Error(`Post-render validace selhala: ${msg}`);
    }
    return outputPath;
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

  async applyBrandingFromUrl(input: {
    baseVideoUrl: string;
    voiceAudioUrl: string;
    musicFilePath?: string | null;
    logoPath?: string | null;
    settings: AiInfluencerRenderSettings;
    scenes: ReelScenePlan[];
    hookText: string;
    spokenText?: string;
  }): Promise<AiInfluencerRenderResult> {
    const ffmpeg = resolveFfmpegBinary();
    if (!ffmpeg.path) {
      throw new Error('ffmpeg není dostupný — nelze dokončit branding AI Influencer Reelu.');
    }

    const settings = mergeRenderSettings(input.settings);
    const tmpRoot = join(tmpdir(), `ai-influencer-brand-${randomBytes(8).toString('hex')}`);
    await mkdir(tmpRoot, { recursive: true });

    try {
      const basePath = join(tmpRoot, 'base.mp4');
      const voicePath = join(tmpRoot, 'voice.mp3');
      await this.downloadToFile(input.baseVideoUrl, basePath);
      await this.downloadToFile(input.voiceAudioUrl, voicePath);
      const durationSec = await this.probeDuration(ffmpeg.path, voicePath);
      const targetDuration = Math.max(8, durationSec ?? 30);

      const withBranding = join(tmpRoot, 'with-branding.mp4');
      await this.applyBrandingOverlay(
        ffmpeg.path,
        basePath,
        input.logoPath ?? null,
        settings,
        withBranding,
        targetDuration,
      );

      const outputPath = join(tmpRoot, 'final.mp4');
      await this.muxAudio(ffmpeg.path, {
        videoPath: withBranding,
        voicePath,
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

      return {
        outputPath,
        baseVideoPath: basePath,
        tmpRoot,
        durationSec: targetDuration,
        layoutUsed: settings.layout === 'SMART_AUTO' ? 'AVATAR_BLUR' : settings.layout,
        validationWarnings: postcheck.issues
          .filter((i) => i.severity === 'warning')
          .map((i) => i.message),
      };
    } catch (err) {
      await rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
      throw err;
    }
  }

  async muxFinalFromBase(input: {
    baseVideoPath: string;
    voiceAudioPath: string;
    musicFilePath?: string | null;
    settings: AiInfluencerRenderSettings;
    targetDuration: number;
    tmpRoot: string;
  }): Promise<string> {
    const ffmpeg = resolveFfmpegBinary();
    if (!ffmpeg.path) throw new Error('ffmpeg není dostupný.');

    const outputPath = join(input.tmpRoot, 'final-unbranded.mp4');
    await this.muxAudio(ffmpeg.path, {
      videoPath: input.baseVideoPath,
      voicePath: input.voiceAudioPath,
      musicPath: input.musicFilePath,
      settings: input.settings,
      targetDuration: input.targetDuration,
      outputPath,
    });

    const postcheck = await this.validator.validateOutputFile(outputPath, input.targetDuration);
    if (!postcheck.ok) {
      const msg = postcheck.issues.map((i) => i.message).join(' ');
      throw new Error(`Post-render validace selhala: ${msg}`);
    }
    return outputPath;
  }

  /**
   * Produkčně bezpečný branding overlay — pouze format + overlay (žádný drawtext).
   */
  async renderBrandingOverlay(input: {
    baseVideoPath: string;
    logoPath: string | null;
    settings: AiInfluencerRenderSettings;
    outPath: string;
    duration: number;
    brandingPngPath?: string;
  }): Promise<{ outPath: string; brandingPngPath: string; filterGraphUsed: string }> {
    const ffmpeg = resolveFfmpegBinary();
    if (!ffmpeg.path) {
      throw new Error('ffmpeg není dostupný — nelze dokončit branding overlay.');
    }
    await this.logFfmpegCapabilitiesOnce(ffmpeg.path);

    const brandingPngPath =
      input.brandingPngPath ?? join(dirname(input.outPath), 'branding-overlay.png');
    if (!input.brandingPngPath) {
      const brandingPng = await renderAiInfluencerBrandingOverlayPng(input.settings, input.logoPath);
      await writeFile(brandingPngPath, brandingPng);
    }

    const filterGraph = SAFE_BRANDING_FILTER_GRAPH;
    await this.runFfmpeg(
      ffmpeg.path,
      [
        '-y',
        '-i',
        input.baseVideoPath,
        '-loop',
        '1',
        '-i',
        brandingPngPath,
        '-filter_complex',
        filterGraph,
        '-map',
        '[outv]',
        '-t',
        String(input.duration),
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        '20',
        '-pix_fmt',
        'yuv420p',
        '-an',
        input.outPath,
      ],
      {
        branding: true,
        outputPath: input.outPath,
        inputVideoPath: input.baseVideoPath,
        brandingFilePath: brandingPngPath,
        filterGraphUsed: filterGraph,
      },
    );

    return { outPath: input.outPath, brandingPngPath, filterGraphUsed: filterGraph };
  }

  private async burnSubtitles(
    ffmpegPath: string,
    composedPath: string,
    assPath: string,
    outPath: string,
  ): Promise<void> {
    const assEscaped = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    const assFilter = `ass='${assEscaped}',scale=${REEL_CANVAS_WIDTH}:${REEL_CANVAS_HEIGHT},setsar=1`;
    const scaleOnly = `scale=${REEL_CANVAS_WIDTH}:${REEL_CANVAS_HEIGHT},setsar=1`;
    const baseArgs = [
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
    ];

    const { code, stderr } = await runFfmpegCapture(ffmpegPath, [
      '-y',
      '-i',
      composedPath,
      '-vf',
      assFilter,
      ...baseArgs,
      outPath,
    ]);
    if (code === 0) return;

    const assFailure =
      stderr.toLowerCase().includes('filter not found') ||
      stderr.toLowerCase().includes('no such filter') ||
      stderr.toLowerCase().includes('ass');
    if (assFailure) {
      this.log.warn(
        `ASS titulky nedostupné, pokračuji bez vypálených titulků: ${stderr.slice(-300)}`,
      );
      await this.runFfmpeg(ffmpegPath, [
        '-y',
        '-i',
        composedPath,
        '-vf',
        scaleOnly,
        ...baseArgs,
        outPath,
      ]);
      return;
    }

    const classified = classifyFfmpegStderr(stderr, { outputPath: outPath });
    throw new FfmpegRenderError(classified);
  }

  private async logFfmpegCapabilitiesOnce(ffmpegPath: string): Promise<void> {
    if (this.ffmpegCapsLogged) return;
    this.ffmpegCapsLogged = true;
    const caps = await probeFfmpegCapabilities(ffmpegPath);
    this.log.log(
      `FFmpeg capabilities: version=${caps.version ?? 'unknown'} overlay=${caps.filters.overlay} scale=${caps.filters.scale} format=${caps.filters.format} ass=${caps.filters.ass} drawtext=${caps.filters.drawtext}`,
    );
    if (!caps.filters.overlay || !caps.filters.scale || !caps.filters.format) {
      this.log.warn(
        'FFmpeg postrádá základní filtry pro branding (overlay/scale/format) — zkontrolujte Railway image.',
      );
    }
  }

  private async applyBrandingOverlay(
    _ffmpegPath: string,
    videoPath: string,
    logoPath: string | null,
    settings: AiInfluencerRenderSettings,
    outPath: string,
    duration: number,
  ): Promise<void> {
    await this.renderBrandingOverlay({
      baseVideoPath: videoPath,
      logoPath,
      settings,
      outPath,
      duration,
    });
  }

  private async detectLikelyPillarbox(ffmpegPath: string, videoPath: string): Promise<boolean> {
    const framePath = join(dirname(videoPath), 'pillarbox-probe.jpg');
    const { code } = await runFfmpegCapture(ffmpegPath, [
      '-y',
      '-i',
      videoPath,
      '-frames:v',
      '1',
      '-q:v',
      '2',
      framePath,
    ]);
    if (code !== 0) return false;

    try {
      const { data, info } = await sharp(framePath)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const w = info.width;
      const h = info.height;
      if (!w || !h) return false;

      const sampleHeight = Math.max(8, Math.round(h * 0.08));
      const sampleWidth = Math.max(8, Math.round(w * 0.08));
      const isNearBlack = (r: number, g: number, b: number) => r < 24 && g < 24 && b < 24;

      let leftBlack = 0;
      let rightBlack = 0;
      let leftTotal = 0;
      let rightTotal = 0;

      for (let y = 0; y < h; y += 4) {
        for (let x = 0; x < sampleWidth; x += 4) {
          const idx = (y * w + x) * info.channels;
          leftTotal++;
          if (isNearBlack(data[idx], data[idx + 1], data[idx + 2])) leftBlack++;
        }
        for (let x = w - sampleWidth; x < w; x += 4) {
          const idx = (y * w + x) * info.channels;
          rightTotal++;
          if (isNearBlack(data[idx], data[idx + 1], data[idx + 2])) rightBlack++;
        }
      }

      const leftRatio = leftTotal ? leftBlack / leftTotal : 0;
      const rightRatio = rightTotal ? rightBlack / rightTotal : 0;
      return leftRatio > 0.88 && rightRatio > 0.88 && sampleWidth > w * 0.1;
    } catch {
      return false;
    }
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

  /** Normalizuje Video Agent master na 1080×1920 a volitelně přidá branding/hudbu (audio z agent videa). */
  async finalizeAgentMaster(input: {
    sourceVideoPath: string;
    outPath: string;
    logoPath?: string | null;
    settings: AiInfluencerRenderSettings;
    musicFilePath?: string | null;
    applyBranding: boolean;
  }): Promise<{ outputPath: string; durationSec: number }> {
    const ffmpeg = resolveFfmpegBinary();
    if (!ffmpeg.path) {
      throw Object.assign(new Error('ffmpeg není dostupný.'), { code: 'POSTPROCESS_FAILED' });
    }

    const tmpDir = dirname(input.outPath);
    const normalizedPath = join(tmpDir, 'agent-normalized.mp4');
    const W = REEL_CANVAS_WIDTH;
    const H = REEL_CANVAS_HEIGHT;

    await this.runFfmpeg(ffmpeg.path, [
      '-y',
      '-i',
      input.sourceVideoPath,
      '-vf',
      `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`,
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      normalizedPath,
    ]);

    const durationSec = Math.max(8, (await this.probeDuration(ffmpeg.path, normalizedPath)) ?? 30);
    const settings = mergeRenderSettings(input.settings);

    if (!input.applyBranding && !input.musicFilePath) {
      const fs = await import('node:fs/promises');
      await fs.copyFile(normalizedPath, input.outPath);
      const postcheck = await this.validator.validateOutputFile(input.outPath, durationSec);
      if (!postcheck.ok) {
        const msg = postcheck.issues.map((i) => i.message).join(' ');
        throw Object.assign(new Error(`Post-process validace selhala: ${msg}`), {
          code: 'POSTPROCESS_FAILED',
        });
      }
      return { outputPath: input.outPath, durationSec };
    }

    let videoPath = normalizedPath;
    if (input.applyBranding) {
      const brandedPath = join(tmpDir, 'agent-branded.mp4');
      await this.renderBrandingOverlay({
        baseVideoPath: normalizedPath,
        logoPath: input.logoPath ?? null,
        settings,
        outPath: brandedPath,
        duration: durationSec,
      });
      videoPath = brandedPath;
    }

    await this.muxAudio(ffmpeg.path, {
      videoPath,
      voicePath: normalizedPath,
      musicPath: input.musicFilePath,
      settings,
      targetDuration: durationSec,
      outputPath: input.outPath,
    });

    const postcheck = await this.validator.validateOutputFile(input.outPath, durationSec);
    if (!postcheck.ok) {
      const msg = postcheck.issues.map((i) => i.message).join(' ');
      throw Object.assign(new Error(`Post-process validace selhala: ${msg}`), { code: 'POSTPROCESS_FAILED' });
    }

    return { outputPath: input.outPath, durationSec };
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

  private async runFfmpeg(
    ffmpegPath: string,
    args: string[],
    context?: {
      branding?: boolean;
      outputPath?: string;
      inputVideoPath?: string;
      brandingFilePath?: string;
      filterGraphUsed?: string;
    },
  ): Promise<void> {
    const { code, stderr } = await runFfmpegCapture(ffmpegPath, args);
    if (code !== 0) {
      const filterGraphUsed =
        context?.filterGraphUsed ??
        args.find((a, i) => args[i - 1] === '-filter_complex') ??
        args.find((a, i) => args[i - 1] === '-vf') ??
        '';
      const diagnostics = await buildFfmpegDebugSnapshot({
        ffmpegPath,
        inputVideoPath: context?.inputVideoPath,
        brandingFilePath: context?.brandingFilePath,
        outputPath: context?.outputPath,
        filterGraphUsed: String(filterGraphUsed),
        stderr,
      });
      this.log.warn(
        `ffmpeg failed [${diagnostics.filterGraphUsed}]: ${diagnostics.stderrTail.slice(-500)}`,
      );
      const classified = classifyFfmpegStderr(stderr, {
        branding: context?.branding,
        outputPath: context?.outputPath,
      });
      throw new FfmpegRenderError(classified, diagnostics);
    }
  }
}
