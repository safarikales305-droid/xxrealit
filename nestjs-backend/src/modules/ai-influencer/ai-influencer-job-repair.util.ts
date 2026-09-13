import { AiInfluencerReelJobStatus } from '@prisma/client';
import type { AiInfluencerJobRenderMeta } from './ai-influencer.types';
import { hasMasterVideoAsset } from './ai-influencer-job-status.util';
import { hasPersistedVideoAgentProviderId } from './ai-influencer-video-agent-persist.util';

export const REPAIR_SCRIPT_STALE_MS = 5 * 60 * 1000;
export const REPAIR_STORAGE_STALE_MS = 5 * 60 * 1000;
export const REPAIR_PROVIDER_POLL_STALE_MS = 15 * 60 * 1000;
export const REPAIR_PROVIDER_MAX_MS = 60 * 60 * 1000;
export const REPAIR_ORPHAN_NO_PROVIDER_MS = 30 * 60 * 1000;

export type StaleJobReason =
  | 'SCRIPT_STALE'
  | 'STORAGE_STALE'
  | 'PROVIDER_POLL_STALE'
  | 'PROVIDER_MAX_AGE'
  | 'ORPHAN_NO_PROVIDER'
  | 'DUPLICATE_ACTIVE';

export type StaleJobAssessment = {
  stale: boolean;
  reason: StaleJobReason | null;
  message: string | null;
};

type JobRepairFields = {
  status: AiInfluencerReelJobStatus | string;
  createdAt: Date;
  updatedAt: Date;
  lastAttemptAt?: Date | null;
  progressPercent?: number | null;
  currentStep?: string | null;
  avatarExternalJobId?: string | null;
  baseMasterUrl?: string | null;
  finalMasterUrl?: string | null;
  videoUrl?: string | null;
  avatarStorageUrl?: string | null;
};

function resolveHeartbeatIso(
  meta: AiInfluencerJobRenderMeta,
  job: JobRepairFields,
): string | null {
  return (
    meta.lastHeartbeatAt ??
    meta.providerLastPolledAt ??
    meta.claimedAt ??
    meta.productionStartedAt ??
    job.lastAttemptAt?.toISOString() ??
    job.updatedAt.toISOString()
  );
}

function heartbeatAgeMs(meta: AiInfluencerJobRenderMeta, job: JobRepairFields): number {
  const iso = resolveHeartbeatIso(meta, job);
  if (!iso) return Number.POSITIVE_INFINITY;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return Number.POSITIVE_INFINITY;
  return Date.now() - ts;
}

export function assessStaleActiveJob(
  job: JobRepairFields,
  meta: AiInfluencerJobRenderMeta,
): StaleJobAssessment {
  if (hasMasterVideoAsset(job)) {
    return { stale: false, reason: null, message: null };
  }

  const providerSubmitted = hasPersistedVideoAgentProviderId(meta, job.avatarExternalJobId);
  const pipelineStage = meta.pipelineStage ?? '';
  const step = job.currentStep ?? '';
  const storing =
    pipelineStage === 'STORING' ||
    pipelineStage === 'STORING_RETRY' ||
    pipelineStage === 'STORAGE_FAILED' ||
    step.includes('Ukládám do XXREALIT');

  if (storing && meta.storageStartedAt) {
    const storageAge = Date.now() - Date.parse(meta.storageStartedAt);
    if (Number.isFinite(storageAge) && storageAge > REPAIR_STORAGE_STALE_MS) {
      return {
        stale: true,
        reason: 'STORAGE_STALE',
        message: `Storage visí ${Math.round(storageAge / 60_000)} min`,
      };
    }
  }

  if (storing && !meta.storageStartedAt) {
    const age = Date.now() - job.updatedAt.getTime();
    if (age > REPAIR_STORAGE_STALE_MS) {
      return {
        stale: true,
        reason: 'STORAGE_STALE',
        message: `Storage krok bez heartbeat ${Math.round(age / 60_000)} min`,
      };
    }
  }

  const scriptStatuses: string[] = [
    AiInfluencerReelJobStatus.SCRIPT_GENERATING,
    AiInfluencerReelJobStatus.CANDIDATE,
    AiInfluencerReelJobStatus.EVALUATING,
    AiInfluencerReelJobStatus.VOICE_GENERATING,
    AiInfluencerReelJobStatus.RENDERING,
  ];
  if (scriptStatuses.includes(job.status) && heartbeatAgeMs(meta, job) > REPAIR_SCRIPT_STALE_MS) {
    return {
      stale: true,
      reason: 'SCRIPT_STALE',
      message: 'Pipeline fáze bez heartbeat',
    };
  }

  if (job.status === AiInfluencerReelJobStatus.AVATAR_GENERATING) {
    if (providerSubmitted) {
      const submittedAt = meta.videoAgentSubmittedAt ?? meta.providerSubmittedAt;
      if (submittedAt) {
        const providerAge = Date.now() - Date.parse(submittedAt);
        if (Number.isFinite(providerAge) && providerAge > REPAIR_PROVIDER_MAX_MS) {
          return {
            stale: true,
            reason: 'PROVIDER_MAX_AGE',
            message: `HeyGen processing ${Math.round(providerAge / 60_000)} min`,
          };
        }
      }
      const pollAge = meta.providerLastPolledAt
        ? Date.now() - Date.parse(meta.providerLastPolledAt)
        : Number.POSITIVE_INFINITY;
      if (pollAge > REPAIR_PROVIDER_POLL_STALE_MS && heartbeatAgeMs(meta, job) > REPAIR_PROVIDER_POLL_STALE_MS) {
        return {
          stale: true,
          reason: 'PROVIDER_POLL_STALE',
          message: 'HeyGen polling neběží',
        };
      }
    } else {
      const age = Date.now() - job.createdAt.getTime();
      if (age > REPAIR_ORPHAN_NO_PROVIDER_MS) {
        return {
          stale: true,
          reason: 'ORPHAN_NO_PROVIDER',
          message: 'Aktivní job bez provider ID',
        };
      }
    }
  }

  return { stale: false, reason: null, message: null };
}

export type AiInfluencerRepairReport = {
  ok: boolean;
  scanned: number;
  recovered: number;
  cancelled: number;
  completed: number;
  orphaned: number;
  duplicates: number;
  stale: number;
  newHeyGenCreateCalls: number;
  details: Array<{ jobId: string; outcome: string; message?: string }>;
};
