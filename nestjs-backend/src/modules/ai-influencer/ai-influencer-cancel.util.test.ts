import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AiInfluencerReelJobStatus } from '@prisma/client';
import {
  isJobCancelledState,
  isProviderSubmittedForCancel,
  shouldSkipPipelineForCancel,
} from './ai-influencer-cancel.util';

describe('ai-influencer-cancel.util', () => {
  it('detects provider submitted from session id', () => {
    assert.equal(
      isProviderSubmittedForCancel({ heygenVideoAgentSessionId: 'sess-1' }, 'va:sess-1'),
      true,
    );
    assert.equal(isProviderSubmittedForCancel({}, null), false);
  });

  it('skips pipeline for cancelled jobs', () => {
    assert.equal(
      shouldSkipPipelineForCancel(AiInfluencerReelJobStatus.CANCELLED, { cancelPhase: 'CANCELLED' }),
      true,
    );
    assert.equal(
      shouldSkipPipelineForCancel(AiInfluencerReelJobStatus.AVATAR_GENERATING, {
        cancelPhase: 'CANCEL_REQUESTED',
      }),
      true,
    );
  });

  it('isJobCancelledState respects meta phase', () => {
    assert.equal(
      isJobCancelledState(AiInfluencerReelJobStatus.AVATAR_GENERATING, {
        cancelPhase: 'CANCELLED_PROVIDER_CONTINUES',
      }),
      true,
    );
  });
});
