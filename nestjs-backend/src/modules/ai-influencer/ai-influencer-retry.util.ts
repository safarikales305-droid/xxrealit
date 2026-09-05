import { AiInfluencerReelJobStatus } from '@prisma/client';

export type RetryJobArtifacts = {
  spokenText?: string | null;
  voiceStorageUrl?: string | null;
  avatarStorageUrl?: string | null;
  avatarExternalJobId?: string | null;
};

/** Určí stav, od kterého má retry pokračovat — bez zbytečného přegenerování artefaktů. */
export function resumeJobStatus(
  status: AiInfluencerReelJobStatus,
  failedStage: string | null,
  artifacts: RetryJobArtifacts,
): AiInfluencerReelJobStatus {
  if (failedStage === 'VOICE') return AiInfluencerReelJobStatus.VOICE_GENERATING;
  if (failedStage === 'AVATAR') {
    return artifacts.avatarExternalJobId
      ? AiInfluencerReelJobStatus.AVATAR_GENERATING
      : AiInfluencerReelJobStatus.VOICE_READY;
  }
  if (failedStage === 'RENDER' || failedStage === 'BRANDING_RENDER') {
    return AiInfluencerReelJobStatus.AVATAR_READY;
  }
  if (failedStage === 'SCRIPT') {
    return artifacts.spokenText
      ? AiInfluencerReelJobStatus.SCRIPT_READY
      : AiInfluencerReelJobStatus.CANDIDATE;
  }
  if (failedStage === 'PUBLISH') return AiInfluencerReelJobStatus.READY;
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
