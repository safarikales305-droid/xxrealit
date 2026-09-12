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

export function extractPipelineErrorMessage(err: unknown, fallback = ''): string {
  if (err instanceof HttpException) {
    const response = err.getResponse();
    if (typeof response === 'string' && response.trim()) return response;
    if (typeof response === 'object' && response && 'message' in response) {
      const raw = (response as { message?: string | string[] }).message;
      if (Array.isArray(raw)) return raw.join(', ');
      if (typeof raw === 'string' && raw.trim()) return raw;
    }
  }
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = String((err as { message: unknown }).message ?? '').trim();
    if (
      msg &&
      msg !== 'Bad Request Exception' &&
      msg !== 'Forbidden Exception' &&
      msg !== 'Internal Server Error'
    ) {
      return msg;
    }
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback || String(err ?? 'Unknown error');
}

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
  const msg = extractPipelineErrorMessage(err).toLowerCase();
  if (/openai_api_key|openai není nakonfigurován|api klíč není nastaven/i.test(msg)) {
    return 'OPENAI_NOT_CONFIGURED';
  }
  if (/openai je vypnuto|ai limit byl dosažen|tato ai funkce není povolena/i.test(msg)) {
    return 'AI_PROVIDER_DISABLED';
  }
  if (/heygen_api_key|heygen api/i.test(msg) && /není nakonfigurován|missing|nastaven/i.test(msg)) {
    return 'HEYGEN_NOT_CONFIGURED';
  }
  if (/elevenlabs|xi_api_key/i.test(msg) && /není nakonfigurován|missing|nastaven/i.test(msg)) {
    return 'ELEVENLABS_NOT_CONFIGURED';
  }
  if (/cloudinary|storage|chybí cloudinary/i.test(msg)) {
    return 'STORAGE_FAILED';
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
    code === 'OPENAI_NOT_CONFIGURED' ||
    code === 'AI_PROVIDER_DISABLED' ||
    code === 'SCRIPT_GENERATION_FAILED'
  ) {
    return 'SCRIPT';
  }

  if (
    /openai je vypnuto|openai_api_key|openai není nakonfigurován|api klíč není nastaven|není dostupný aktivní ai provider|ai provider není|script provider|ai generování scénáře/i.test(
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

  if (code === 'HEYGEN_AVATAR_JOB_ID_MISSING') {
    return 'AVATAR';
  }

  if (/chybí externí avatar job id/i.test(msg)) {
    return 'VIDEO_AGENT';
  }

  if (code === 'HEYGEN_NOT_CONFIGURED') {
    if (input.jobStatus === AiInfluencerReelJobStatus.VOICE_READY) return 'AVATAR';
    return 'VIDEO_AGENT';
  }

  if (
    code.startsWith('ELEVENLABS_') ||
    /elevenlabs|eleven.?labs/i.test(msg) ||
    (/voice-over|vyberte hlas|api key není nakonfigurován/i.test(msg) && !/heygen/i.test(msg))
  ) {
    return 'VOICE';
  }

  if (/heygen|avatar provider|avatar není/i.test(msg) || (code.startsWith('HEYGEN_') && !code.startsWith('HEYGEN_VIDEO_AGENT_') && code !== 'HEYGEN_NOT_CONFIGURED')) {
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
