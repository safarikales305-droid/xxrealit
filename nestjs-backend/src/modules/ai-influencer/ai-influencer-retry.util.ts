import { AiInfluencerReelJobStatus } from '@prisma/client';

export type RetryJobArtifacts = {
  spokenText?: string | null;
  voiceStorageUrl?: string | null;
  avatarStorageUrl?: string | null;
  avatarExternalJobId?: string | null;
  baseMasterUrl?: string | null;
  generationMode?: 'VIDEO_AGENT' | 'AVATAR' | null;
};

/** Opraví chybný failedStage u starších jobů podle errorCode / errorMessage. */
export function resolveFailedStage(
  failedStage: string | null,
  errorMessage?: string | null,
  errorCode?: string | null,
): string | null {
  const msg = (errorMessage ?? '').toLowerCase();
  const code = (errorCode ?? '').toUpperCase();

  if (code === 'SCRIPT_PROVIDER_DISABLED' || code === 'OPENAI_DISABLED') {
    return 'SCRIPT';
  }

  if (
    code.startsWith('HEYGEN_VIDEO_AGENT_') ||
    code === 'VIDEO_AGENT_FAILED' ||
    /video agent/i.test(msg)
  ) {
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
  if (/script|scénář|storyboard/i.test(msg) && !/voice-over/i.test(msg)) {
    return 'SCRIPT';
  }
  if (/branding|watermark|logo|drawtext/i.test(msg) || code === 'BRANDING_FAILED' || code === 'WATERMARK_FAILED') {
    return 'BRANDING_RENDER';
  }
  if (code === 'RENDER_INPUT_MISSING') {
    if (/video agent master/i.test(msg)) return 'VIDEO_AGENT';
    if (/avatar nebo voice/i.test(msg)) return 'RENDER';
    return 'RENDER';
  }
  if (/ffmpeg|render|mux|media composition/i.test(msg)) {
    return 'RENDER';
  }
  if (code === 'QUALITY_REVIEW_REQUIRED') {
    return 'QUALITY';
  }
  if (/publish|facebook|instagram|youtube|portal/i.test(msg)) {
    return 'PUBLISH';
  }

  if (failedStage === 'RENDER' && /elevenlabs|api key není nakonfigurován|vyberte hlas/i.test(msg)) {
    return 'VOICE';
  }

  return failedStage;
}

/** Určí stav, od kterého má retry pokračovat — bez zbytečného přegenerování artefaktů. */
export function resumeJobStatus(
  status: AiInfluencerReelJobStatus,
  failedStage: string | null,
  artifacts: RetryJobArtifacts,
  errorMessage?: string | null,
  errorCode?: string | null,
): AiInfluencerReelJobStatus {
  const stage = resolveFailedStage(failedStage, errorMessage, errorCode);
  const mode = artifacts.generationMode ?? 'AVATAR';

  if (stage === 'VIDEO_AGENT') {
    if (artifacts.avatarExternalJobId) return AiInfluencerReelJobStatus.AVATAR_GENERATING;
    return AiInfluencerReelJobStatus.SCRIPT_READY;
  }
  if (stage === 'VOICE') {
    if (mode === 'VIDEO_AGENT') {
      if (artifacts.avatarExternalJobId) return AiInfluencerReelJobStatus.AVATAR_GENERATING;
      return AiInfluencerReelJobStatus.AVATAR_GENERATING;
    }
    return AiInfluencerReelJobStatus.VOICE_GENERATING;
  }
  if (stage === 'AVATAR') {
    return artifacts.avatarExternalJobId
      ? AiInfluencerReelJobStatus.AVATAR_GENERATING
      : AiInfluencerReelJobStatus.VOICE_READY;
  }
  if (stage === 'RENDER' || stage === 'BRANDING_RENDER') {
    if (mode === 'VIDEO_AGENT') {
      if (artifacts.baseMasterUrl) return AiInfluencerReelJobStatus.AVATAR_READY;
      if (artifacts.avatarExternalJobId) return AiInfluencerReelJobStatus.AVATAR_GENERATING;
      return AiInfluencerReelJobStatus.SCRIPT_READY;
    }
    return AiInfluencerReelJobStatus.AVATAR_READY;
  }
  if (stage === 'QUALITY') {
    return artifacts.avatarStorageUrl || artifacts.baseMasterUrl
      ? AiInfluencerReelJobStatus.AVATAR_READY
      : AiInfluencerReelJobStatus.SCRIPT_READY;
  }
  if (stage === 'SCRIPT') {
    return artifacts.spokenText
      ? AiInfluencerReelJobStatus.SCRIPT_READY
      : AiInfluencerReelJobStatus.CANDIDATE;
  }
  if (stage === 'PUBLISH') return AiInfluencerReelJobStatus.READY;
  if (
    status === AiInfluencerReelJobStatus.FAILED &&
    artifacts.spokenText &&
    artifacts.voiceStorageUrl
  ) {
    if (artifacts.avatarStorageUrl || artifacts.baseMasterUrl) {
      return AiInfluencerReelJobStatus.AVATAR_READY;
    }
    if (artifacts.avatarExternalJobId) return AiInfluencerReelJobStatus.AVATAR_GENERATING;
    return AiInfluencerReelJobStatus.VOICE_READY;
  }
  if (status === AiInfluencerReelJobStatus.FAILED && artifacts.spokenText) {
    return AiInfluencerReelJobStatus.SCRIPT_READY;
  }
  return AiInfluencerReelJobStatus.CANDIDATE;
}
