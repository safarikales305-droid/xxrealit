import type { AiInfluencerSceneLayout, ReelScenePlan, ReelScriptPayload } from './ai-influencer.types';

const AVATAR_SCENE_TYPES: AiInfluencerSceneLayout[] = [
  'AVATAR_FULL',
  'AVATAR_LEFT',
  'AVATAR_RIGHT',
  'AVATAR_CIRCLE',
  'CTA',
];

const VISUAL_SCENE_TYPES: AiInfluencerSceneLayout[] = [
  'BROLL_FULL',
  'IMAGE_FULL',
  'STAT_CARD',
];

const ALLOWED_TYPES: AiInfluencerSceneLayout[] = [
  ...AVATAR_SCENE_TYPES,
  ...VISUAL_SCENE_TYPES,
];

export type StoryboardValidationIssue = {
  code: string;
  message: string;
};

export type StoryboardValidationResult = {
  ok: boolean;
  scenes: ReelScenePlan[];
  issues: StoryboardValidationIssue[];
};

export function isAvatarSceneType(type: AiInfluencerSceneLayout): boolean {
  return AVATAR_SCENE_TYPES.includes(type);
}

export function isVisualSceneType(type: AiInfluencerSceneLayout): boolean {
  return VISUAL_SCENE_TYPES.includes(type);
}

export function normalizeSceneType(value: unknown): AiInfluencerSceneLayout {
  const v = String(value ?? 'AVATAR_FULL').trim().toUpperCase();
  if (v === 'AVATAR' || v === 'AVATAR_SCENE') return 'AVATAR_FULL';
  if (v === 'ARTICLE_IMAGE' || v === 'PORTAL_MEDIA') return 'IMAGE_FULL';
  if (ALLOWED_TYPES.includes(v as AiInfluencerSceneLayout)) {
    return v as AiInfluencerSceneLayout;
  }
  return 'AVATAR_FULL';
}

export function validateAndNormalizeStoryboard(
  script: Pick<ReelScriptPayload, 'hook' | 'scenes' | 'cta' | 'estimatedDuration' | 'spokenText'>,
  targetDurationSec: number,
): StoryboardValidationResult {
  const issues: StoryboardValidationIssue[] = [];
  const minDur = Math.max(20, targetDurationSec - 10);
  const maxDur = Math.min(65, targetDurationSec + 15);

  let scenes = Array.isArray(script.scenes) ? [...script.scenes] : [];
  if (!scenes.length) {
    scenes = buildFallbackStoryboard(script.spokenText, script.hook, script.cta, targetDurationSec);
    issues.push({
      code: 'STORYBOARD_FALLBACK',
      message: 'AI nevrátilo scény — použit výchozí storyboard.',
    });
  }

  const normalized: ReelScenePlan[] = [];
  let cursor = 0;
  for (let i = 0; i < scenes.length; i++) {
    const raw = scenes[i];
    const type = normalizeSceneType(raw.type);
    let duration = typeof raw.duration === 'number' && raw.duration > 0 ? raw.duration : 4;
    duration = Math.min(12, Math.max(2, duration));
    const start = typeof raw.start === 'number' && raw.start >= 0 ? raw.start : cursor;
    cursor = Math.max(cursor, start) + duration;

    normalized.push({
      start: Math.round(start * 10) / 10,
      duration: Math.round(duration * 10) / 10,
      type,
      text: raw.text?.trim() || undefined,
      headline: raw.headline?.trim() || undefined,
      mediaQuery: raw.mediaQuery?.trim() || undefined,
      avatarPosition: raw.avatarPosition?.trim() || undefined,
      mediaUrl: raw.mediaUrl?.trim() || undefined,
      generatedAsset: raw.generatedAsset === true,
    });
  }

  const total = normalized.reduce((sum, s) => sum + s.duration, 0);
  if (total < minDur || total > maxDur) {
    const scale = targetDurationSec / Math.max(total, 1);
    let t = 0;
    for (const scene of normalized) {
      scene.duration = Math.round(Math.max(2, scene.duration * scale) * 10) / 10;
      scene.start = Math.round(t * 10) / 10;
      t += scene.duration;
    }
    issues.push({
      code: 'STORYBOARD_DURATION_ADJUSTED',
      message: `Délka storyboardu upravena na ~${targetDurationSec}s.`,
    });
  }

  const hookScene = normalized[0];
  if (!hookScene || !isAvatarSceneType(hookScene.type)) {
    normalized.unshift({
      start: 0,
      duration: 3,
      type: 'AVATAR_FULL',
      headline: script.hook?.trim() || 'HOOK',
      text: script.hook?.trim(),
    });
    let offset = 0;
    for (const s of normalized) {
      s.start = offset;
      offset += s.duration;
    }
  } else if (hookScene.duration > 4) {
    hookScene.duration = 3;
  }

  const visualCount = normalized.filter((s) => isVisualSceneType(s.type)).length;
  if (visualCount < 1 && normalized.length < 4) {
    const insertAt = Math.min(2, normalized.length);
    const dur = 4;
    normalized.splice(insertAt, 0, {
      start: 0,
      duration: dur,
      type: 'IMAGE_FULL',
      mediaQuery: 'article cover',
      text: script.hook,
    });
    let offset = 0;
    for (const s of normalized) {
      s.start = offset;
      offset += s.duration;
    }
    issues.push({
      code: 'STORYBOARD_VISUAL_INSERTED',
      message: 'Přidána B-roll scéna z obrázku článku.',
    });
  }

  const last = normalized[normalized.length - 1];
  if (!last || last.type !== 'CTA') {
    normalized.push({
      start: normalized.reduce((s, x) => s + x.duration, 0),
      duration: 4,
      type: 'CTA',
      headline: 'CTA',
      text: script.cta,
    });
    let offset = 0;
    for (const s of normalized) {
      s.start = offset;
      offset += s.duration;
    }
  }

  const avatarScenes = normalized.filter((s) => isAvatarSceneType(s.type)).length;
  if (avatarScenes === normalized.length) {
    issues.push({
      code: 'STORYBOARD_MONOTONE',
      message: 'Storyboard obsahuje pouze avatar — doporučeno střídání vizuálů.',
    });
  }

  return { ok: issues.every((i) => i.code !== 'STORYBOARD_INVALID'), scenes: normalized, issues };
}

