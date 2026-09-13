import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AiInfluencerReelJobStatus } from '@prisma/client';
import {
  isActiveGenerationStatus,
  isCompletedGenerationStatus,
  isFailedGenerationStatus,
  isQueuedGenerationStatus,
} from './ai-influencer-job-status.util';

describe('ai-influencer-job-status helpers', () => {
  it('treats EVALUATING and SCRIPT_READY as active generation', () => {
    assert.equal(isActiveGenerationStatus(AiInfluencerReelJobStatus.EVALUATING), true);
    assert.equal(isActiveGenerationStatus(AiInfluencerReelJobStatus.SCRIPT_READY), true);
    assert.equal(isActiveGenerationStatus(AiInfluencerReelJobStatus.READY), false);
  });

  it('treats READY as completed generation', () => {
    assert.equal(isCompletedGenerationStatus(AiInfluencerReelJobStatus.READY), true);
    assert.equal(isCompletedGenerationStatus(AiInfluencerReelJobStatus.EVALUATING), false);
  });

  it('detects failed and queued states', () => {
    assert.equal(isFailedGenerationStatus(AiInfluencerReelJobStatus.FAILED), true);
    assert.equal(isQueuedGenerationStatus(AiInfluencerReelJobStatus.EVALUATING), true);
    assert.equal(isQueuedGenerationStatus(AiInfluencerReelJobStatus.RENDERING), false);
  });
});
