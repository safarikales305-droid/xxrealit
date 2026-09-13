import { AiInfluencerReelJobStatus, Prisma } from '@prisma/client';

/** Jobs visible in admin „Výroba“ tab and counted as „Ve výrobě“. */
export const ACTIVE_JOB_STATUSES: AiInfluencerReelJobStatus[] = [
  AiInfluencerReelJobStatus.EVALUATING,
  AiInfluencerReelJobStatus.CANDIDATE,
  AiInfluencerReelJobStatus.SCRIPT_GENERATING,
  AiInfluencerReelJobStatus.SCRIPT_READY,
  AiInfluencerReelJobStatus.VOICE_GENERATING,
  AiInfluencerReelJobStatus.VOICE_READY,
  AiInfluencerReelJobStatus.AVATAR_GENERATING,
  AiInfluencerReelJobStatus.AVATAR_READY,
  AiInfluencerReelJobStatus.RENDERING,
  AiInfluencerReelJobStatus.PUBLISHING,
];

/** Worker continues advancing these (includes READY awaiting publish). */
export const WORKER_ACTIVE_STATUSES: AiInfluencerReelJobStatus[] = [
  ...ACTIVE_JOB_STATUSES,
  AiInfluencerReelJobStatus.READY,
];

export const GALLERY_VIDEO_STATUSES: AiInfluencerReelJobStatus[] = [
  AiInfluencerReelJobStatus.READY,
  AiInfluencerReelJobStatus.PUBLISHED,
  AiInfluencerReelJobStatus.PARTIALLY_PUBLISHED,
];

export const TERMINAL_JOB_STATUSES: AiInfluencerReelJobStatus[] = [
  AiInfluencerReelJobStatus.READY,
  AiInfluencerReelJobStatus.PUBLISHED,
  AiInfluencerReelJobStatus.PARTIALLY_PUBLISHED,
  AiInfluencerReelJobStatus.FAILED,
  AiInfluencerReelJobStatus.CANCELLED,
  AiInfluencerReelJobStatus.SKIPPED_QUALITY,
  AiInfluencerReelJobStatus.SKIPPED_DUPLICATE,
];

type VideoAssetFields = {
  finalMasterUrl?: string | null;
  baseMasterUrl?: string | null;
  videoUrl?: string | null;
  avatarStorageUrl?: string | null;
};

export function resolveMasterVideoUrl(job: VideoAssetFields): string | null {
  return (
    job.finalMasterUrl?.trim() ||
    job.baseMasterUrl?.trim() ||
    job.videoUrl?.trim() ||
    job.avatarStorageUrl?.trim() ||
    null
  );
}

export function hasMasterVideoAsset(job: VideoAssetFields): boolean {
  return Boolean(resolveMasterVideoUrl(job));
}

export function masterVideoAssetWhere(): Prisma.AiInfluencerReelJobWhereInput {
  return {
    OR: [
      { finalMasterUrl: { not: null } },
      { baseMasterUrl: { not: null } },
      { videoUrl: { not: null } },
    ],
  };
}

export function galleryVideoWhere(options?: { includeTest?: boolean }): Prisma.AiInfluencerReelJobWhereInput {
  return {
    ...(options?.includeTest ? {} : { isTest: false }),
    status: { in: GALLERY_VIDEO_STATUSES },
    ...masterVideoAssetWhere(),
  };
}

export function recentCompletedVideoWhere(): Prisma.AiInfluencerReelJobWhereInput {
  return {
    status: { in: GALLERY_VIDEO_STATUSES },
    ...masterVideoAssetWhere(),
  };
}

export function activeJobWhere(): Prisma.AiInfluencerReelJobWhereInput {
  return { status: { in: ACTIVE_JOB_STATUSES } };
}

/** Jobs waiting at the front of the pipeline (created, not yet advancing). */
export function queuedJobWhere(): Prisma.AiInfluencerReelJobWhereInput {
  return {
    OR: [
      {
        status: AiInfluencerReelJobStatus.EVALUATING,
        progressPercent: { lte: 10 },
      },
      { status: AiInfluencerReelJobStatus.SCRIPT_READY },
    ],
  };
}

export function isActiveGenerationStatus(status: AiInfluencerReelJobStatus | string): boolean {
  return ACTIVE_JOB_STATUSES.includes(status as AiInfluencerReelJobStatus);
}

export function isCompletedGenerationStatus(status: AiInfluencerReelJobStatus | string): boolean {
  return GALLERY_VIDEO_STATUSES.includes(status as AiInfluencerReelJobStatus);
}

export function isFailedGenerationStatus(status: AiInfluencerReelJobStatus | string): boolean {
  return (
    status === AiInfluencerReelJobStatus.FAILED ||
    status === AiInfluencerReelJobStatus.CANCELLED ||
    status === AiInfluencerReelJobStatus.SKIPPED_QUALITY ||
    status === AiInfluencerReelJobStatus.SKIPPED_DUPLICATE
  );
}

export function isQueuedGenerationStatus(status: AiInfluencerReelJobStatus | string): boolean {
  return (
    status === AiInfluencerReelJobStatus.EVALUATING ||
    status === AiInfluencerReelJobStatus.SCRIPT_READY
  );
}

/** @deprecated use isActiveGenerationStatus */
export function isActiveJobStatus(status: AiInfluencerReelJobStatus): boolean {
  return isActiveGenerationStatus(status);
}
