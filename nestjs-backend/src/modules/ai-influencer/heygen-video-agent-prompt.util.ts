import type { AiInfluencerAutomationSettings } from './ai-influencer.types';
import type { ReelScenePlan, ReelScriptPayload } from './ai-influencer.types';

export type VideoAgentMediaFile = {
  type: 'url';
  url: string;
  label?: string;
};

export type BuildVideoAgentPromptInput = {
  script: Pick<
    ReelScriptPayload,
    'hook' | 'spokenText' | 'captionTitle' | 'cta' | 'estimatedDuration' | 'scenes'
  >;
  settings: Pick<
    AiInfluencerAutomationSettings,
    | 'targetDurationSec'
    | 'scenePacing'
    | 'videoGoal'
    | 'mentionBrandInScript'
    | 'brandDisplayName'
    | 'useSubtitles'
    | 'useLogo'
  >;
  avatarId: string | null;
  voiceId?: string | null;
  videoStyle?: 'dynamic_influencer' | 'real_estate_news' | 'property_showcase' | 'educational' | 'auto';
  avatarFrequency?: 'low' | 'medium' | 'high';
  contentKind: 'ARTICLE' | 'PROPERTY';
  mediaFiles?: VideoAgentMediaFile[];
};

function sceneTypeLabel(type: ReelScenePlan['type']): string {
  switch (type) {
    case 'AVATAR_FULL':
    case 'AVATAR_LEFT':
    case 'AVATAR_RIGHT':
    case 'AVATAR_CIRCLE':
      return 'AVATAR';
    case 'IMAGE_FULL':
      return 'ARTICLE_IMAGE';
    case 'BROLL_FULL':
      return 'BROLL';
    case 'STAT_CARD':
      return 'STAT_CARD';
    case 'CTA':
      return 'CTA';
    default:
      return String(type);
  }
}

function avatarFrequencyInstruction(freq: BuildVideoAgentPromptInput['avatarFrequency']): string {
  if (freq === 'low') {
    return 'Use the presenter in roughly 25–35% of scenes (hook, one mid explanation, final CTA). Most visuals should be property/article B-roll and photos.';
  }
  if (freq === 'high') {
    return 'Use the presenter frequently but still alternate with visuals every few seconds — never a single static talking-head shot for the whole video.';
  }
  return 'Use the presenter as a recurring host in about 40–50% of scenes. Alternate presenter with property/news visuals — never one continuous talking-head shot.';
}

function styleInstruction(style: BuildVideoAgentPromptInput['videoStyle']): string {
  switch (style) {
    case 'real_estate_news':
      return 'Style: Czech real-estate news moderator — credible, energetic, short sentences, news pacing.';
    case 'property_showcase':
      return 'Style: property showcase reel — highlight photos, room transitions, lifestyle B-roll, confident presenter.';
    case 'educational':
      return 'Style: educational explainer — clear facts, calm confidence, helpful tone.';
    case 'dynamic_influencer':
      return 'Style: social media real-estate influencer — conversational, natural gestures, subtle emotion, eye contact.';
    default:
      return 'Style: auto — choose the best real-estate social presenter tone for the content.';
  }
}

/** Sestaví prompt pro HeyGen Video Agent API (max ~10000 chars). */
export function buildHeyGenVideoAgentPrompt(input: BuildVideoAgentPromptInput): string {
  const duration = input.settings.targetDurationSec ?? input.script.estimatedDuration ?? 40;
  const brand = input.settings.brandDisplayName || 'XXREALIT';
  const scenes = (input.script.scenes ?? []).slice(0, 14);

  const sceneLines = scenes.map((scene, i) => {
    const media = scene.mediaUrl ? ` media=${scene.mediaUrl}` : scene.mediaQuery ? ` visual=${scene.mediaQuery}` : '';
    const narration = scene.text || scene.headline || '';
    return `Scene ${i + 1} (${sceneTypeLabel(scene.type)}, ${Math.round(scene.duration)}s): ${narration}${media}`;
  });

  const mediaNote =
    input.mediaFiles?.length ?
      `\nAttached media URLs (use as fullscreen visuals, no black borders):\n${input.mediaFiles
        .slice(0, 20)
        .map((f, i) => `- [${i + 1}] ${f.label ?? 'media'}: ${f.url}`)
        .join('\n')}`
    : '';

  const prompt = [
    `Create a polished vertical real-estate social video in Czech.`,
    `Format: portrait 9:16, 1080x1920, fullscreen composition — NO black letterbox/pillarbox bars.`,
    `Target duration: ${duration} seconds (${input.settings.scenePacing === 'dynamic' ? 'dynamic pacing' : 'balanced pacing'}).`,
    styleInstruction(input.videoStyle),
    avatarFrequencyInstruction(input.avatarFrequency),
    input.contentKind === 'PROPERTY'
      ? 'Content type: property listing reel — prioritize listing photos, interiors, layout, location; presenter explains key facts.'
      : 'Content type: real-estate news reel — hook with a fact, explain why it matters for buyers/renters/investors, use article visuals.',
    `Hook: ${input.script.hook}`,
    `Narration script (spoken Czech, short sentences): ${input.script.spokenText}`,
    `CTA: ${input.script.cta || `Více najdete na ${brand}.CZ`}`,
    input.settings.mentionBrandInScript ? `Mention brand "${brand}" naturally at least once.` : '',
    input.settings.useSubtitles ? 'Add readable Czech subtitles (1–2 lines, safe zones, do not cover face).' : '',
    input.settings.useLogo ? `Include subtle ${brand} branding/watermark.` : '',
    'Presenter: confident, natural gestures, conversational delivery, social media presenter (not corporate training).',
    'Alternate presenter scenes with property/news visuals. Use short dynamic scenes.',
    'Scene plan:',
    ...sceneLines,
    mediaNote,
  ]
    .filter(Boolean)
    .join('\n');

  return prompt.slice(0, 9900);
}

export function collectStoryboardMediaUrls(scenes: ReelScenePlan[]): VideoAgentMediaFile[] {
  const seen = new Set<string>();
  const out: VideoAgentMediaFile[] = [];
  for (const scene of scenes) {
    const url = scene.mediaUrl?.trim();
    if (!url || !url.startsWith('https://') || seen.has(url)) continue;
    seen.add(url);
    out.push({
      type: 'url',
      url,
      label: sceneTypeLabel(scene.type),
    });
  }
  return out.slice(0, 20);
}
