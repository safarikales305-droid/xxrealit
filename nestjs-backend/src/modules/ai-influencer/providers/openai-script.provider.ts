import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { FORBIDDEN_HOOK_PREFIXES } from '../ai-influencer.constants';
import type { ArticleScoreResult, ReelScriptPayload } from '../ai-influencer.types';
import { OpenAiService } from '../../openai/openai.service';
import type { AiScriptProvider, ArticleForReel } from './ai-script.provider';

type ScoreJson = {
  reelPotentialScore?: number;
  topicInterest?: number;
  freshness?: number;
  hookPotential?: number;
  practicalValue?: number;
  emotionalInterest?: number;
  visualPotential?: number;
  localInterest?: number;
  sourceTrust?: number;
  duplicationPenalty?: number;
  reasoningSummary?: string[];
  contentFormat?: string;
};

type ScriptJson = {
  hook?: string;
  hookCandidates?: string[];
  intro?: string;
  segments?: Array<{ text?: string; headline?: string }>;
  cta?: string;
  spokenText?: string;
  captionTitle?: string;
  captionDescription?: string;
  hashtags?: string[];
  estimatedDuration?: number;
  scenes?: Array<{
    start?: number;
    duration?: number;
    type?: string;
    text?: string;
    mediaQuery?: string;
    avatarPosition?: string;
    headline?: string;
  }>;
  contentFormat?: string;
  factualWarnings?: string[];
};

@Injectable()
export class OpenAiScriptProvider implements AiScriptProvider {
  private readonly log = new Logger(OpenAiScriptProvider.name);

  constructor(private readonly openAi: OpenAiService) {}

  async evaluateArticle(article: ArticleForReel) {
    const userPrompt = `Vyhodnoť vhodnost článku pro krátké vertikální video (Reel) na českém realitním portálu XXREALIT.

Článek:
Nadpis: ${article.title}
Perex: ${article.perex}
Kategorie: ${article.category}
Region: ${article.region ?? '—'}
Publikováno: ${article.publishedAt?.toISOString() ?? 'neznámé'}
Text (zkráceně): ${article.bodyMarkdown.slice(0, 4000)}

Vrať JSON:
{
  "reelPotentialScore": 0-100,
  "topicInterest": 0-100,
  "freshness": 0-100,
  "hookPotential": 0-100,
  "practicalValue": 0-100,
  "emotionalInterest": 0-100,
  "visualPotential": 0-100,
  "localInterest": 0-100,
  "sourceTrust": 0-100,
  "duplicationPenalty": 0-100,
  "reasoningSummary": ["max 5 krátkých důvodů bez chain-of-thought"],
  "contentFormat": "REALITNI_MINUTA|CENY_NEMOVITOSTI|HYPOTEKY|TIP_PRO_MAJITELE|TIP_PRO_KUPUJICI|REKONSTRUKCE|VEDELI_JSTE|BREAKING_NEWS"
}`;

    const result = await this.openAi.complete({
      feature: 'ai_influencer_score',
      systemPrompt:
        'Jsi editor XXREALIT. Hodnotíš články pro short-form video. Buď konzervativní u slabých vizuálů a málo faktů. Vrať pouze validní JSON.',
      userPrompt,
      maxOutputTokens: 600,
      jsonMode: true,
      adminTest: true,
    });

    const parsed = this.parseJson<ScoreJson>(result.text);
    const normalized = this.normalizeScore(parsed);
    return { result: normalized, costCzk: result.estimatedCostCzk };
  }

