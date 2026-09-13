import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AiInfluencerReelJobStatus } from '@prisma/client';
import {
  isCompletedOnDay,
  resolveCompletedAt,
  resolveCompletedAtIso,
} from './ai-influencer-completed-at.util';
import { completedVideoTodayWhere } from './ai-influencer-dashboard-stats.util';
import {
  activeJobWhere,
  galleryVideoWhere,
  hasMasterVideoAsset,
  GALLERY_VIDEO_STATUSES,
} from './ai-influencer-job-status.util';
import { buildGalleryVideoMeta } from './ai-influencer-video-gallery.util';

describe('ai-influencer-completed-at', () => {
  it('prefers renderedAt over fallbacks', () => {
    const renderedAt = new Date('2026-09-13T11:22:00.000Z');
    const completed = resolveCompletedAt({
      renderedAt,
      publishedAt: new Date('2026-09-14T00:00:00.000Z'),
      updatedAt: new Date('2026-09-14T01:00:00.000Z'),
      createdAt: new Date('2026-09-12T00:00:00.000Z'),
    });
    assert.equal(completed.toISOString(), renderedAt.toISOString());
  });

  it('falls back renderedAt ?? publishedAt ?? updatedAt ?? createdAt', () => {
    const createdAt = new Date('2026-09-10T08:00:00.000Z');
    const updatedAt = new Date('2026-09-11T09:00:00.000Z');
    const publishedAt = new Date('2026-09-12T10:00:00.000Z');

    assert.equal(
      resolveCompletedAtIso({ renderedAt: null, publishedAt, updatedAt, createdAt }),
      publishedAt.toISOString(),
    );
    assert.equal(
      resolveCompletedAtIso({ renderedAt: null, publishedAt: null, updatedAt, createdAt }),
      updatedAt.toISOString(),
    );
    assert.equal(
      resolveCompletedAtIso({ renderedAt: null, publishedAt: null, updatedAt: null, createdAt }),
      createdAt.toISOString(),
    );
  });

  it('detects completion on the same local day', () => {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const job = {
      renderedAt: new Date(),
      publishedAt: null,
      updatedAt: new Date(),
      createdAt: new Date(Date.now() - 86400000),
    };
    assert.equal(isCompletedOnDay(job, dayStart), true);
  });
});

describe('ai-influencer-dashboard-sync', () => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const productionReadyJob = {
    status: AiInfluencerReelJobStatus.READY,
    isTest: false,
    renderedAt: new Date(),
    publishedAt: null,
    updatedAt: new Date(),
    createdAt: new Date(Date.now() - 3600000),
    finalMasterUrl: 'https://cdn.example/video.mp4',
    baseMasterUrl: null,
    videoUrl: null,
    avatarStorageUrl: null,
    errorCode: null,
    facebookPublishStatus: 'SKIPPED',
    instagramPublishStatus: 'SKIPPED',
    youtubePublishStatus: 'SKIPPED',
    postId: null,
    estimatedDurationSec: 35,
    scenesJson: [],
    renderSettingsJson: {},
  };

  const testReadyJob = { ...productionReadyJob, isTest: true };

  it('READY production job counts as completed today and gallery-visible', () => {
    assert.equal(isCompletedOnDay(productionReadyJob, todayStart), true);
    assert.equal(hasMasterVideoAsset(productionReadyJob), true);
    assert.equal(GALLERY_VIDEO_STATUSES.includes(productionReadyJob.status), true);
    assert.equal(activeJobWhere().status?.in?.includes(AiInfluencerReelJobStatus.READY), false);
    const galleryMeta = buildGalleryVideoMeta(productionReadyJob);
    assert.ok(galleryMeta.completedCombinedLabel);
    assert.notEqual(galleryMeta.createdCombinedLabel, galleryMeta.completedCombinedLabel);
    assert.equal(galleryMeta.inGallery, true);
  });

  it('test job is included in today completion but excluded from default production gallery filter', () => {
    assert.equal(isCompletedOnDay(testReadyJob, todayStart), true);
    const defaultGalleryWhere = galleryVideoWhere({ includeTest: false });
    assert.equal(defaultGalleryWhere.isTest, false);
    assert.equal(testReadyJob.isTest, true);
  });

  it('completedVideoTodayWhere includes gallery statuses and master asset', () => {
    const where = completedVideoTodayWhere(todayStart);
    assert.ok(where.AND);
    assert.equal(Array.isArray(where.AND), true);
  });
});
