import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  estimateHeyGenCostCzk,
  estimateHeyGenCredits,
  videoGenerationLockWhere,
} from './ai-influencer-single-flight.util';
import { AiInfluencerReelJobStatus } from '@prisma/client';

describe('ai-influencer-single-flight.util', () => {
  it('videoGenerationLockWhere uses active job statuses', () => {
    const where = videoGenerationLockWhere();
    assert.ok(where.status?.in?.includes(AiInfluencerReelJobStatus.AVATAR_GENERATING));
    assert.ok(where.status?.in?.includes(AiInfluencerReelJobStatus.EVALUATING));
  });

  it('estimateHeyGenCredits scales with duration', () => {
    assert.ok(estimateHeyGenCredits(35) > 0);
    assert.ok(estimateHeyGenCredits(70) > estimateHeyGenCredits(35));
  });

  it('estimateHeyGenCostCzk uses configured rate', () => {
    assert.equal(estimateHeyGenCostCzk(40, 0.35), 14);
  });
});