export function buildFallbackStoryboard(
  spokenText: string,
  hook: string,
  cta: string,
  targetDurationSec: number,
): ReelScenePlan[] {
  const total = Math.max(25, Math.min(50, targetDurationSec));
  const seg = Math.max(3, Math.floor(total / 6));
  return [
    { start: 0, duration: 3, type: 'AVATAR_FULL', headline: hook, text: hook },
    { start: 3, duration: seg, type: 'AVATAR_FULL', text: spokenText.slice(0, 120) },
    { start: 3 + seg, duration: seg, type: 'IMAGE_FULL', mediaQuery: 'article cover' },
    { start: 3 + seg * 2, duration: seg, type: 'AVATAR_FULL' },
    { start: 3 + seg * 3, duration: seg, type: 'BROLL_FULL', mediaQuery: 'article' },
    { start: 3 + seg * 4, duration: seg, type: 'AVATAR_FULL' },
    { start: 3 + seg * 5, duration: Math.max(3, total - (3 + seg * 5)), type: 'CTA', text: cta },
  ];
}

export function storyboardPreviewRows(scenes: ReelScenePlan[]) {
  return scenes.map((scene, index) => ({
    index: index + 1,
    label: sceneLabel(scene.type),
    type: scene.type,
    durationSec: scene.duration,
    startSec: scene.start,
    caption: scene.headline ?? scene.text ?? null,
    mediaUrl: scene.mediaUrl ?? null,
    disabled: false,
  }));
}

function sceneLabel(type: AiInfluencerSceneLayout): string {
  switch (type) {
    case 'AVATAR_FULL':
      return 'AVATAR';
    case 'AVATAR_LEFT':
    case 'AVATAR_RIGHT':
    case 'AVATAR_CIRCLE':
      return 'AVATAR';
    case 'IMAGE_FULL':
      return 'ARTICLE IMAGE';
    case 'BROLL_FULL':
      return 'B-ROLL';
    case 'STAT_CARD':
      return 'GRAFIKA';
    case 'CTA':
      return 'CTA';
    default:
      return type;
  }
}
