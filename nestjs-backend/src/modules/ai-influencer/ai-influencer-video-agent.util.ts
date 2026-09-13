import type {
  AiInfluencerAutomationSettings,
  AiInfluencerJobRenderMeta,
  AiInfluencerVideoGenerationMode,
} from './ai-influencer.types';

export const VIDEO_AGENT_EXTERNAL_PREFIX = 'va:';

export function readJobRenderMeta(renderSettingsJson: unknown): AiInfluencerJobRenderMeta {
  if (!renderSettingsJson || typeof renderSettingsJson !== 'object') return {};
  const o = renderSettingsJson as Record<string, unknown>;
  const mode =
    o.videoGenerationMode === 'VIDEO_AGENT' || o.videoGenerationMode === 'AVATAR'
      ? o.videoGenerationMode
      : undefined;
  const generationModeUsed =
    o.generationModeUsed === 'VIDEO_AGENT' || o.generationModeUsed === 'AVATAR'
      ? o.generationModeUsed
      : undefined;
  return {
    videoGenerationMode: mode,
    generationModeUsed: generationModeUsed ?? mode,
    voiceEngine:
      o.voiceEngine === 'HEYGEN' || o.voiceEngine === 'ELEVENLABS' ? o.voiceEngine : undefined,
    providerJobType:
      o.providerJobType === 'VIDEO_AGENT' || o.providerJobType === 'AVATAR'
        ? o.providerJobType
        : undefined,
    providerJobId: typeof o.providerJobId === 'string' ? o.providerJobId : undefined,
    heygenVideoAgentSessionId:
      typeof o.heygenVideoAgentSessionId === 'string' ? o.heygenVideoAgentSessionId : undefined,
    heygenVideoAgentVideoId:
      typeof o.heygenVideoAgentVideoId === 'string' ? o.heygenVideoAgentVideoId : undefined,
    usedVideoAgentFallback: o.usedVideoAgentFallback === true,
    videoAgentMaster: o.videoAgentMaster === true,
    fallbackNotice: typeof o.fallbackNotice === 'string' ? o.fallbackNotice : undefined,
    videoAgentSubmittedAt:
      typeof o.videoAgentSubmittedAt === 'string' ? o.videoAgentSubmittedAt : undefined,
    videoAgentSubmitStartedAt:
      typeof o.videoAgentSubmitStartedAt === 'string' ? o.videoAgentSubmitStartedAt : undefined,
    videoAgentSubmitInFlight: o.videoAgentSubmitInFlight === true,
    providerSubmitState:
      o.providerSubmitState === 'SUBMITTING' ||
      o.providerSubmitState === 'SUBMITTED' ||
      o.providerSubmitState === 'SUBMIT_UNKNOWN' ||
      o.providerSubmitState === 'COMPLETED'
        ? o.providerSubmitState
        : undefined,
    providerStatus: typeof o.providerStatus === 'string' ? o.providerStatus : undefined,
    providerLastPolledAt:
      typeof o.providerLastPolledAt === 'string' ? o.providerLastPolledAt : undefined,
    providerCompletedAt:
      typeof o.providerCompletedAt === 'string' ? o.providerCompletedAt : undefined,
    generationAttemptId:
      typeof o.generationAttemptId === 'string' ? o.generationAttemptId : undefined,
    pronunciationRulesApplied:
      Array.isArray(o.pronunciationRulesApplied) ?
        (o.pronunciationRulesApplied as string[])
      : undefined,
    qualityMetrics:
      o.qualityMetrics && typeof o.qualityMetrics === 'object' ?
        (o.qualityMetrics as Record<string, unknown>)
      : undefined,
    isProductionTest: o.isProductionTest === true,
    testDurationSec: typeof o.testDurationSec === 'number' ? o.testDurationSec : undefined,
    testKind: o.testKind === 'FULL' || o.testKind === 'VIDEO_AGENT' ? o.testKind : undefined,
    useFixedTestScript: o.useFixedTestScript === true,
    providerOutputUrl: typeof o.providerOutputUrl === 'string' ? o.providerOutputUrl : undefined,
    videoArchived: o.videoArchived === true,
    archiveCompletedAt: typeof o.archiveCompletedAt === 'string' ? o.archiveCompletedAt : undefined,
    allowAvatarFallback:
      typeof o.allowAvatarFallback === 'boolean' ? o.allowAvatarFallback : undefined,
    manualPublishApproved: o.manualPublishApproved === true,
    manualPublishApprovedAt:
      typeof o.manualPublishApprovedAt === 'string' ? o.manualPublishApprovedAt : undefined,
    topicCandidateId: typeof o.topicCandidateId === 'string' ? o.topicCandidateId : undefined,
    topicCandidateApproved: o.topicCandidateApproved === true,
    manualPublishChannels: Array.isArray(o.manualPublishChannels)
      ? (o.manualPublishChannels as Array<'facebook' | 'instagram' | 'youtube' | 'portal'>)
      : undefined,
    originIsTest: o.originIsTest === true,
    sourceMode:
      o.sourceMode === 'AUTO' ||
      o.sourceMode === 'MANUAL' ||
      o.sourceMode === 'TEST' ||
      o.sourceMode === 'RETRY'
        ? o.sourceMode
        : undefined,
    bypassQualityGate: o.bypassQualityGate === true,
    automaticRequested: o.automaticRequested === true,
    manualRequested: o.manualRequested === true,
    manualRequestedAt: typeof o.manualRequestedAt === 'string' ? o.manualRequestedAt : undefined,
    claimedAt: typeof o.claimedAt === 'string' ? o.claimedAt : undefined,
    workerInstanceId: typeof o.workerInstanceId === 'string' ? o.workerInstanceId : undefined,
    productionStartedAt:
      typeof o.productionStartedAt === 'string' ? o.productionStartedAt : undefined,
    evaluationScore: typeof o.evaluationScore === 'number' ? o.evaluationScore : undefined,
    evaluationScoreWarning:
      typeof o.evaluationScoreWarning === 'string' ? o.evaluationScoreWarning : undefined,
    queueStalledAt: typeof o.queueStalledAt === 'string' ? o.queueStalledAt : undefined,
    queueWarning: typeof o.queueWarning === 'string' ? o.queueWarning : undefined,
    pipelineStage: typeof o.pipelineStage === 'string' ? o.pipelineStage : undefined,
    lastHeartbeatAt: typeof o.lastHeartbeatAt === 'string' ? o.lastHeartbeatAt : undefined,
    videoStyle:
      o.videoStyle === 'dynamic_influencer' ||
      o.videoStyle === 'real_estate_news' ||
      o.videoStyle === 'property_showcase' ||
      o.videoStyle === 'educational' ||
      o.videoStyle === 'auto'
        ? o.videoStyle
        : undefined,
    targetDurationSec: typeof o.targetDurationSec === 'number' ? o.targetDurationSec : undefined,
    avatarFrequency:
      o.avatarFrequency === 'low' || o.avatarFrequency === 'medium' || o.avatarFrequency === 'high'
        ? o.avatarFrequency
        : undefined,
  };
}

