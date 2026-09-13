import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ReelPlatformPublishStatus } from '@prisma/client';
import {
  getFacebookPublishRetryDelayMs,
  shouldRetryFacebookPublish,
} from './meta-facebook-publish-retry.util';

describe('meta-facebook-publish-retry.util', () => {
  it('TEST D: waits before retrying rate-limited publish', () => {
    const job = {
      facebookPublishStatus: ReelPlatformPublishStatus.RATE_LIMITED,
      updatedAt: new Date(),
      renderSettingsJson: { facebookPublishRetryAttempts: 0 },
    };
    assert.equal(shouldRetryFacebookPublish(job), false);
    job.updatedAt = new Date(Date.now() - getFacebookPublishRetryDelayMs(0) - 1000);
    assert.equal(shouldRetryFacebookPublish(job), true);
  });
});
