import type { AiInfluencerSceneLayout, ReelScenePlan } from './ai-influencer.types';
import { isAvatarSceneType, isVisualSceneType } from './ai-influencer-storyboard.util';
import { minimumSceneCountForDuration } from './ai-influencer-storyboard.util';

export type QualityGateMetrics = {
  sceneCount: number;
  avatarSceneCount: number;
  brollSceneCount: number;
  imageSceneCount: number;
  avgSceneDuration: number;
  backgroundVariationCount: number;
  pronunciationRulesApplied: string[];
  maxConsecutiveSameType: number;
};

export type QualityGateResult = {
  pass: boolean;
  code: 'PASS' | 'QUALITY_REVIEW_REQUIRED';
  failures: string[];
  metrics: QualityGateMetrics;
};

function sceneBackgroundKey(scene: ReelScenePlan): string {
  if (isVisualSceneType(scene.type)) {
    return `visual:${scene.mediaUrl ?? scene.mediaQuery ?? scene.type}`;
  }
  return `avatar:${scene.type}:${scene.avatarPosition ?? 'default'}`;
}

function maxConsecutiveSameType(scenes: ReelScenePlan[]): number {
  let max = 1;
  let run = 1;
  for (let i = 1; i < scenes.length; i++) {
    if (scenes[i].type === scenes[i - 1].type) {
      run += 1;
      max = Math.max(max, run);
    } else {
      run = 1;
    }
  }
  return max;
}

export function runQualityGate(input: {
  scenes: ReelScenePlan[];
  durationSec: number;
  generationMode: 'VIDEO_AGENT' | 'AVATAR';
  pronunciationRulesApplied?: string[];
  spokenTextSample?: string | null;
}): QualityGateResult {
  const scenes = input.scenes ?? [];
  const durationSec = Math.max(15, input.durationSec || 35);
  const minScenes = minimumSceneCountForDuration(durationSec);
  const failures: string[] = [];

  const avatarSceneCount = scenes.filter((s) => isAvatarSceneType(s.type)).length;
  const brollSceneCount = scenes.filter((s) => s.type === 'BROLL_FULL').length;
  const imageSceneCount = scenes.filter((s) => s.type === 'IMAGE_FULL').length;
  const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0) || durationSec;
  const avgSceneDuration = scenes.length ? totalDuration / scenes.length : totalDuration;
  const backgroundKeys = new Set(scenes.map(sceneBackgroundKey));
  const backgroundVariationCount = backgroundKeys.size;
  const consecutive = maxConsecutiveSameType(scenes);

  if (scenes.length < minScenes) {
    failures.push(`SCENES: ${scenes.length} < minimum ${minScenes}`);
  }
  if (avgSceneDuration > 8) {
    failures.push(`AVG_SCENE_DURATION: ${avgSceneDuration.toFixed(1)}s > 8s`);
  }
  if (consecutive > 2) {
    failures.push(`SCENE_VARIATION: same type ${consecutive}x in a row`);
  }
  if (backgroundVariationCount < 2 && durationSec > 20) {
    failures.push(`BACKGROUND_VARIATION: only ${backgroundVariationCount} distinct backgrounds`);
  }
  if (avatarSceneCount === scenes.length && scenes.length > 2) {
    failures.push('AVATAR_MONOTONE: entire video is avatar-only');
  }
  if (isVisualSceneType(scenes[0]?.type as AiInfluencerSceneLayout)) {
    failures.push('HOOK: first scene should be avatar hook');
  }
  const last = scenes[scenes.length - 1];
  if (!last || last.type !== 'CTA') {
    failures.push('CTA: missing CTA scene');
  }
  const visualCount = scenes.filter((s) => isVisualSceneType(s.type)).length;
  if (visualCount < 1 && durationSec > 20) {
    failures.push('BROLL: no visual/B-roll scenes');
  }
  if (/xxrealit/i.test(input.spokenTextSample ?? '') && !(input.pronunciationRulesApplied?.length ?? 0)) {
    failures.push('PRONUNCIATION: brand in script but rules not applied');
  }

  const metrics: QualityGateMetrics = {
    sceneCount: scenes.length,
    avatarSceneCount,
    brollSceneCount,
    imageSceneCount,
    avgSceneDuration: Math.round(avgSceneDuration * 10) / 10,
    backgroundVariationCount,
    pronunciationRulesApplied: input.pronunciationRulesApplied ?? [],
    maxConsecutiveSameType: consecutive,
  };

  return {
    pass: failures.length === 0,
    code: failures.length === 0 ? 'PASS' : 'QUALITY_REVIEW_REQUIRED',
    failures,
    metrics,
  };
}