export function mergeJobRenderMeta(
  existing: unknown,
  patch: AiInfluencerJobRenderMeta,
): Record<string, unknown> {
  const base =
    existing && typeof existing === 'object' ? { ...(existing as Record<string, unknown>) } : {};
  return { ...base, ...patch };
}

export function resolveVideoGenerationMode(
  settings: Pick<AiInfluencerAutomationSettings, 'videoGenerationMode'>,
): AiInfluencerVideoGenerationMode {
  return settings.videoGenerationMode === 'AVATAR' ? 'AVATAR' : 'VIDEO_AGENT';
}

/** Immutable režim uložený ve snapshotu jobu — nesmí se odvozovat z artefaktů. */
export function getJobSnapshotGenerationMode(
  meta: AiInfluencerJobRenderMeta,
  settings: Pick<AiInfluencerAutomationSettings, 'videoGenerationMode'>,
): AiInfluencerVideoGenerationMode {
  if (meta.generationModeUsed === 'VIDEO_AGENT' || meta.generationModeUsed === 'AVATAR') {
    return meta.generationModeUsed;
  }
  if (meta.videoGenerationMode === 'VIDEO_AGENT' || meta.videoGenerationMode === 'AVATAR') {
    return meta.videoGenerationMode;
  }
  return resolveVideoGenerationMode(settings);
}

