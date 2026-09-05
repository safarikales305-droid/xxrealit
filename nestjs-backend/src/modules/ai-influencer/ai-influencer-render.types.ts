import type { ReelScenePlan } from './ai-influencer.types';

export const REEL_CANVAS_WIDTH = 1080;
export const REEL_CANVAS_HEIGHT = 1920;
export const REEL_FPS = 30;

export const REEL_SAFE_AREA = {
  top: 180,
  bottom: 330,
  left: 70,
  right: 150,
} as const;

export type AiInfluencerLayoutMode =
  | 'SMART_AUTO'
  | 'AVATAR_FULLSCREEN'
  | 'AVATAR_BLUR'
  | 'AVATAR_CONTENT'
  | 'PICTURE_IN_PICTURE';

export type AiInfluencerRenderPresetId = 'modern_xxrealit' | 'minimal' | 'bold_hook';

export type AiInfluencerSubtitleSettings = {
  enabled: boolean;
  fontSize: number;
  maxLines: number;
  position: 'bottom' | 'center';
  bottomMargin: number;
  maxWidthPercent: number;
  background: boolean;
  outline: boolean;
  shadow: boolean;
  fontWeight: 'normal' | 'bold';
};

export type AiInfluencerHookSettings = {
  enabled: boolean;
  fontSize: number;
  maxLines: number;
  topMargin: number;
};

export type AiInfluencerBrandingSettings = {
  logoEnabled: boolean;
  logoSize: number;
  logoX: number;
  logoY: number;
  logoOpacity: number;
};

export type AiInfluencerWatermarkSettings = {
  enabled: boolean;
  text: string;
  opacity: number;
  fontSize: number;
  y: number;
};

export type AiInfluencerMusicSettings = {
  trackId: string | null;
  musicVolume: number;
  voiceVolume: number;
  ducking: boolean;
  fadeInSec: number;
  fadeOutSec: number;
};

export type AiInfluencerAvatarLayoutSettings = {
  sizePercent: number;
  offsetX: number;
  offsetY: number;
  zoom: number;
  focalY: 'top' | 'center' | 'bottom';
  position: 'top' | 'center' | 'bottom';
};

export type AiInfluencerColorSettings = {
  background: string;
  text: string;
  accent: string;
};

export type AiInfluencerRenderSettings = {
  preset: AiInfluencerRenderPresetId;
  layout: AiInfluencerLayoutMode;
  avatar: AiInfluencerAvatarLayoutSettings;
  subtitles: AiInfluencerSubtitleSettings;
  hook: AiInfluencerHookSettings;
  branding: AiInfluencerBrandingSettings;
  watermark: AiInfluencerWatermarkSettings;
  colors: AiInfluencerColorSettings;
  music: AiInfluencerMusicSettings;
  transitions: boolean;
  introSec: number;
  outroSec: number;
};

export const DEFAULT_RENDER_SETTINGS: AiInfluencerRenderSettings = {
  preset: 'modern_xxrealit',
  layout: 'SMART_AUTO',
  avatar: {
    sizePercent: 100,
    offsetX: 0,
    offsetY: 0,
    zoom: 1,
    focalY: 'center',
    position: 'center',
  },
  subtitles: {
    enabled: true,
    fontSize: 58,
    maxLines: 2,
    position: 'bottom',
    bottomMargin: 340,
    maxWidthPercent: 88,
    background: true,
    outline: true,
    shadow: true,
    fontWeight: 'bold',
  },
  hook: {
    enabled: true,
    fontSize: 56,
    maxLines: 2,
    topMargin: 200,
  },
  branding: {
    logoEnabled: true,
    logoSize: 96,
    logoX: 48,
    logoY: 48,
    logoOpacity: 0.92,
  },
  watermark: {
    enabled: true,
    text: 'XXREALIT.CZ',
    opacity: 0.78,
    fontSize: 34,
    y: 220,
  },
  colors: {
    background: '#0f172a',
    text: '#ffffff',
    accent: '#f97316',
  },
  music: {
    trackId: null,
    musicVolume: 0.12,
    voiceVolume: 1,
    ducking: true,
    fadeInSec: 0.8,
    fadeOutSec: 1.2,
  },
  transitions: true,
  introSec: 0,
  outroSec: 0,
};

export type SubtitleCue = {
  startSec: number;
  endSec: number;
  text: string;
};

export type RenderValidationIssue = {
  code: string;
  message: string;
  severity: 'error' | 'warning';
};

export type RenderValidationResult = {
  ok: boolean;
  issues: RenderValidationIssue[];
};

export type AiInfluencerCompositorInput = {
  avatarVideoPath: string;
  voiceAudioPath: string;
  scenes: ReelScenePlan[];
  hookText: string;
  spokenText?: string;
  musicFilePath?: string | null;
  logoPath?: string | null;
  settings: AiInfluencerRenderSettings;
  brollImagePath?: string | null;
};

export function mergeRenderSettings(
  partial?: Partial<AiInfluencerRenderSettings> | null,
): AiInfluencerRenderSettings {
  if (!partial) return { ...DEFAULT_RENDER_SETTINGS };
  const merged = {
    ...DEFAULT_RENDER_SETTINGS,
    ...partial,
    avatar: { ...DEFAULT_RENDER_SETTINGS.avatar, ...partial.avatar },
    subtitles: { ...DEFAULT_RENDER_SETTINGS.subtitles, ...partial.subtitles },
    hook: { ...DEFAULT_RENDER_SETTINGS.hook, ...partial.hook },
    branding: { ...DEFAULT_RENDER_SETTINGS.branding, ...partial.branding },
    watermark: { ...DEFAULT_RENDER_SETTINGS.watermark, ...partial.watermark },
    colors: { ...DEFAULT_RENDER_SETTINGS.colors, ...partial.colors },
    music: { ...DEFAULT_RENDER_SETTINGS.music, ...partial.music },
  };
  return applyRenderPreset(merged);
}

export function applyRenderPreset(settings: AiInfluencerRenderSettings): AiInfluencerRenderSettings {
  const next = { ...settings };
  switch (settings.preset) {
    case 'minimal':
      next.subtitles = {
        ...next.subtitles,
        fontSize: 54,
        background: false,
        outline: true,
      };
      next.hook = { ...next.hook, fontSize: 52 };
      next.colors = { ...next.colors, accent: '#38bdf8' };
      break;
    case 'bold_hook':
      next.subtitles = { ...next.subtitles, fontSize: 62, fontWeight: 'bold' };
      next.hook = { ...next.hook, fontSize: 64, maxLines: 2 };
      next.colors = { ...next.colors, accent: '#f97316' };
      break;
    case 'modern_xxrealit':
    default:
      next.layout = 'SMART_AUTO';
      next.subtitles = {
        ...next.subtitles,
        fontSize: Math.max(next.subtitles.fontSize, 58),
        maxLines: 2,
        bottomMargin: Math.max(next.subtitles.bottomMargin, 340),
      };
      break;
  }
  return next;
}

export function resolveSmartLayout(sourceWidth: number, sourceHeight: number): AiInfluencerLayoutMode {
  if (!sourceWidth || !sourceHeight) return 'AVATAR_BLUR';
  const ratio = sourceWidth / sourceHeight;
  // Prefer blur background over crop/pillarbox for portrait and near-portrait sources.
  if (ratio < 1.15) return 'AVATAR_BLUR';
  return 'AVATAR_CONTENT';
}
