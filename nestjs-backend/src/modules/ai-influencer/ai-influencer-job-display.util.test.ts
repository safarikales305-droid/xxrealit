import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildJobAdminDisplay, buildRetryLabel } from './ai-influencer-job-display.util';

describe('buildJobAdminDisplay', () => {
  it('marks stale ElevenLabs error on VIDEO_AGENT job as LEGACY_STALE', () => {
    const display = buildJobAdminDisplay(
      {
        status: 'FAILED',
        failedStage: 'VOICE',
        errorCode: 'ELEVENLABS_NOT_CONFIGURED',
        errorMessage: 'ElevenLabs API key není nakonfigurován (ELEVENLABS_API_KEY)',
        renderSettingsJson: { videoGenerationMode: 'VIDEO_AGENT' },
      },
      { videoGenerationMode: 'VIDEO_AGENT' },
      { workerElevenConfigured: true },
    );
    assert.equal(display.errorKind, 'LEGACY_STALE');
    assert.equal(display.displayErrorCode, 'LEGACY_STALE_ERROR');
    assert.equal(display.retryLabel, 'Spustit znovu přes Video Agent');
  });

  it('keeps active ElevenLabs error for AVATAR mode', () => {
    const display = buildJobAdminDisplay(
      {
        status: 'FAILED',
        failedStage: 'VOICE',
        errorCode: 'ELEVENLABS_NOT_CONFIGURED',
        errorMessage: 'ElevenLabs API key není nakonfigurován.',
        renderSettingsJson: { generationModeUsed: 'AVATAR' },
      },
      { videoGenerationMode: 'AVATAR' },
      { workerElevenConfigured: true },
    );
    assert.equal(display.errorKind, 'ACTIVE');
    assert.equal(display.retryLabel, 'Zkusit znovu od hlasu');
  });
});

describe('buildRetryLabel', () => {
  it('uses Video Agent label for VIDEO_AGENT failures', () => {
    assert.equal(buildRetryLabel('VIDEO_AGENT', 'VIDEO_AGENT', 'ACTIVE'), 'Zkusit znovu Video Agent');
  });
});
