import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AiInfluencerReelJobStatus } from '@prisma/client';
import { progressForStatus, RENDER_PROGRESS } from './ai-influencer-progress.util';

describe('ai-influencer-progress', () => {
  it('voice step is 25%', () => {
    const p = progressForStatus(AiInfluencerReelJobStatus.VOICE_GENERATING);
    assert.equal(p.percent, 25);
    assert.match(p.step, /hlas/i);
  });

  it('heygen poll interpolates 40–55%', () => {
    const start = progressForStatus(AiInfluencerReelJobStatus.AVATAR_GENERATING, 0);
    const mid = progressForStatus(AiInfluencerReelJobStatus.AVATAR_GENERATING, 0.5);
    const end = progressForStatus(AiInfluencerReelJobStatus.AVATAR_GENERATING, 1);
    assert.equal(start.percent, 40);
    assert.equal(mid.percent, 48);
    assert.equal(end.percent, 55);
  });

  it('render sub-steps have expected labels', () => {
    assert.equal(RENDER_PROGRESS.DOWNLOAD.percent, 70);
    assert.match(RENDER_PROGRESS.BRANDING.step, /branding/i);
    assert.equal(RENDER_PROGRESS.UPLOAD.percent, 92);
  });
});
