import type { AiInfluencerReelJobStatus } from '@prisma/client';
import { resolveFailedStage } from './ai-influencer-retry.util';
import {
  inferJobGenerationMode,
  readJobRenderMeta,
  resolveVideoGenerationMode,
  type JobGenerationArtifacts,
} from './ai-influencer-video-agent.util';
import type { AiInfluencerAutomationSettings, AiInfluencerVideoGenerationMode } from './ai-influencer.types';

export type JobErrorKind = 'NONE' | 'ACTIVE' | 'LEGACY_STALE';

export type JobAdminDisplay = {
  generationMode: AiInfluencerVideoGenerationMode;
  failedStageResolved: string | null;
  errorKind: JobErrorKind;
  displayErrorMessage: string | null;
  displayErrorCode: string | null;
  retryLabel: string;
  retryHint: string | null;
  hasMasterVideo: boolean;
  pipelineSteps: Array<{ key: string; label: string; state: 'done' | 'active' | 'pending' | 'failed' }>;
};

export type JobDisplayInput = {
  status: AiInfluencerReelJobStatus;
  failedStage?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  renderSettingsJson?: unknown;
  voiceStorageUrl?: string | null;
  avatarExternalJobId?: string | null;
  baseMasterUrl?: string | null;
  finalMasterUrl?: string | null;
  videoUrl?: string | null;
  progressPercent?: number;
  currentStep?: string | null;
};

/** Alias pro inferJobGenerationMode — kompatibilní resolver legacy jobů. */
export function resolveGenerationMode(
  meta: ReturnType<typeof readJobRenderMeta>,
  settings: Pick<AiInfluencerAutomationSettings, 'videoGenerationMode'>,
  artifacts: JobGenerationArtifacts = {},
): AiInfluencerVideoGenerationMode {
  return inferJobGenerationMode(meta, settings, artifacts);
}

function isStaleElevenLabsError(
  message: string | null | undefined,
  code: string | null | undefined,
  mode: AiInfluencerVideoGenerationMode,
  workerElevenConfigured: boolean,
): boolean {
  const msg = (message ?? '').toLowerCase();
  const c = (code ?? '').toUpperCase();
  const mentionsEleven =
    c.startsWith('ELEVENLABS_') ||
    c === 'ELEVENLABS_NOT_CONFIGURED' ||
    /elevenlabs|eleven.?labs|api key není nakonfigurován/i.test(msg);
  if (!mentionsEleven) return false;
  if (mode !== 'VIDEO_AGENT') return false;
  return workerElevenConfigured;
}

export function buildRetryLabel(
  mode: AiInfluencerVideoGenerationMode,
  failedStage: string | null,
  errorKind: JobErrorKind,
): string {
  if (errorKind === 'LEGACY_STALE') return 'Spustit znovu přes Video Agent';
  if (mode === 'VIDEO_AGENT') {
    if (failedStage === 'VIDEO_AGENT' || failedStage === 'RENDER') return 'Zkusit znovu Video Agent';
    if (failedStage === 'SCRIPT') return 'Zkusit znovu od scénáře';
    if (failedStage === 'PUBLISH') return 'Zkusit znovu publikovat';
    return 'Zkusit znovu Video Agent';
  }
  if (failedStage === 'VOICE') return 'Zkusit znovu od hlasu';
  if (failedStage === 'AVATAR') return 'Zkusit znovu od avataru';
  if (failedStage === 'RENDER' || failedStage === 'BRANDING_RENDER') return 'Zkusit znovu od renderu';
  if (failedStage === 'SCRIPT') return 'Zkusit znovu od scénáře';
  if (failedStage === 'PUBLISH') return 'Zkusit znovu publikovat';
  return 'Zkusit znovu';
}

function pipelineForMode(mode: AiInfluencerVideoGenerationMode) {
  if (mode === 'VIDEO_AGENT') {
    return [
      { key: 'SCRIPT', label: 'Scénář' },
      { key: 'STORYBOARD', label: 'Storyboard' },
      { key: 'MEDIA', label: 'Média' },
      { key: 'VIDEO_AGENT', label: 'Video Agent' },
      { key: 'POSTPROCESS', label: 'Post-processing' },
      { key: 'STORAGE', label: 'Storage' },
      { key: 'PUBLISH', label: 'Publikace' },
    ];
  }
  return [
    { key: 'SCRIPT', label: 'Scénář' },
    { key: 'VOICE', label: 'Hlas' },
    { key: 'AVATAR', label: 'Avatar' },
    { key: 'RENDER', label: 'Render' },
    { key: 'STORAGE', label: 'Storage' },
    { key: 'PUBLISH', label: 'Publikace' },
  ];
}

