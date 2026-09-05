import { AiInfluencerReelJobStatus } from '@prisma/client';

export type RetryJobArtifacts = {
  spokenText?: string | null;
  voiceStorageUrl?: string | null;
  avatarStorageUrl?: string | null;
  avatarExternalJobId?: string | null;
};

/** Opraví chybný failedStage u starších jobů podle errorCode / errorMessage. */
export function resolveFailedStage(
  failedStage: string | null,
  errorMessage?: string | null,
  errorCode?: string | null,
): string | null {
  const msg = (errorMessage ?? '').toLowerCase();
  const code = (errorCode ?? '').toUpperCase();

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
  if (/ffmpeg|render|mux|media composition/i.test(msg)) {
    return 'RENDER';
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
  if (stage === 'VOICE') return AiInfluencerReelJobStatus.VOICE_GENERATING;
  if (stage === 'AVATAR') {
    return artifacts.avatarExternalJobId
      ? AiInfluencerReelJobStatus.AVATAR_GENERATING
      : AiInfluencerReelJobStatus.VOICE_READY;
  }
  if (stage === 'RENDER' || stage === 'BRANDING_RENDER') {
    return AiInfluencerReelJobStatus.AVATAR_READY;
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
    if (artifacts.avatarStorageUrl) return AiInfluencerReelJobStatus.AVATAR_READY;
    if (artifacts.avatarExternalJobId) return AiInfluencerReelJobStatus.AVATAR_GENERATING;
    return AiInfluencerReelJobStatus.VOICE_READY;
  }
  if (status === AiInfluencerReelJobStatus.FAILED && artifacts.spokenText) {
    return AiInfluencerReelJobStatus.SCRIPT_READY;
  }
  return AiInfluencerReelJobStatus.CANDIDATE;
}
