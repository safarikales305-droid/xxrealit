import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { progressForStage } from './heygen-video-agent-test.service';
import { buildHeyGenVideoAgentTestPrompt } from './heygen-video-agent-prompt.util';
import { DEFAULT_AI_INFLUENCER_SETTINGS } from './ai-influencer.types';

describe('heygen-video-agent-test.service', () => {
  it('maps stages to estimated progress labels', () => {
    assert.equal(progressForStage('QUEUED').progressPercent, 0);
    assert.match(progressForStage('SUBMITTING').progressLabel, /HeyGen/i);
    assert.equal(progressForStage('SUBMITTED').progressPercent, 20);
    assert.ok(progressForStage('PROCESSING', 0.5).progressPercent >= 30);
    assert.equal(progressForStage('DONE').progressPercent, 100);
  });
});

describe('buildHeyGenVideoAgentTestPrompt', () => {
  it('builds short Czech test prompt', () => {
    const prompt = buildHeyGenVideoAgentTestPrompt({
      settings: DEFAULT_AI_INFLUENCER_SETTINGS,
      avatarId: 'avatar-1',
      videoStyle: 'dynamic_influencer',
      avatarFrequency: 'medium',
    });
    assert.match(prompt, /Vítejte na XXREALIT/i);
    assert.match(prompt, /8 seconds|8 second|Target duration: 8/i);
    assert.match(prompt, /1080x1920/);
  });
});
