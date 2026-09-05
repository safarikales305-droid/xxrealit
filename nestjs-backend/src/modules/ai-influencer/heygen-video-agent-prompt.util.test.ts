import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHeyGenVideoAgentPrompt,
  collectStoryboardMediaUrls,
} from './heygen-video-agent-prompt.util';
import { DEFAULT_AI_INFLUENCER_SETTINGS } from './ai-influencer.types';

describe('buildHeyGenVideoAgentPrompt', () => {
  it('includes hook, CTA, 9:16 and Czech instructions', () => {
    const prompt = buildHeyGenVideoAgentPrompt({
      script: {
        hook: 'Hypotéky se mění.',
        spokenText: 'Hypotéky se mění. Co to znamená pro kupující?',
        captionTitle: 'Hypotéky',
        cta: 'Více na XXREALIT.CZ',
        estimatedDuration: 40,
        scenes: [
          { start: 0, duration: 4, type: 'AVATAR_FULL', text: 'Hook' },
          { start: 4, duration: 5, type: 'IMAGE_FULL', mediaUrl: 'https://cdn.example.com/a.jpg' },
        ],
      },
      settings: DEFAULT_AI_INFLUENCER_SETTINGS,
      avatarId: 'avatar-1',
      contentKind: 'ARTICLE',
    });
    assert.match(prompt, /9:16/);
    assert.match(prompt, /1080x1920/);
    assert.match(prompt, /Hypotéky se mění/);
    assert.match(prompt, /XXREALIT/);
    assert.match(prompt, /NO black letterbox/i);
  });

  it('collects unique https media urls', () => {
    const files = collectStoryboardMediaUrls([
      { start: 0, duration: 4, type: 'IMAGE_FULL', mediaUrl: 'https://a.test/1.jpg' },
      { start: 4, duration: 4, type: 'BROLL_FULL', mediaUrl: 'https://a.test/1.jpg' },
      { start: 8, duration: 4, type: 'IMAGE_FULL', mediaUrl: 'http://bad.local/x.jpg' },
    ]);
    assert.equal(files.length, 1);
    assert.equal(files[0]?.url, 'https://a.test/1.jpg');
  });
});
