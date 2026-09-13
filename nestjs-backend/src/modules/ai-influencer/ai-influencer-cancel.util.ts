import { AiInfluencerReelJobStatus } from '@prisma/client';
import type { AiInfluencerJobRenderMeta } from './ai-influencer.types';
import { hasPersistedVideoAgentProviderId } from './ai-influencer-video-agent-persist.util';

export type AiInfluencerCancelPhase =
  | 'CANCEL_REQUESTED'
  | 'CANCELLING'
  | 'CANCELLED'
  | 'CANCELLED_PROVIDER_CONTINUES';

export function isProviderSubmittedForCancel(
  meta: AiInfluencerJobRenderMeta,
  avatarExternalJobId?: string | null,
): boolean {
  if (hasPersistedVideoAgentProviderId(meta, avatarExternalJobId)) return true;
  if (meta.providerSubmitState === 'SUBMITTED' || meta.providerSubmitState === 'COMPLETED') {
    return true;
  }
  return Boolean(meta.videoAgentSubmittedAt || meta.providerSubmitStartedAt);
}

export function isJobCancelledState(
  status: AiInfluencerReelJobStatus | string,
  meta: AiInfluencerJobRenderMeta,
): boolean {
  if (status === AiInfluencerReelJobStatus.CANCELLED) return true;
  const phase = meta.cancelPhase;
  return phase === 'CANCELLED' || phase === 'CANCELLED_PROVIDER_CONTINUES';
}

export function shouldSkipPipelineForCancel(
  status: AiInfluencerReelJobStatus | string,
  meta: AiInfluencerJobRenderMeta,
): boolean {
  if (isJobCancelledState(status, meta)) return true;
  return meta.cancelPhase === 'CANCEL_REQUESTED' || meta.cancelPhase === 'CANCELLING';
}

export function shouldBlockAutoPublish(meta: AiInfluencerJobRenderMeta): boolean {
  return meta.autoPublish === false || shouldSkipPipelineForCancel('READY', meta);
}

export function cancelStepLabel(
  phase: AiInfluencerCancelPhase,
  providerSubmitted: boolean,
): string {
  if (phase === 'CANCELLED_PROVIDER_CONTINUES') {
    return 'Zrušeno (HeyGen může pokračovat)';
  }
  if (providerSubmitted) {
    return 'Rušení výroby…';
  }
  return 'Zrušeno';
}