function stepIndex(status: AiInfluencerReelJobStatus, mode: AiInfluencerVideoGenerationMode): number {
  const mapVideoAgent: Partial<Record<AiInfluencerReelJobStatus, number>> = {
    EVALUATING: 0,
    CANDIDATE: 0,
    SCRIPT_GENERATING: 0,
    SCRIPT_READY: 1,
    VOICE_GENERATING: 2,
    VOICE_READY: 2,
    AVATAR_GENERATING: 3,
    AVATAR_READY: 4,
    RENDERING: 5,
    READY: 6,
    PUBLISHING: 6,
    PUBLISHED: 6,
    PARTIALLY_PUBLISHED: 6,
  };
  const mapAvatar: Partial<Record<AiInfluencerReelJobStatus, number>> = {
    EVALUATING: 0,
    CANDIDATE: 0,
    SCRIPT_GENERATING: 0,
    SCRIPT_READY: 0,
    VOICE_GENERATING: 1,
    VOICE_READY: 1,
    AVATAR_GENERATING: 2,
    AVATAR_READY: 3,
    RENDERING: 4,
    READY: 5,
    PUBLISHING: 5,
    PUBLISHED: 5,
    PARTIALLY_PUBLISHED: 5,
  };
  return (mode === 'VIDEO_AGENT' ? mapVideoAgent : mapAvatar)[status] ?? -1;
}

export function buildJobAdminDisplay(
  job: JobDisplayInput,
  settings: Pick<AiInfluencerAutomationSettings, 'videoGenerationMode'>,
  options?: { workerElevenConfigured?: boolean },
): JobAdminDisplay {
  const meta = readJobRenderMeta(job.renderSettingsJson);
  const artifacts: JobGenerationArtifacts = {
    voiceStorageUrl: job.voiceStorageUrl,
    avatarExternalJobId: job.avatarExternalJobId,
    baseMasterUrl: job.baseMasterUrl,
  };
  const generationMode = resolveGenerationMode(meta, settings, artifacts);
  const failedStageResolved =
    resolveFailedStage(job.failedStage ?? null, job.errorMessage, job.errorCode) ?? job.failedStage ?? null;

  const stale = isStaleElevenLabsError(
    job.errorMessage,
    job.errorCode,
    generationMode,
    options?.workerElevenConfigured ?? false,
  );

  let errorKind: JobErrorKind = 'NONE';
  if (job.status === 'FAILED' && (job.errorMessage || job.errorCode)) {
    errorKind = stale ? 'LEGACY_STALE' : 'ACTIVE';
  }

  const displayErrorMessage =
    errorKind === 'LEGACY_STALE'
      ? 'Zastaralá chyba z dřívějšího avatar pipeline — ElevenLabs není pro Video Agent režim potřeba.'
      : job.errorMessage ?? null;

  const displayErrorCode = errorKind === 'LEGACY_STALE' ? 'LEGACY_STALE_ERROR' : job.errorCode ?? null;

  const hasMasterVideo = Boolean(
    job.finalMasterUrl?.trim() || job.baseMasterUrl?.trim() || job.videoUrl?.trim(),
  );

  const steps = pipelineForMode(generationMode);
  const current = stepIndex(job.status, generationMode);
  const failedIdx =
    job.status === 'FAILED' && failedStageResolved
      ? steps.findIndex((s) => s.key === failedStageResolved || s.key.startsWith(failedStageResolved))
      : -1;

  const pipelineSteps = steps.map((step, idx) => {
    if (job.status === 'FAILED' && idx === failedIdx) return { ...step, state: 'failed' as const };
    if (job.status === 'FAILED' && failedIdx >= 0 && idx < failedIdx) return { ...step, state: 'done' as const };
    if (current > idx) return { ...step, state: 'done' as const };
    if (current === idx && job.status !== 'FAILED') return { ...step, state: 'active' as const };
    return { ...step, state: 'pending' as const };
  });

  return {
    generationMode,
    failedStageResolved,
    errorKind,
    displayErrorMessage,
    displayErrorCode,
    retryLabel: buildRetryLabel(generationMode, failedStageResolved, errorKind),
    retryHint:
      errorKind === 'LEGACY_STALE'
        ? 'Job bude restartován přes HeyGen Video Agent bez ElevenLabs voice fáze.'
        : null,
    hasMasterVideo,
    pipelineSteps,
  };
}
