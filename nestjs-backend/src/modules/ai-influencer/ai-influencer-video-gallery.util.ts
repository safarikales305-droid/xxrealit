import { ReelPlatformPublishStatus } from '@prisma/client';
import type { ReelScenePlan } from './ai-influencer.types';
import { resolveMasterVideoUrl } from './ai-influencer-job-status.util';
import { readJobRenderMeta } from './ai-influencer-video-agent.util';

export type GalleryVideoStatus = 'READY' | 'PUBLISHED' | 'PARTIAL' | 'QUALITY_REVIEW';

export type GalleryVideoMeta = {
  masterVideoUrl: string | null;
  videoCreatedAt: string | null;
  masterCreatedAt: string | null;
  finishedAt: string | null;
  sceneCount: number;
  backgroundVariationCount: number | null;
  galleryStatus: GalleryVideoStatus;
  durationFormatted: string | null;
  createdDateLabel: string | null;
  createdTimeLabel: string | null;
  createdCombinedLabel: string | null;
};

type GalleryJobInput = {
  status: string;
  errorCode?: string | null;
  finalMasterUrl?: string | null;
  baseMasterUrl?: string | null;
  videoUrl?: string | null;
  avatarStorageUrl?: string | null;
  renderedAt?: Date | string | null;
  createdAt: Date | string;
  estimatedDurationSec?: number | null;
  scenesJson?: unknown;
  renderSettingsJson?: unknown;
  facebookPublishStatus?: ReelPlatformPublishStatus | string | null;
  instagramPublishStatus?: ReelPlatformPublishStatus | string | null;
  youtubePublishStatus?: ReelPlatformPublishStatus | string | null;
  postId?: string | null;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatCzechDateTime(iso: Date | string | null | undefined): {
  date: string;
  time: string;
  combined: string;
} | null {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const date = `${pad2(d.getDate())}. ${pad2(d.getMonth() + 1)}. ${d.getFullYear()}`;
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return { date, time, combined: `${date} · ${time}` };
}

export function formatDurationClock(durationSec: number | null | undefined): string | null {
  if (durationSec == null || !Number.isFinite(durationSec) || durationSec <= 0) return null;
  const total = Math.round(durationSec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${pad2(m)}:${pad2(s)}`;
}

export function resolveGalleryVideoStatus(job: GalleryJobInput): GalleryVideoStatus {
  if (job.errorCode === 'QUALITY_REVIEW_REQUIRED') return 'QUALITY_REVIEW';

  const publishedTargets = [
    job.facebookPublishStatus,
    job.instagramPublishStatus,
    job.youtubePublishStatus,
  ].filter((s) => s === ReelPlatformPublishStatus.PUBLISHED).length;

  const hasPortal = Boolean(job.postId?.trim());
  const publishedCount = publishedTargets + (hasPortal ? 1 : 0);

  if (job.status === 'PUBLISHED' || publishedCount >= 2) return 'PUBLISHED';
  if (job.status === 'PARTIALLY_PUBLISHED' || publishedCount === 1) return 'PARTIAL';
  return 'READY';
}

export function buildGalleryVideoMeta(job: GalleryJobInput): GalleryVideoMeta {
  const scenes = Array.isArray(job.scenesJson) ? (job.scenesJson as ReelScenePlan[]) : [];
  const meta = readJobRenderMeta(job.renderSettingsJson);
  const qualityMetrics = meta.qualityMetrics as { backgroundVariationCount?: number } | undefined;
  const createdAtIso =
    job.renderedAt != null
      ? job.renderedAt instanceof Date
        ? job.renderedAt.toISOString()
        : String(job.renderedAt)
      : job.createdAt instanceof Date
        ? job.createdAt.toISOString()
        : String(job.createdAt);

  const labels = formatCzechDateTime(createdAtIso);

  return {
    masterVideoUrl: resolveMasterVideoUrl(job),
    videoCreatedAt: createdAtIso,
    masterCreatedAt:
      job.renderedAt != null
        ? job.renderedAt instanceof Date
          ? job.renderedAt.toISOString()
          : String(job.renderedAt)
        : null,
    finishedAt:
      job.renderedAt != null
        ? job.renderedAt instanceof Date
          ? job.renderedAt.toISOString()
          : String(job.renderedAt)
        : null,
    sceneCount: scenes.length,
    backgroundVariationCount:
      typeof qualityMetrics?.backgroundVariationCount === 'number'
        ? qualityMetrics.backgroundVariationCount
        : null,
    galleryStatus: resolveGalleryVideoStatus(job),
    durationFormatted: formatDurationClock(job.estimatedDurationSec),
    createdDateLabel: labels?.date ?? null,
    createdTimeLabel: labels?.time ?? null,
    createdCombinedLabel: labels?.combined ?? null,
  };
}