  async generateScript(input: {
    article: ArticleForReel;
    targetDurationSec: number;
    personalityPrompt?: string | null;
    performanceHints?: string[];
    brandingSettings?: import('../ai-influencer.types').AiInfluencerAutomationSettings;
  }) {
    const brand = input.brandingSettings?.brandDisplayName ?? 'XXREALIT';
    const hints = (input.performanceHints ?? []).slice(0, 8).join('\n- ');
    const userPrompt = `Vytvoř scénář pro vertikální Reel (cca ${input.targetDurationSec}s) z tohoto článku.

DŮLEŽITÉ:
- Nepoužívej úvod "Dobrý den", "V dnešním videu", "Co je nového ve světě realit".
- Hook musí být konkrétní a začít hned (0–2 s).
- Vymysli minimálně 3 hookCandidates, vyber nejlepší do hook.
- Používej POUZE fakta z článku. Nevymýšlej procenta, ceny ani zákony.
- Pokud článek nemá dost faktů, nastav factualWarnings a zkrát script.
- Virtuální AI redaktorka — nepředstírej skutečnou osobu.
- Mluv česky, moderně, důvěryhodně, srozumitelně.
- Struktura: HOOK (2–3 s) → střídání avatar / B-roll / obrázky článku → CTA (3–5 s).
- Storyboard: 6–10 scén, změna vizuálu každé 2–6 s. Typy scén:
  AVATAR_FULL, AVATAR_LEFT, AVATAR_RIGHT, AVATAR_CIRCLE, IMAGE_FULL, BROLL_FULL, STAT_CARD, CTA.
- První scéna = HOOK (AVATAR_FULL, max 3 s).
- Poslední scéna = CTA.
- Nesmí být jeden statický záběr déle než 6 s.
- BROLL_FULL / IMAGE_FULL = hlas pokračuje, avatar není vidět (voice-over).
- mediaQuery: "article cover", "article image 2", "portal media" apod.
- Značku ${brand} zapracuj přirozeně (např. "Na ${brand} dnes sledujeme…", "Pro ${brand} jsem vybrala…").
- Neopakuj stále stejnou robotickou větu — obměňuj formulace.

${hints ? `Historické signály:\n- ${hints}\n` : ''}

Článek:
Nadpis: ${input.article.title}
Perex: ${input.article.perex}
Text: ${input.article.bodyMarkdown.slice(0, 6000)}

Vrať JSON:
{
  "hookCandidates": ["A", "B", "C"],
  "hook": "winner",
  "intro": "...",
  "segments": [{"text":"...", "headline":"..."}],
  "cta": "Více na XXREALIT.CZ",
  "spokenText": "celý mluvený text",
  "captionTitle": "...",
  "captionDescription": "...",
  "hashtags": ["#..."],
  "estimatedDuration": ${input.targetDurationSec},
  "scenes": [
    {"start":0,"duration":4,"type":"AVATAR_FULL","text":"...","headline":"..."},
    {"start":4,"duration":7,"type":"IMAGE_FULL","mediaQuery":"article cover","text":"..."}
  ],
  "contentFormat": "HYPOTEKY",
  "factualWarnings": []
}`;

    const result = await this.openAi.complete({
      feature: 'ai_influencer_script',
      systemPrompt:
        input.personalityPrompt?.trim() ||
        'Jsi virtuální AI redaktorka XXREALIT. Píšeš krátké poutavé scénáře pro Reels o realitách a bydlení. Bez bulvárního přehánění.',
      userPrompt,
      maxOutputTokens: 1800,
      jsonMode: true,
      adminTest: true,
    });

    const parsed = this.parseJson<ScriptJson>(result.text);
    const script = this.normalizeScript(parsed, input.targetDurationSec);
    const hookCandidates = this.normalizeHooks(parsed.hookCandidates, script.hook);
    const selectedHook = this.pickHook(hookCandidates, script.hook);
    script.hook = selectedHook;

    const scriptHash = createHash('sha256')
      .update(JSON.stringify({ script, hookCandidates, selectedHook }))
      .digest('hex');

    return {
      script,
      hookCandidates,
      selectedHook,
      costCzk: result.estimatedCostCzk,
      scriptHash,
    };
  }

  private parseJson<T>(text: string): T {
    const trimmed = text.trim();
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('AI nevrátilo validní JSON.');
    return JSON.parse(trimmed.slice(start, end + 1)) as T;
  }

  private normalizeScore(raw: ScoreJson): ArticleScoreResult {
    const clamp = (v: unknown, fallback = 50) => {
      const n = typeof v === 'number' ? v : Number.parseInt(String(v ?? ''), 10);
      if (!Number.isFinite(n)) return fallback;
      return Math.min(100, Math.max(0, Math.trunc(n)));
    };
    const reasons = Array.isArray(raw.reasoningSummary)
      ? raw.reasoningSummary.map((x) => String(x).trim()).filter(Boolean).slice(0, 5)
      : [];
    return {
      reelPotentialScore: clamp(raw.reelPotentialScore, 0),
      topicInterest: clamp(raw.topicInterest),
      freshness: clamp(raw.freshness),
      hookPotential: clamp(raw.hookPotential),
      practicalValue: clamp(raw.practicalValue),
      emotionalInterest: clamp(raw.emotionalInterest),
      visualPotential: clamp(raw.visualPotential),
      localInterest: clamp(raw.localInterest),
      sourceTrust: clamp(raw.sourceTrust),
      duplicationPenalty: clamp(raw.duplicationPenalty, 0),
      reasoningSummary: reasons,
      contentFormat: this.normalizeFormat(raw.contentFormat),
    };
  }

