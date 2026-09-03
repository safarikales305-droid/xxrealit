import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { resolveFfmpegBinary } from '../../lib/ffmpeg-binary';
import { runFfmpegCapture } from '../../lib/ffmpeg-run';
import {
  REEL_CANVAS_HEIGHT,
  REEL_CANVAS_WIDTH,
  type AiInfluencerCompositorInput,
  type RenderValidationIssue,
  type RenderValidationResult,
} from './ai-influencer-render.types';
import { AiInfluencerSubtitleService } from './ai-influencer-subtitle.service';

@Injectable()
export class AiInfluencerRenderValidatorService {
  constructor(private readonly subtitles: AiInfluencerSubtitleService) {}

  async validateBeforeRender(input: AiInfluencerCompositorInput): Promise<RenderValidationResult> {
    const issues: RenderValidationIssue[] = [];

    if (!input.avatarVideoPath) {
      issues.push({ code: 'MISSING_AVATAR', message: 'Chybí avatar video.', severity: 'error' });
    }
    if (!input.voiceAudioPath) {
      issues.push({ code: 'MISSING_VOICE', message: 'Chybí voice audio.', severity: 'error' });
    }

    const ffmpeg = resolveFfmpegBinary();
    if (!ffmpeg.path) {
      issues.push({ code: 'FFMPEG_MISSING', message: 'ffmpeg není dostupný.', severity: 'error' });
    } else if (input.avatarVideoPath) {
      const dims = await this.probeVideoDimensions(ffmpeg.path, input.avatarVideoPath);
      if (!dims) {
        issues.push({
          code: 'AVATAR_PROBE_FAILED',
          message: 'Nelze načíst rozměry avatar videa.',
          severity: 'error',
        });
      }
    }

    const duration = await this.probeAudioDuration(input.voiceAudioPath);
    if (!duration || duration < 3) {
      issues.push({
        code: 'VOICE_TOO_SHORT',
        message: 'Voice audio je příliš krátké nebo chybí.',
        severity: 'error',
      });
    }

    const cues = this.subtitles.buildCues(
      input.scenes,
      duration ?? 30,
      input.hookText,
      input.spokenText,
      input.settings.subtitles,
    );
    const duplicateTexts = this.findDuplicateCaptionTexts(cues);
    if (duplicateTexts.length) {
      issues.push({
        code: 'DUPLICATE_CAPTIONS',
        message: `Duplicitní titulky: ${duplicateTexts.slice(0, 2).join('; ')}`,
        severity: 'error',
      });
    }

    for (const cue of cues) {
      const lineCount = cue.text.split('\\N').length;
      if (lineCount > input.settings.subtitles.maxLines) {
        issues.push({
          code: 'SUBTITLE_OVERFLOW',
          message: 'Titulky přesahují max. počet řádků.',
          severity: 'error',
        });
        break;
      }
    }

    return { ok: !issues.some((i) => i.severity === 'error'), issues };
  }

  async validateOutputFile(
    outputPath: string,
    expectedDurationSec?: number | null,
  ): Promise<RenderValidationResult> {
    const issues: RenderValidationIssue[] = [];
    const ffmpeg = resolveFfmpegBinary();
    if (!ffmpeg.path) {
      return {
        ok: false,
        issues: [{ code: 'FFMPEG_MISSING', message: 'ffmpeg není dostupný.', severity: 'error' }],
      };
    }

    const dims = await this.probeVideoDimensions(ffmpeg.path, outputPath);
    if (!dims || dims.width !== REEL_CANVAS_WIDTH || dims.height !== REEL_CANVAS_HEIGHT) {
      issues.push({
        code: 'INVALID_CANVAS',
        message: `Výstup není ${REEL_CANVAS_WIDTH}x${REEL_CANVAS_HEIGHT} (je ${dims?.width ?? '?'}x${dims?.height ?? '?'}).`,
        severity: 'error',
      });
    }

    const codec = await this.probeVideoCodec(ffmpeg.path, outputPath);
    if (codec && !codec.includes('h264')) {
      issues.push({
        code: 'INVALID_CODEC',
        message: `Video codec není H.264 (${codec}).`,
        severity: 'error',
      });
    }

    if (expectedDurationSec && dims) {
      const dur = await this.probeVideoDuration(ffmpeg.path, outputPath);
      if (dur && Math.abs(dur - expectedDurationSec) > 2) {
        issues.push({
          code: 'DURATION_MISMATCH',
          message: 'Délka výstupního videa neodpovídá voice tracku.',
          severity: 'warning',
        });
      }
    }

    const buf = await readFile(outputPath).catch(() => null);
    if (!buf?.length) {
      issues.push({ code: 'EMPTY_OUTPUT', message: 'Výstupní soubor je prázdný.', severity: 'error' });
    }

    return { ok: !issues.some((i) => i.severity === 'error'), issues };
  }

  private findDuplicateCaptionTexts(cues: Array<{ text: string }>): string[] {
    const seen = new Map<string, number>();
    const dupes: string[] = [];
    for (const cue of cues) {
      const norm = cue.text.replace(/\\N/g, ' ').trim().toLowerCase();
      seen.set(norm, (seen.get(norm) ?? 0) + 1);
      if ((seen.get(norm) ?? 0) > 1) dupes.push(norm.slice(0, 60));
    }
    return dupes;
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

  private async probeVideoCodec(ffmpegPath: string, filePath: string): Promise<string | null> {
    const { stderr } = await runFfmpegCapture(ffmpegPath, ['-i', filePath]);
    const match = stderr.match(/Video:\s*(\w+)/i);
    return match?.[1]?.toLowerCase() ?? null;
  }

  private async probeVideoDuration(ffmpegPath: string, filePath: string): Promise<number | null> {
    const { stderr } = await runFfmpegCapture(ffmpegPath, ['-i', filePath]);
    const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!match) return null;
    return (
      Number.parseInt(match[1], 10) * 3600 +
      Number.parseInt(match[2], 10) * 60 +
      Number.parseFloat(match[3])
    );
  }

  private async probeAudioDuration(filePath?: string): Promise<number | null> {
    if (!filePath) return null;
    const ffmpeg = resolveFfmpegBinary();
    if (!ffmpeg.path) return null;
    return this.probeVideoDuration(ffmpeg.path, filePath);
  }
}
