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

export function galleryVideoWhere(): Prisma.AiInfluencerReelJobWhereInput {
  return {
    status: { in: GALLERY_VIDEO_STATUSES },
    OR: [
      { finalMasterUrl: { not: null } },
      { baseMasterUrl: { not: null } },
      { videoUrl: { not: null } },
      { avatarStorageUrl: { not: null } },
    ],
  };
}

export function activeJobWhere(): Prisma.AiInfluencerReelJobWhereInput {
  return { status: { in: ACTIVE_JOB_STATUSES } };
}

export function isActiveJobStatus(status: AiInfluencerReelJobStatus): boolean {
  return ACTIVE_JOB_STATUSES.includes(status);
}
