import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildFallbackStoryboard,
  validateAndNormalizeStoryboard,
} from './ai-influencer-storyboard.util';

describe('ai-influencer-storyboard', () => {
  it('normalizes empty scenes to fallback storyboard', () => {
    const result = validateAndNormalizeStoryboard(
      {
        hook: 'Ceny bytů rostou?',
        cta: 'Více na XXREALIT.CZ',
        spokenText: 'Test narration',
        estimatedDuration: 35,
        scenes: [],
      },
      35,
    );
    assert.ok(result.scenes.length >= 5);
    assert.equal(result.scenes[0].type, 'AVATAR_FULL');
  });

  it('inserts visual scene when only avatar scenes', () => {
    const result = validateAndNormalizeStoryboard(
      {
        hook: 'Hook',
        cta: 'CTA',
        spokenText: 'text',
        estimatedDuration: 30,
        scenes: [
          { start: 0, duration: 10, type: 'AVATAR_FULL' },
          { start: 10, duration: 10, type: 'AVATAR_FULL' },
        ],
      },
      30,
    );
    assert.ok(result.scenes.some((s) => s.type === 'IMAGE_FULL' || s.type === 'BROLL_FULL'));
  });

  it('buildFallbackStoryboard ends with CTA', () => {
    const scenes = buildFallbackStoryboard('spoken', 'hook', 'cta', 35);
    assert.equal(scenes[scenes.length - 1].type, 'CTA');
  });
});
