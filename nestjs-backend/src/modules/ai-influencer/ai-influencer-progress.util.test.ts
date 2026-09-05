import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AiInfluencerReelJobStatus } from '@prisma/client';
import { progressForStatus, RENDER_PROGRESS } from './ai-influencer-progress.util';

describe('ai-influencer-progress', () => {
  it('voice step is 30%', () => {
    const p = progressForStatus(AiInfluencerReelJobStatus.VOICE_GENERATING);
    assert.equal(p.percent, 30);
    assert.match(p.step, /hlas/i);
  });

  it('video agent poll interpolates 55–70%', () => {
    const start = progressForStatus(AiInfluencerReelJobStatus.AVATAR_GENERATING, 0);
    const mid = progressForStatus(AiInfluencerReelJobStatus.AVATAR_GENERATING, 0.5);
    const end = progressForStatus(AiInfluencerReelJobStatus.AVATAR_GENERATING, 1);
    assert.equal(start.percent, 55);
    assert.equal(mid.percent, 63);
    assert.equal(end.percent, 70);
  });

  it('render sub-steps have expected labels', () => {
    assert.equal(RENDER_PROGRESS.DOWNLOAD.percent, 70);
    assert.match(RENDER_PROGRESS.BRANDING.step, /branding/i);
    assert.equal(RENDER_PROGRESS.UPLOAD.percent, 92);
  });
});
