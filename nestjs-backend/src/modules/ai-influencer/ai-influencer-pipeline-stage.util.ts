import { AiInfluencerReelJobStatus } from '@prisma/client';
import { HttpException } from '@nestjs/common';
import { FfmpegRenderError } from './ai-influencer-ffmpeg.util';

export type PipelineFailedStage =
  | 'SCRIPT'
  | 'STORYBOARD'
  | 'MEDIA'
  | 'VIDEO_AGENT'
  | 'DOWNLOAD'
  | 'POST_PROCESSING'
  | 'STORAGE'
  | 'PUBLISH'
  | 'BRANDING_RENDER'
  | 'RENDER'
  | 'VOICE'
  | 'AVATAR'
  | 'QUALITY';

export function extractPipelineErrorCode(err: unknown, fallback?: string | null): string | null {
  if (err instanceof FfmpegRenderError) return err.code;
  if (err && typeof err === 'object' && 'code' in err && (err as { code: unknown }).code) {
    return String((err as { code: unknown }).code);
  }
  if (err instanceof HttpException) {
    const response = err.getResponse();
    if (typeof response === 'object' && response && 'code' in response) {
      return String((response as { code: unknown }).code);
    }
  }
  const msg = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
  if (/openai je vypnuto|openai není|api klíč není nastaven|ai limit byl dosažen|tato ai funkce není povolena/i.test(msg)) {
    return 'AI_PROVIDER_DISABLED';
  }
  return fallback ?? null;
}

export function readPipelineStage(err: unknown): PipelineFailedStage | null {
  if (err && typeof err === 'object' && 'pipelineStage' in err) {
    const stage = String((err as { pipelineStage: unknown }).pipelineStage ?? '').trim();
    if (stage) return stage as PipelineFailedStage;
  }
  return null;
}

/** Určí failedStage podle skutečné pipeline fáze — nikdy nesmí script chybu mapovat na RENDER. */
export function resolvePipelineFailedStage(input: {
  jobStatus: AiInfluencerReelJobStatus;
  error?: unknown;
  message: string;
  errorCode?: string | null;
}): PipelineFailedStage {
  const explicit = readPipelineStage(input.error);
  if (explicit) return explicit;

  const code = (input.errorCode ?? extractPipelineErrorCode(input.error))?.toUpperCase() ?? '';
  const msg = input.message.toLowerCase();

  if (
    code === 'SCRIPT_PROVIDER_DISABLED' ||
    code === 'OPENAI_DISABLED' ||
    code === 'AI_PROVIDER_DISABLED' ||
    code === 'SCRIPT_GENERATION_FAILED'
  ) {
    return 'SCRIPT';
  }

  if (
    /openai je vypnuto|openai není|api klíč není nastaven|ai limit byl dosažen|tato ai funkce není povolena|není dostupný aktivní ai provider|script provider|ai generování scénáře není povoleno/i.test(
      msg,
    )
  ) {
    return 'SCRIPT';
  }

  if (code.startsWith('HEYGEN_VIDEO_AGENT_') || code === 'VIDEO_AGENT_FAILED' || /video agent/i.test(msg)) {
    if (code.includes('DOWNLOAD') || /download|stah/i.test(msg)) return 'DOWNLOAD';
    if (code.includes('PROCESSING') || /processing|generuje/i.test(msg)) return 'VIDEO_AGENT';
    if (code.includes('SUBMIT') || /submit|odesíl/i.test(msg)) return 'VIDEO_AGENT';
    return 'VIDEO_AGENT';
  }

  if (
    code.startsWith('ELEVENLABS_') ||
    /elevenlabs|eleven.?labs/i.test(msg) ||
    (/voice-over|vyberte hlas|api key není nakonfigurován/i.test(msg) && !/heygen/i.test(msg))
  ) {
    return 'VOICE';
  }

  if (/heygen|avatar provider|avatar není/i.test(msg) || code.startsWith('HEYGEN_')) {
    return 'AVATAR';
  }

  if (/storyboard/i.test(msg) || code === 'STORYBOARD_INVALID' || code === 'STORYBOARD_FAILED') {
    return 'STORYBOARD';
  }

  if (/media|média|scene media/i.test(msg) || code === 'MEDIA_PREPARATION_FAILED') {
    return 'MEDIA';
  }

  if (/branding|watermark|logo|drawtext/i.test(msg) || code === 'BRANDING_FAILED' || code === 'WATERMARK_FAILED') {
    return 'BRANDING_RENDER';
  }

  if (code === 'RENDER_INPUT_MISSING') {
    if (/video agent master/i.test(msg)) return 'VIDEO_AGENT';
    return 'RENDER';
  }

  if (/cloudinary|storage|upload master|uklád/i.test(msg) || code === 'STORAGE_FAILED') {
    return 'STORAGE';
  }

  if (/post.?process|finalize|mux/i.test(msg) || code === 'POSTPROCESS_FAILED') {
    return 'POST_PROCESSING';
  }

  if (/ffmpeg|render|mux|media composition/i.test(msg)) {
    return 'POST_PROCESSING';
  }

  if (code === 'QUALITY_REVIEW_REQUIRED') {
    return 'QUALITY';
  }

  if (/publish|facebook|instagram|youtube|portal/i.test(msg)) {
    return 'PUBLISH';
  }

  switch (input.jobStatus) {
    case AiInfluencerReelJobStatus.EVALUATING:
    case AiInfluencerReelJobStatus.CANDIDATE:
    case AiInfluencerReelJobStatus.SCRIPT_GENERATING:
    case AiInfluencerReelJobStatus.SCRIPT_READY:
      return 'SCRIPT';
    case AiInfluencerReelJobStatus.VOICE_GENERATING:
    case AiInfluencerReelJobStatus.VOICE_READY:
      return 'VOICE';
    case AiInfluencerReelJobStatus.AVATAR_GENERATING:
      return 'VIDEO_AGENT';
    case AiInfluencerReelJobStatus.AVATAR_READY:
      return 'POST_PROCESSING';
    case AiInfluencerReelJobStatus.RENDERING:
      return /branding|watermark|logo|drawtext|filter/i.test(msg) ? 'BRANDING_RENDER' : 'POST_PROCESSING';
    case AiInfluencerReelJobStatus.PUBLISHING:
      return 'PUBLISH';
    default:
      return 'SCRIPT';
  }
}

export function pipelineError(
  message: string,
  code: string,
  pipelineStage: PipelineFailedStage,
): Error {
  return Object.assign(new Error(message), { code, pipelineStage });
}
