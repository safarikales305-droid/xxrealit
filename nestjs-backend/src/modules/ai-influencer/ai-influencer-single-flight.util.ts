import { AiInfluencerReelJobStatus, Prisma } from '@prisma/client';
import { ACTIVE_JOB_STATUSES, activeJobWhere } from './ai-influencer-job-status.util';

/** Globální lock — max 1 placená video generace současně. */
export const VIDEO_GENERATION_LOCK_STATUSES: AiInfluencerReelJobStatus[] = [
  ...ACTIVE_JOB_STATUSES,
];

export function videoGenerationLockWhere(
  excludeJobId?: string,
): Prisma.AiInfluencerReelJobWhereInput {
  return {
    ...activeJobWhere(),
    ...(excludeJobId ? { id: { not: excludeJobId } } : {}),
  };
}

export type ActiveVideoGenerationConflict = {
  activeJobId: string;
  status: AiInfluencerReelJobStatus;
  articleTitle: string | null;
  createdAt: Date;
};

export function buildVideoGenerationConflictBody(active: ActiveVideoGenerationConflict) {
  return {
    code: 'VIDEO_GENERATION_ALREADY_RUNNING' as const,
    activeJobId: active.activeJobId,
    activeJobStatus: active.status,
    message: 'Již probíhá výroba jiného videa.',
  };
}

/** Odhad HeyGen kreditů z délky videa (provider neposkytuje přesnou cenu před generací). */
export function estimateHeyGenCredits(durationSec: number): number {
  const minutes = Math.max(0.25, durationSec / 60);
  return Math.round(minutes * 10) / 10;
}

export function estimateHeyGenCostCzk(durationSec: number, costPerSecCzk: number): number {
  return Math.round(durationSec * costPerSecCzk * 100) / 100;
}
