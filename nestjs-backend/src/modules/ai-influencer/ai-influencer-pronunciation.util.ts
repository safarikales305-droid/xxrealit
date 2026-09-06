import type { AiInfluencerAutomationSettings } from './ai-influencer.types';

export type SpeechProvider = 'ELEVENLABS' | 'HEYGEN' | 'GENERIC';

/** Centralizovaná pravidla výslovnosti — vizuální text zůstává beze změny. */
export const PRONUNCIATION_RULES: ReadonlyArray<{
  pattern: RegExp;
  replace: (settings: Pick<AiInfluencerAutomationSettings, 'brandDisplayName' | 'brandTtsPronunciation'>) => string;
  label: string;
}> = [
  {
    label: 'XXREALIT.CZ',
    pattern: /xxrealit\.cz/gi,
    replace: (s) => s.brandTtsPronunciation?.trim() || 'iks iks realit tečka cé zet',
  },
  {
    label: 'XXREALIT',
    pattern: /xxrealit(?![.\w])/gi,
    replace: (s) => s.brandTtsPronunciation?.trim() || 'iks iks realit',
  },
  {
    label: 'Sreality',
    pattern: /\bsreality\b/gi,
    replace: () => 'es reality',
  },
  {
    label: 'ČNB',
    pattern: /(^|[^\p{L}])ČNB([^\p{L}]|$)/gu,
    replace: () => 'česko národní banka',
  },
  {
    label: 'ČSÚ',
    pattern: /(^|[^\p{L}])ČSÚ([^\p{L}]|$)/gu,
    replace: () => 'česko statistický úřad',
  },
  {
    label: 'RÚIAN',
    pattern: /(^|[^\p{L}])RÚIAN([^\p{L}]|$)/giu,
    replace: () => 'rú ian',
  },
];

export const BRAND_PRONUNCIATION_TEST_SENTENCE =
  'Více informací najdete na XXREALIT.CZ.';

export function applyPronunciationDictionary(
  text: string,
  settings: Pick<AiInfluencerAutomationSettings, 'brandDisplayName' | 'brandTtsPronunciation'>,
): { text: string; rulesApplied: string[] } {
  let out = text;
  const rulesApplied: string[] = [];
  for (const rule of PRONUNCIATION_RULES) {
    if (rule.pattern.test(out)) {
      rule.pattern.lastIndex = 0;
      out = out.replace(rule.pattern, (match, ...groups) => {
        const prefix = typeof groups[0] === 'string' ? groups[0] : '';
        const suffix = typeof groups[1] === 'string' ? groups[1] : '';
        if (prefix || suffix) {
          return `${prefix}${rule.replace(settings)}${suffix}`;
        }
        return rule.replace(settings);
      });
      rulesApplied.push(rule.label);
    }
    rule.pattern.lastIndex = 0;
  }
  return { text: out, rulesApplied };
}

/** Připraví speechText pro konkrétní TTS provider (ElevenLabs / HeyGen). */
export function prepareSpeechTextForProvider(
  text: string,
  provider: SpeechProvider,
  settings: Pick<AiInfluencerAutomationSettings, 'brandDisplayName' | 'brandTtsPronunciation'>,
): { speechText: string; rulesApplied: string[] } {
  const { text: processed, rulesApplied } = applyPronunciationDictionary(text, settings);
  if (provider === 'ELEVENLABS') {
    // ElevenLabs multilingual v2 — fonetická substituce je spolehlivější než SSML bez dictionary API.
    return { speechText: processed, rulesApplied };
  }
  if (provider === 'HEYGEN') {
    return { speechText: processed, rulesApplied };
  }
  return { speechText: processed, rulesApplied };
}

export function applyBrandTtsSubstitution(
  text: string,
  settings: Pick<AiInfluencerAutomationSettings, 'brandDisplayName' | 'brandTtsPronunciation'>,
): string {
  return prepareSpeechTextForProvider(text, 'GENERIC', settings).speechText;
}
