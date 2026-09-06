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
    heygenVideoAgentSessionId:
      typeof o.heygenVideoAgentSessionId === 'string' ? o.heygenVideoAgentSessionId : undefined,
    heygenVideoAgentVideoId:
      typeof o.heygenVideoAgentVideoId === 'string' ? o.heygenVideoAgentVideoId : undefined,
    usedVideoAgentFallback: o.usedVideoAgentFallback === true,
    videoAgentMaster: o.videoAgentMaster === true,
    fallbackNotice: typeof o.fallbackNotice === 'string' ? o.fallbackNotice : undefined,
    videoAgentSubmittedAt:
      typeof o.videoAgentSubmittedAt === 'string' ? o.videoAgentSubmittedAt : undefined,
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

export function isVideoAgentErrorCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return code.startsWith('HEYGEN_VIDEO_AGENT_');
}

export type JobGenerationArtifacts = {
  voiceStorageUrl?: string | null;
  avatarExternalJobId?: string | null;
  baseMasterUrl?: string | null;
};

/** Odvodí generation mode u legacy jobů bez explicitního generationModeUsed. */
export function inferJobGenerationMode(
  meta: AiInfluencerJobRenderMeta,
  settings: Pick<AiInfluencerAutomationSettings, 'videoGenerationMode'>,
  artifacts: JobGenerationArtifacts = {},
): AiInfluencerVideoGenerationMode {
  if (meta.usedVideoAgentFallback) return 'AVATAR';
  if (meta.generationModeUsed === 'AVATAR' || meta.generationModeUsed === 'VIDEO_AGENT') {
    return meta.generationModeUsed;
  }
  if (meta.videoGenerationMode === 'AVATAR' || meta.videoGenerationMode === 'VIDEO_AGENT') {
    return meta.videoGenerationMode;
  }
  if (meta.videoAgentMaster || isVideoAgentExternalJobId(artifacts.avatarExternalJobId)) {
    return 'VIDEO_AGENT';
  }
  if (artifacts.voiceStorageUrl && !meta.videoAgentMaster) return 'AVATAR';
  return resolveVideoGenerationMode(settings);
}