export function isAvatarFallbackAllowed(
  meta: AiInfluencerJobRenderMeta,
  settings: Pick<AiInfluencerAutomationSettings, 'allowVideoAgentFallback'>,
): boolean {
  if (meta.allowAvatarFallback === false) return false;
  if (meta.allowAvatarFallback === true) return true;
  return settings.allowVideoAgentFallback === true;
}

export function isVideoAgentExternalJobId(externalJobId: string | null | undefined): boolean {
  return Boolean(externalJobId?.startsWith(VIDEO_AGENT_EXTERNAL_PREFIX));
}

export function toVideoAgentExternalJobId(sessionId: string): string {
  return `${VIDEO_AGENT_EXTERNAL_PREFIX}${sessionId}`;
}

export function parseVideoAgentSessionId(externalJobId: string | null | undefined): string | null {
  if (!externalJobId?.startsWith(VIDEO_AGENT_EXTERNAL_PREFIX)) return null;
  return externalJobId.slice(VIDEO_AGENT_EXTERNAL_PREFIX.length) || null;
}

export function isActiveVideoAgentJob(meta: AiInfluencerJobRenderMeta): boolean {
  return meta.generationModeUsed === 'VIDEO_AGENT' && !meta.usedVideoAgentFallback;
}

export function videoAgentPollRatio(submittedAtIso: string | undefined): number {
  if (!submittedAtIso) return 0;
  const started = Date.parse(submittedAtIso);
  if (!Number.isFinite(started)) return 0;
  const elapsed = Date.now() - started;
  return Math.min(1, elapsed / (12 * 60 * 1000));
}

export function videoAgentTimedOut(submittedAtIso: string | undefined, timeoutMs = 20 * 60 * 1000): boolean {
  if (!submittedAtIso) return false;
  const started = Date.parse(submittedAtIso);
  if (!Number.isFinite(started)) return false;
  return Date.now() - started > timeoutMs;
}

/** Odvodí aktivní pipeline pro worker — respektuje snapshot a explicitní fallback. */
export function inferJobGenerationMode(
  meta: AiInfluencerJobRenderMeta,
  settings: Pick<AiInfluencerAutomationSettings, 'videoGenerationMode' | 'allowVideoAgentFallback'>,
  artifacts: JobGenerationArtifacts = {},
): AiInfluencerVideoGenerationMode {
  const snapshot = getJobSnapshotGenerationMode(meta, settings);
  if (snapshot === 'VIDEO_AGENT' && !meta.usedVideoAgentFallback) {
    return 'VIDEO_AGENT';
  }
  if (meta.usedVideoAgentFallback && isAvatarFallbackAllowed(meta, settings)) {
    return 'AVATAR';
  }
  if (meta.videoAgentMaster || isVideoAgentExternalJobId(artifacts.avatarExternalJobId)) {
    return 'VIDEO_AGENT';
  }
  return snapshot;
}

export type JobGenerationArtifacts = {
  voiceStorageUrl?: string | null;
  avatarExternalJobId?: string | null;
  baseMasterUrl?: string | null;
};

export function resolveJobProviderJobId(
  meta: AiInfluencerJobRenderMeta,
  avatarExternalJobId?: string | null,
): string | null {
  return (
    meta.providerJobId ??
    meta.heygenVideoAgentSessionId ??
    parseVideoAgentSessionId(avatarExternalJobId) ??
    null
  );
}

export function isVideoAgentErrorCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return code.startsWith('HEYGEN_VIDEO_AGENT_');
}
