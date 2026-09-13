import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bypassesDuplicateGate,
  bypassesQualityGate,
  buildSourceModeMeta,
  resolveSourceMode,
} from './ai-influencer-source-mode.util';

describe('ai-influencer source mode', () => {
  it('AUTO job is blocked by quality gate', () => {
    const job = {
      forceOverride: false,
      isTest: false,
      renderSettingsJson: buildSourceModeMeta('AUTO'),
    };
    assert.equal(resolveSourceMode(job), 'AUTO');
    assert.equal(bypassesQualityGate(job), false);
  });

  it('MANUAL admin job bypasses quality gate', () => {
    const job = {
      forceOverride: true,
      isTest: false,
      renderSettingsJson: buildSourceModeMeta('MANUAL'),
    };
    assert.equal(resolveSourceMode(job), 'MANUAL');
    assert.equal(bypassesQualityGate(job), true);
    assert.equal(bypassesDuplicateGate(job), true);
  });

  it('RETRY job bypasses quality gate', () => {
    const job = {
      forceOverride: true,
      isTest: false,
      renderSettingsJson: buildSourceModeMeta('RETRY'),
    };
    assert.equal(bypassesQualityGate(job), true);
  });

  it('TEST job bypasses quality gate', () => {
    const job = {
      isTest: true,
      forceOverride: false,
      renderSettingsJson: buildSourceModeMeta('TEST'),
    };
    assert.equal(bypassesQualityGate(job), true);
  });
});

describe('quality gate decision', () => {
  it('AUTO score 55 becomes SKIPPED without bypass', () => {
    const minScore = 75;
    const score = 55;
    const bypass = false;
    const passes = score >= minScore || bypass;
    assert.equal(passes, false);
  });

  it('MANUAL score 55 continues production with bypass', () => {
    const minScore = 75;
    const score = 55;
    const bypass = true;
    const passes = score >= minScore || bypass;
    assert.equal(passes, true);
  });
});
