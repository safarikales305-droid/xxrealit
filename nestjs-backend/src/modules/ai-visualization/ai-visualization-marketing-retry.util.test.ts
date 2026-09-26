import test from 'node:test';
import assert from 'node:assert/strict';
import { marketingReelRetryDelayMinutes } from './ai-visualization-marketing.service';

test('marketingReelRetryDelayMinutes uses exponential schedule', () => {
  assert.equal(marketingReelRetryDelayMinutes(1), 1);
  assert.equal(marketingReelRetryDelayMinutes(2), 5);
  assert.equal(marketingReelRetryDelayMinutes(3), 15);
  assert.equal(marketingReelRetryDelayMinutes(4), 60);
});
