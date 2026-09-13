import type { AiInfluencerJobRenderMeta } from './ai-influencer.types';
import {
  parseVideoAgentSessionId,
  resolveJobProviderJobId,
} from './ai-influencer-video-agent.util';

export const VIDEO_AGENT_SUBMIT_TIMEOUT_MS = 45_000;
export const VIDEO_AGENT_SUBMIT_STALE_MS = 90_000;
export const VIDEO_AGENT_POLL_STALE_MS = 120_000;

export function hasPersistedVideoAgentProviderId(
  meta: AiInfluencerJobRenderMeta,
  avatarExternalJobId?: string | null,
): boolean {
  return Boolean(resolveJobProviderJobId(meta, avatarExternalJobId));
}

export function isVideoAgentSubmitInFlight(meta: AiInfluencerJobRenderMeta): boolean {
  return meta.videoAgentSubmitInFlight === true || meta.providerSubmitState === 'SUBMITTING';
}

export function isVideoAgentSubmitUnknown(meta: AiInfluencerJobRenderMeta): boolean {
  return meta.providerSubmitState === 'SUBMIT_UNKNOWN';
}

export function videoAgentSubmitStartedAtIso(meta: AiInfluencerJobRenderMeta): string | null {
  return meta.videoAgentSubmitStartedAt ?? meta.lastHeartbeatAt ?? null;
}

export function isVideoAgentSubmitStale(
  meta: AiInfluencerJobRenderMeta,
  staleMs = VIDEO_AGENT_SUBMIT_STALE_MS,
): boolean {
  if (!isVideoAgentSubmitInFlight(meta) && !isVideoAgentSubmitUnknown(meta)) return false;
  if (hasPersistedVideoAgentProviderId(meta)) return false;
  const startedAt = videoAgentSubmitStartedAtIso(meta);
  if (!startedAt) return true;
  const started = Date.parse(startedAt);
  if (!Number.isFinite(started)) return true;
  return Date.now() - started > staleMs;
}

export function isVideoAgentPollStale(
  meta: AiInfluencerJobRenderMeta,
  staleMs = VIDEO_AGENT_POLL_STALE_MS,
): boolean {
  if (!hasPersistedVideoAgentProviderId(meta)) return false;
  const lastPoll = meta.providerLastPolledAt ?? meta.videoAgentSubmittedAt;
  if (!lastPoll) return false;
  const ts = Date.parse(lastPoll);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts > staleMs;
}

export function shouldResumeVideoAgentPolling(
  meta: AiInfluencerJobRenderMeta,
  avatarExternalJobId?: string | null,
): boolean {
  return hasPersistedVideoAgentProviderId(meta, avatarExternalJobId);
}

export function shouldBlockVideoAgentResubmit(
  meta: AiInfluencerJobRenderMeta,
  avatarExternalJobId?: string | null,
): boolean {
  if (hasPersistedVideoAgentProviderId(meta, avatarExternalJobId)) return true;
  if (isVideoAgentSubmitInFlight(meta) && !isVideoAgentSubmitStale(meta)) return true;
  if (isVideoAgentSubmitUnknown(meta) && !isVideoAgentSubmitStale(meta)) return true;
  return false;
}

export function extractSessionIdForRecovery(
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