  private normalizeFormat(value: unknown) {
    const allowed = [
      'REALITNI_MINUTA',
      'CENY_NEMOVITOSTI',
      'HYPOTEKY',
      'TIP_PRO_MAJITELE',
      'TIP_PRO_KUPUJICI',
      'REKONSTRUKCE',
      'VEDELI_JSTE',
      'BREAKING_NEWS',
    ] as const;
    const v = String(value ?? '').trim().toUpperCase();
    return allowed.includes(v as (typeof allowed)[number])
      ? (v as ArticleScoreResult['contentFormat'])
      : undefined;
  }

  private normalizeScript(raw: ScriptJson, targetDurationSec: number): ReelScriptPayload {
    const segments = Array.isArray(raw.segments)
      ? raw.segments
          .map((s) => ({
            text: String(s.text ?? '').trim(),
            headline: s.headline ? String(s.headline).trim() : undefined,
          }))
          .filter((s) => s.text)
      : [];

    const spokenText =
      String(raw.spokenText ?? '').trim() ||
      [raw.hook, raw.intro, ...segments.map((s) => s.text), raw.cta]
        .map((x) => String(x ?? '').trim())
        .filter(Boolean)
        .join(' ');

    const scenes = Array.isArray(raw.scenes)
      ? raw.scenes.map((s, i) => ({
          start: typeof s.start === 'number' ? s.start : i * 5,
          duration: typeof s.duration === 'number' ? s.duration : 5,
          type: this.normalizeSceneType(s.type),
          text: s.text ? String(s.text) : undefined,
          mediaQuery: s.mediaQuery ? String(s.mediaQuery) : undefined,
          avatarPosition: s.avatarPosition ? String(s.avatarPosition) : undefined,
          headline: s.headline ? String(s.headline) : undefined,
        }))
      : this.fallbackScenes(spokenText, targetDurationSec);

    return {
      hook: String(raw.hook ?? '').trim(),
      intro: String(raw.intro ?? '').trim(),
      segments,
      cta: String(raw.cta ?? 'Více na XXREALIT.CZ').trim(),
      spokenText,
      captionTitle: String(raw.captionTitle ?? raw.hook ?? '').trim(),
      captionDescription: String(raw.captionDescription ?? '').trim(),
      hashtags: Array.isArray(raw.hashtags)
        ? raw.hashtags.map((h) => String(h).trim()).filter(Boolean)
        : ['#xxrealit', '#reality', '#bydleni'],
      estimatedDuration:
        typeof raw.estimatedDuration === 'number' ? raw.estimatedDuration : targetDurationSec,
      scenes,
      contentFormat: this.normalizeFormat(raw.contentFormat),
    };
  }

  private normalizeSceneType(value: unknown): ReelScriptPayload['scenes'][number]['type'] {
    const allowed = [
      'AVATAR_FULL',
      'AVATAR_LEFT',
      'AVATAR_RIGHT',
      'AVATAR_CIRCLE',
      'BROLL_FULL',
      'IMAGE_FULL',
      'STAT_CARD',
      'CTA',
    ] as const;
    const v = String(value ?? 'AVATAR_FULL').trim().toUpperCase();
    return allowed.includes(v as (typeof allowed)[number])
      ? (v as ReelScriptPayload['scenes'][number]['type'])
      : 'AVATAR_FULL';
  }

  private fallbackScenes(spokenText: string, durationSec: number) {
    const mid = Math.max(6, Math.round(durationSec / 2));
    return [
      { start: 0, duration: 4, type: 'AVATAR_FULL' as const, headline: spokenText.slice(0, 80) },
      { start: 4, duration: mid - 4, type: 'IMAGE_FULL' as const, mediaQuery: 'article' },
      { start: mid, duration: durationSec - mid, type: 'AVATAR_FULL' as const },
      { start: durationSec - 4, duration: 4, type: 'CTA' as const, text: 'Více na XXREALIT.CZ' },
    ];
  }

  private normalizeHooks(candidates: unknown, fallbackHook: string) {
    const list = Array.isArray(candidates)
      ? candidates.map((h) => String(h).trim()).filter(Boolean)
      : [];
    if (fallbackHook && !list.includes(fallbackHook)) list.unshift(fallbackHook);
    const filtered = list.filter((h) => !this.isForbiddenHook(h));
    return filtered.slice(0, 5);
  }

  private pickHook(candidates: string[], preferred: string) {
    const valid = candidates.filter((h) => h && !this.isForbiddenHook(h));
    if (preferred && !this.isForbiddenHook(preferred)) return preferred;
    return valid[0] || preferred || 'Tohle by měli vědět všichni na realitním trhu.';
  }

  private isForbiddenHook(hook: string) {
    const lower = hook.toLowerCase().trim();
    return FORBIDDEN_HOOK_PREFIXES.some((p) => lower.startsWith(p));
  }
}
