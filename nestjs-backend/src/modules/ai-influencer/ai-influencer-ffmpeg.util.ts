import { access, constants } from 'node:fs/promises';
import { dirname } from 'node:path';
import { runFfmpegCapture } from '../../lib/ffmpeg-run';

export type FfmpegErrorClassification = {
  code:
    | 'FFMPEG_FILTER_ERROR'
    | 'FFMPEG_INPUT_ERROR'
    | 'FFMPEG_OUTPUT_ERROR'
    | 'FFMPEG_CODEC_ERROR'
    | 'BRANDING_RENDER_ERROR'
    | 'BRANDING_FAILED'
    | 'WATERMARK_FAILED'
    | 'FFMPEG_ERROR';
  stage: 'BRANDING_RENDER' | 'COMPOSITING';
  message: string;
};

export type FfmpegDebugSnapshot = {
  ffmpegVersion: string | null;
  inputVideoExists: boolean;
  brandingFileExists: boolean;
  outputDirectoryExists: boolean;
  outputWritable: boolean;
  filterGraphUsed: string;
  stderrTail: string;
};

export class FfmpegRenderError extends Error {
  readonly code: FfmpegErrorClassification['code'];
  readonly stage: FfmpegErrorClassification['stage'];
  readonly diagnostics?: FfmpegDebugSnapshot;

  constructor(classification: FfmpegErrorClassification, diagnostics?: FfmpegDebugSnapshot) {
    super(classification.message);
    this.name = 'FfmpegRenderError';
    this.code = classification.code;
    this.stage = classification.stage;
    this.diagnostics = diagnostics;
  }
}

export function stderrTail(stderr: string, lines = 40): string {
  return stderr
    .split('\n')
    .slice(-lines)
    .join('\n')
    .trim();
}

export async function buildFfmpegDebugSnapshot(input: {
  ffmpegPath: string;
  inputVideoPath?: string;
  brandingFilePath?: string;
  outputPath?: string;
  filterGraphUsed: string;
  stderr: string;
}): Promise<FfmpegDebugSnapshot> {
  let ffmpegVersion: string | null = null;
  try {
    const { stderr } = await runFfmpegCapture(input.ffmpegPath, ['-hide_banner', '-version']);
    ffmpegVersion = stderr.split('\n').find((l) => l.startsWith('ffmpeg version')) ?? null;
  } catch {
    ffmpegVersion = null;
  }

  const fileOk = async (p?: string) => {
    if (!p?.trim()) return false;
    try {
      await access(p, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  };

  let outputWritable = false;
  let outputDirectoryExists = false;
  if (input.outputPath?.trim()) {
    const dir = dirname(input.outputPath);
    outputDirectoryExists = await fileOk(dir);
    try {
      await access(dir, constants.W_OK);
      outputWritable = true;
    } catch {
      outputWritable = false;
    }
  }

  return {
    ffmpegVersion,
    inputVideoExists: await fileOk(input.inputVideoPath),
    brandingFileExists: await fileOk(input.brandingFilePath),
    outputDirectoryExists,
    outputWritable,
    filterGraphUsed: input.filterGraphUsed,
    stderrTail: stderrTail(input.stderr),
  };
}

export function classifyFfmpegStderr(
  stderr: string,
  context?: { outputPath?: string; branding?: boolean },
): FfmpegErrorClassification {
  const s = stderr.toLowerCase();
  const branding = context?.branding === true;

  if (
    s.includes('filter not found') ||
    s.includes('no such filter') ||
    s.includes('error initializing a simple filtergraph')
  ) {
    return {
      code: branding ? 'WATERMARK_FAILED' : 'FFMPEG_FILTER_ERROR',
      stage: branding ? 'BRANDING_RENDER' : 'COMPOSITING',
      message: branding
        ? 'FFmpeg filter není dostupný při brandingu videa (watermark/logo).'
        : 'FFmpeg filter není dostupný při kompozici videa.',
    };
  }

  if (s.includes('error opening input') || s.includes('no such file') || s.includes('invalid data found')) {
    return {
      code: 'FFMPEG_INPUT_ERROR',
      stage: branding ? 'BRANDING_RENDER' : 'COMPOSITING',
      message: 'FFmpeg nemůže načíst vstupní soubor.',
    };
  }

  if (
    s.includes('error opening output') ||
    (context?.outputPath && s.includes(context.outputPath.toLowerCase()))
  ) {
    return {
      code: 'FFMPEG_OUTPUT_ERROR',
      stage: branding ? 'BRANDING_RENDER' : 'COMPOSITING',
      message: 'FFmpeg nemůže zapsat výstupní soubor.',
    };
  }

  if (s.includes('unknown encoder') || (s.includes('codec') && s.includes('not found'))) {
    return {
      code: 'FFMPEG_CODEC_ERROR',
      stage: branding ? 'BRANDING_RENDER' : 'COMPOSITING',
      message: 'FFmpeg codec není dostupný.',
    };
  }

  if (branding) {
    return {
      code: 'BRANDING_RENDER_ERROR',
      stage: 'BRANDING_RENDER',
      message: 'Branding videa selhal při FFmpeg renderu.',
    };
  }

  return {
    code: 'FFMPEG_ERROR',
    stage: 'COMPOSITING',
    message: 'FFmpeg render selhal.',
  };
}

/** Bezpečný branding overlay — pouze format + overlay (+ volitelný scale). */
export const SAFE_BRANDING_FILTER_GRAPH = `[1:v]format=rgba[brand];[0:v][brand]overlay=0:0[outv]`;
