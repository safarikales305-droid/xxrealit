import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computePartitionBasedProgress } from './company-job-progress.util';

describe('company-job-progress', () => {
  it('does not show 99% when only a few partitions are done', () => {
    const progress = computePartitionBasedProgress({
      completedPartitions: 3,
      totalPartitions: 108,
      currentPartitionCursor: 72,
      currentPartitionTotal: 72,
      overallProcessed: 72,
      jobStatus: 'RUNNING',
      isComplete: false,
    });
    assert.ok(progress.overallPercent < 20, `expected low percent, got ${progress.overallPercent}`);
    assert.equal(progress.partitionPercent, 100);
  });

  it('returns 100% only when complete', () => {
    const progress = computePartitionBasedProgress({
      completedPartitions: 108,
      totalPartitions: 108,
      currentPartitionCursor: 0,
      currentPartitionTotal: null,
      overallProcessed: 5000,
      jobStatus: 'COMPLETED',
      isComplete: true,
    });
    assert.equal(progress.overallPercent, 100);
  });
});
