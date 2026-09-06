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
      return 'Style: Czech real-estate news — credible social presenter, NOT corporate trainer or robotic newsreader. Short spoken sentences, natural pauses, direct eye contact.';
    case 'property_showcase':
      return 'Style: property showcase Reel — highlight listing photos with jump cuts, room transitions, lifestyle B-roll, confident presenter between scenes.';
    case 'educational':
      return 'Style: educational explainer — clear facts, calm confidence, conversational Czech, not a lecture.';
    case 'dynamic_influencer':
      return 'Style: modern TikTok/Reels real-estate influencer — energetic but credible, conversational, natural gestures, subtle emotion, jump-cut pacing.';
    default:
      return 'Style: natural social media real-estate presenter — confident, conversational, energetic but credible, short sentences, NOT corporate training video.';
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
    'Presenter: natural social media presenter, modern real-estate influencer, confident, conversational, energetic but credible.',
    'Delivery: short spoken Czech sentences (5–15 words), natural pauses, natural gestures, direct eye contact — NOT reading an article.',
    'Editing: modern Reels/Shorts cut — mostly hard CUTs, occasional short crossfade; jump cuts on avatar between sentences; scene length 2–6s (hook 1.5–3s, CTA 3–5s).',
    'Never keep the same avatar size, position, framing, or background for more than one short scene. Alternate full/medium/close, left/right, PIP, avatar-over-visual.',
    'Vary backgrounds: interiors, city, office, listing photos, article images, thematic B-roll — NOT one static backdrop for the whole video.',
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

/** Krátký test prompt (5–10 s) pro admin Video Agent test — bez publish. */
export function buildHeyGenVideoAgentTestPrompt(
  input: Pick<
    BuildVideoAgentPromptInput,
    'settings' | 'avatarId' | 'videoStyle' | 'avatarFrequency'
  >,
): string {
  const brand = input.settings.brandDisplayName || 'XXREALIT';
  return buildHeyGenVideoAgentPrompt({
    script: {
      hook: 'Vítejte na XXREALIT.',
      spokenText: 'Vítejte na XXREALIT. Toto je test dynamického AI videa.',
      captionTitle: 'Video Agent test',
      cta: `Více najdete na ${brand}.CZ`,
      estimatedDuration: 8,
      scenes: [
        { type: 'AVATAR_FULL', start: 0, duration: 3, text: 'Vítejte na XXREALIT.' },
        { type: 'BROLL_FULL', start: 3, duration: 3, text: 'Toto je test dynamického AI videa.' },
        { type: 'CTA', start: 6, duration: 2, text: `Více na ${brand}.CZ` },
      ],
    },
    settings: { ...input.settings, targetDurationSec: 8 },
    avatarId: input.avatarId,
    videoStyle: input.videoStyle,
    avatarFrequency: input.avatarFrequency,
    contentKind: 'ARTICLE',
  });
}
