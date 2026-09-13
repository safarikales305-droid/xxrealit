import type { AiInfluencerJobRenderMeta } from './ai-influencer.types';
import { readJobRenderMeta } from './ai-influencer-video-agent.util';

export type AiInfluencerSourceMode = 'AUTO' | 'MANUAL' | 'TEST' | 'RETRY';

type SourceModeJobFields = {
  isTest?: boolean;
  forceOverride?: boolean;
  renderSettingsJson?: unknown;
};

export function resolveSourceMode(job: SourceModeJobFields): AiInfluencerSourceMode {
  const meta = readJobRenderMeta(job.renderSettingsJson);
  if (
    meta.sourceMode === 'AUTO' ||
    meta.sourceMode === 'MANUAL' ||
    meta.sourceMode === 'TEST' ||
    meta.sourceMode === 'RETRY'
  ) {
    return meta.sourceMode;
  }
  if (job.isTest) return 'TEST';
  if (job.forceOverride) return 'MANUAL';
  return 'AUTO';
}

export function bypassesQualityGate(job: SourceModeJobFields): boolean {
  const meta = readJobRenderMeta(job.renderSettingsJson);
  if (meta.bypassQualityGate === true) return true;
  const mode = resolveSourceMode(job);
  return (
    mode === 'MANUAL' ||
    mode === 'TEST' ||
    mode === 'RETRY' ||
    job.forceOverride === true ||
    job.isTest === true
  );
}

export function bypassesDuplicateGate(job: SourceModeJobFields): boolean {
  return bypassesQualityGate(job);
}

export function buildSourceModeMeta(
  sourceMode: AiInfluencerSourceMode,
  extra?: Partial<AiInfluencerJobRenderMeta>,
): Partial<AiInfluencerJobRenderMeta> {
  const bypassQualityGate =
    sourceMode === 'MANUAL' || sourceMode === 'TEST' || sourceMode === 'RETRY';
  return {
    sourceMode,
    bypassQualityGate,
    automaticRequested: sourceMode === 'AUTO',
    manualRequested: sourceMode === 'MANUAL' || sourceMode === 'RETRY',
    ...extra,
  };
}

export function isWorkerQueuedJob(job: {
  status: string;
  progressPercent: number;
  renderSettingsJson?: unknown;
}): boolean {
  if (job.status !== 'EVALUATING') return false;
  if (job.progressPercent > 10) return false;
  const meta = readJobRenderMeta(job.renderSettingsJson);
  return !meta.claimedAt;
}

export function isWorkerClaimedJob(job: {
  status: string;
  progressPercent: number;
  renderSettingsJson?: unknown;
}): boolean {
  const meta = readJobRenderMeta(job.renderSettingsJson);
  if (meta.claimedAt) return true;
  if (job.status === 'EVALUATING' && job.progressPercent > 10) return true;
  return job.status !== 'EVALUATING' && job.status !== 'SCRIPT_READY';
}
