import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AiInfluencerReelJobStatus } from '@prisma/client';
import { hasMasterVideoAsset } from './ai-influencer-job-status.util';

function canManualPublish(job: {
  isTest: boolean;
  status: AiInfluencerReelJobStatus;
  finalMasterUrl?: string | null;
  videoUrl?: string | null;
  manualAdminApproval?: boolean;
}): boolean {
  if (!hasMasterVideoAsset(job)) return false;
  if (
    job.status !== AiInfluencerReelJobStatus.READY &&
    job.status !== AiInfluencerReelJobStatus.PARTIALLY_PUBLISHED
  ) {
    return false;
  }
  if (job.isTest && !job.manualAdminApproval) return false;
  return true;
}

describe('manual test video publish gate', () => {
  it('blocks automatic test publish without admin approval', () => {
    assert.equal(
      canManualPublish({
        isTest: true,
        status: AiInfluencerReelJobStatus.READY,
        finalMasterUrl: 'https://cdn.example/video.mp4',
      }),
      false,
    );
  });

  it('allows manual admin publish for test READY video', () => {
    assert.equal(
      canManualPublish({
        isTest: true,
        status: AiInfluencerReelJobStatus.READY,
        finalMasterUrl: 'https://cdn.example/video.mp4',
        manualAdminApproval: true,
      }),
      true,
    );
  });

  it('allows production READY video without extra flag', () => {
    assert.equal(
      canManualPublish({
        isTest: false,
        status: AiInfluencerReelJobStatus.READY,
        finalMasterUrl: 'https://cdn.example/video.mp4',
      }),
      true,
    );
  });
});
