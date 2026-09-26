import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildRenovationImagePrompt, sanitizeUserPrompt } from './ai-visualization-prompt.util';

describe('ai-visualization-prompt', () => {
  it('sanitizes control chars and trims length', () => {
    const out = sanitizeUserPrompt('  hello\x00world  ');
    assert.equal(out, 'hello world');
  });

  it('builds prompt with preserve instructions', () => {
    const prompt = buildRenovationImagePrompt({
      propertyType: 'kitchen',
      style: 'modern',
      renovationLevel: 'RENOVATION',
      userPrompt: 'Bílá linka',
    });
    assert.match(prompt, /Preserve exactly/i);
    assert.match(prompt, /Kuchyně/);
    assert.match(prompt, /Moderní/);
    assert.match(prompt, /Bílá linka/);
  });
});
