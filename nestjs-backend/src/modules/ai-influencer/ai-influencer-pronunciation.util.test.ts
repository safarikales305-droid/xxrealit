import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyPronunciationDictionary,
  prepareSpeechTextForProvider,
} from './ai-influencer-pronunciation.util';

describe('ai-influencer-pronunciation', () => {
  it('replaces XXREALIT.CZ for TTS but keeps display text unchanged', () => {
    const display = 'Více na XXREALIT.CZ';
    const prepared = prepareSpeechTextForProvider(display, 'ELEVENLABS', {
      brandDisplayName: 'XXREALIT',
      brandTtsPronunciation: 'iks iks realit tečka cé zet',
    });
    assert.notEqual(prepared.speechText, display);
    assert.match(prepared.speechText, /iks iks realit/i);
    assert.ok(prepared.rulesApplied.includes('XXREALIT.CZ'));
  });

  it('maps institutional abbreviations', () => {
    const { text, rulesApplied } = applyPronunciationDictionary('Podle ČNB a ČSÚ.', {
      brandDisplayName: 'XXREALIT',
      brandTtsPronunciation: 'iks iks realit',
    });
    assert.match(text, /česko národní banka/i);
    assert.ok(rulesApplied.includes('ČNB'));
  });
});
