import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AiInfluencerReelJobStatus } from '@prisma/client';
import {
  assessStaleActiveJob,
  REPAIR_ORPHAN_NO_PROVIDER_MS,
} from './ai-influencer-job-repair.util';
import {
  isAdminCancellableStatus,
  isForceCancellableStatus,
} from './ai-influencer-job-status.util';

describe('ai-influencer-job-repair.util', () => {
  it('detects orphan active job without provider id', () => {
    const createdAt = new Date(Date.now() - REPAIR_ORPHAN_NO_PROVIDER_MS - 60_000);
    const result = assessStaleActiveJob(
      {
        status: AiInfluencerReelJobStatus.AVATAR_GENERATING,
        createdAt,
        updatedAt: createdAt,
        progressPercent: 5,
        currentStep: 'Čeká',
      },
      {},
    );
    assert.equal(result.stale, true);
    assert.equal(result.reason, 'ORPHAN_NO_PROVIDER');
  });
});

describe('admin cancel status helpers', () => {
  it('allows cancel for pipeline statuses', () => {
    assert.equal(isAdminCancellableStatus(AiInfluencerReelJobStatus.AVATAR_GENERATING), true);
    assert.equal(isAdminCancellableStatus(AiInfluencerReelJobStatus.RENDERING), true);
  });

  it('blocks cancel for terminal statuses', () => {
    assert.equal(isAdminCancellableStatus(AiInfluencerReelJobStatus.READY), false);
    assert.equal(isAdminCancellableStatus(AiInfluencerReelJobStatus.CANCELLED), false);
    assert.equal(isAdminCancellableStatus(AiInfluencerReelJobStatus.FAILED), false);
  });

  it('force cancel allows FAILED but not PUBLISHED', () => {
    assert.equal(isForceCancellableStatus(AiInfluencerReelJobStatus.FAILED), true);
    assert.equal(isForceCancellableStatus(AiInfluencerReelJobStatus.PUBLISHED), false);
    assert.equal(isForceCancellableStatus(AiInfluencerReelJobStatus.CANCELLED), false);
  });
});
