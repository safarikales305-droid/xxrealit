import type {
  AiAvatarProviderType,
  AiInfluencerApprovalMode,
  AiInfluencerContentFormat,
  AiInfluencerQualityMode,
  AiVoiceProviderType,
} from '@prisma/client';

export type AiInfluencerSceneLayout =
  | 'AVATAR_FULL'
  | 'AVATAR_LEFT'
  | 'AVATAR_RIGHT'
  | 'AVATAR_CIRCLE'
  | 'BROLL_FULL'
  | 'IMAGE_FULL'
  | 'STAT_CARD'
  | 'CTA';

export type ReelScenePlan = {
  start: number;
  duration: number;
  type: AiInfluencerSceneLayout;
  text?: string;
  mediaQuery?: string;
  avatarPosition?: string;
  headline?: string;
  mediaUrl?: string;
  generatedAsset?: boolean;
  mediaSource?: AiInfluencerSceneMediaSource;
  caption?: string;
  visualInstruction?: string;
  id?: string;
};

export type ReelScriptPayload = {
  hook: string;
  intro: string;
  segments: Array<{ text: string; headline?: string }>;
  cta: string;
  spokenText: string;
  captionTitle: string;
  captionDescription: string;
  hashtags: string[];
  estimatedDuration: number;
  scenes: ReelScenePlan[];
  contentFormat?: AiInfluencerContentFormat;
};

export type ArticleScoreResult = {
  reelPotentialScore: number;
  topicInterest: number;
  freshness: number;
  hookPotential: number;
  practicalValue: number;
  emotionalInterest: number;
  visualPotential: number;
  localInterest: number;
  sourceTrust: number;
  duplicationPenalty: number;
  reasoningSummary: string[];
  contentFormat?: AiInfluencerContentFormat;
};

export type AiInfluencerDurationPreset = '25_35' | '35_45' | '45_60';
export type AiInfluencerScenePacing = 'dynamic' | 'calm' | 'balanced';
export type AiInfluencerVideoGenerationMode = 'VIDEO_AGENT' | 'AVATAR';
export type AiInfluencerVideoStyle =
  | 'dynamic_influencer'
  | 'real_estate_news'
  | 'property_showcase'
  | 'educational'
  | 'auto';
export type AiInfluencerAvatarFrequency = 'low' | 'medium' | 'high';
export type AiInfluencerAvatarFraming = 'auto' | 'fullscreen' | 'medium' | 'closeup_mix';
export type AiInfluencerBackgroundMode = 'auto' | 'real_estate' | 'urban' | 'interiors' | 'mix';
export type AiInfluencerSceneFrequency = 'very_dynamic' | 'dynamic' | 'balanced';
export type AiInfluencerVideoTempo = 'dynamic' | 'balanced' | 'calm';

export type AiInfluencerSceneMediaSource =
  | 'PROPERTY_IMAGE'
  | 'ARTICLE_IMAGE'
  | 'PORTAL_MEDIA'
  | 'OWNED_VIDEO'
  | 'GENERATED_VISUAL'
  | 'AVATAR'
  | 'BROLL';

export type AiInfluencerJobRenderMeta = {
  videoGenerationMode?: AiInfluencerVideoGenerationMode;
  generationModeUsed?: AiInfluencerVideoGenerationMode;
  heygenVideoAgentSessionId?: string;
  heygenVideoAgentVideoId?: string;
  usedVideoAgentFallback?: boolean;
  videoAgentMaster?: boolean;
  fallbackNotice?: string;
  videoAgentSubmittedAt?: string;
  pronunciationRulesApplied?: string[];
  qualityMetrics?: Record<string, unknown>;
  isProductionTest?: boolean;
  testDurationSec?: number;
  testKind?: 'FULL' | 'VIDEO_AGENT';
  useFixedTestScript?: boolean;
};
export type AiInfluencerVideoGoal =
  | 'website_traffic'
  | 'youtube_subscribe'
  | 'facebook_follow'
  | 'instagram_follow'
  | 'auto';

export type SpokenBrandingMode = 'AUTO' | 'INTRO' | 'OUTRO' | 'INTRO_AND_OUTRO' | 'OFF';
export type PublishMode = 'MANUAL' | 'AUTO_AFTER_GENERATION' | 'SCHEDULED';
export type BrandingFrequency = 'EVERY' | 'EVERY_OTHER' | 'OUTRO_ONLY' | 'INTRO_ONLY' | 'OFF';

export type AiInfluencerAutomationSettings = {
  enabled: boolean;
  minScore: number;
  maxPerDay: number;
  maxPerWeek: number;
  minIntervalHours: number;
  breakingThreshold: number;
  approvalMode: AiInfluencerApprovalMode;
  dailyBudgetCzk: number;
  qualityMode: AiInfluencerQualityMode;
  targetDurationSec: number;
  minDurationSec: number;
  maxDurationSec: number;
  defaultMusicTrackId: string | null;
  publishWindows: string[];
  autoPublishFacebook: boolean;
  autoPublishInstagram: boolean;
  autoPublishYoutube: boolean;
  autoPublishPortal: boolean;
  youtubePrivacyStatus: 'private' | 'unlisted' | 'public';
  voiceCostPer1kCharsCzk: number;
  avatarCostPerSecCzk: number;
  generationStartTime: string;
  generationEndTime: string;
  checkIntervalMinutes: number;
  preferredCategories: string[];
  blockedCategories: string[];
  sourceBlacklist: string[];
  facebookPublishMode: PublishMode;
  instagramPublishMode: PublishMode;
  youtubePublishMode: PublishMode;
  portalPublishMode: PublishMode;
  publishWindowStart: string;
  publishWindowEnd: string;
  minPublishSpacingMinutes: number;
  maxFacebookPerDay: number;
  maxInstagramPerDay: number;
  maxYoutubePerDay: number;
  maxPortalPerDay: number;
  brandingEnabled: boolean;
  logoEnabled: boolean;
  logoPosition: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right';
  logoScalePercent: number;
  logoOpacity: number;
  logoPaddingPx: number;
  websiteWatermarkEnabled: boolean;
  websiteText: string;
  websiteWatermarkOpacity: number;
  websiteWatermarkFontSize: number;
  spokenBrandingEnabled: boolean;
  spokenBrandingMode: SpokenBrandingMode;
  brandDisplayName: string;
  brandTtsPronunciation: string;
  introTemplate: string;
  outroTemplate: string;
  brandingFrequency: BrandingFrequency;
  jobsConcurrency: number;
  heygenConcurrency: number;
  automationPaused: boolean;
  automationPauseReason: string | null;
  /** Jediný podporovaný formát — vždy VERTICAL_SHORT_9_16 */
  videoFormat: 'VERTICAL_SHORT_9_16';
  durationPreset: AiInfluencerDurationPreset;
  scenePacing: AiInfluencerScenePacing;
  useArticleImages: boolean;
  usePortalMedia: boolean;
  useBroll: boolean;
  useMusic: boolean;
  useSubtitles: boolean;
  useLogo: boolean;
  useCta: boolean;
  mentionBrandInScript: boolean;
  videoGoal: AiInfluencerVideoGoal;
  /** Hlavní režim: HeyGen Video Agent (default) nebo jednoduchý avatar fallback pipeline */
  videoGenerationMode: AiInfluencerVideoGenerationMode;
  allowVideoAgentFallback: boolean;
  videoStyle: AiInfluencerVideoStyle;
  avatarFrequency: AiInfluencerAvatarFrequency;
  avatarFraming: AiInfluencerAvatarFraming;
  backgroundMode: AiInfluencerBackgroundMode;
  sceneFrequency: AiInfluencerSceneFrequency;
  videoTempo: AiInfluencerVideoTempo;
  usePropertyImages: boolean;
  useTextGraphics: boolean;
  ctaTextMode: 'auto' | 'custom';
  customCtaText: string;
  youtubeCtaText: string;
};

export const DEFAULT_PREFERRED_CATEGORIES = [
  'Reality',
  'Bydlení',
  'Investice',
  'Hypotéky',
  'Stavebnictví',
  'Rekonstrukce',
  'Architektura',
  'Zajímavosti',
];

export const DEFAULT_AI_INFLUENCER_SETTINGS: AiInfluencerAutomationSettings = {
  enabled: false,
  minScore: 75,
  maxPerDay: 5,
  maxPerWeek: 15,
  minIntervalHours: 3,
  breakingThreshold: 92,
  approvalMode: 'SEMI_AUTO',
  dailyBudgetCzk: 250,
  qualityMode: 'STANDARD',
  targetDurationSec: 35,
  minDurationSec: 20,
  maxDurationSec: 60,
  defaultMusicTrackId: null,
  publishWindows: ['08:00', '12:30', '18:30'],
  autoPublishFacebook: true,
  autoPublishInstagram: false,
  autoPublishYoutube: false,
  autoPublishPortal: true,
  youtubePrivacyStatus: 'private',
  voiceCostPer1kCharsCzk: 0.18,
  avatarCostPerSecCzk: 0.35,
  generationStartTime: '07:00',
  generationEndTime: '22:00',
  checkIntervalMinutes: 30,
  preferredCategories: [...DEFAULT_PREFERRED_CATEGORIES],
  blockedCategories: [],
  sourceBlacklist: [],
  facebookPublishMode: 'AUTO_AFTER_GENERATION',
  instagramPublishMode: 'MANUAL',
  youtubePublishMode: 'MANUAL',
  portalPublishMode: 'AUTO_AFTER_GENERATION',
  publishWindowStart: '08:00',
  publishWindowEnd: '21:00',
  minPublishSpacingMinutes: 120,
  maxFacebookPerDay: 3,
  maxInstagramPerDay: 3,
  maxYoutubePerDay: 3,
  maxPortalPerDay: 5,
  brandingEnabled: true,
  logoEnabled: true,
  logoPosition: 'top_left',
  logoScalePercent: 14,
  logoOpacity: 0.9,
  logoPaddingPx: 40,
  websiteWatermarkEnabled: true,
  websiteText: 'XXREALIT.CZ',
  websiteWatermarkOpacity: 0.78,
  websiteWatermarkFontSize: 34,
  spokenBrandingEnabled: true,
  spokenBrandingMode: 'AUTO',
  brandDisplayName: 'XXREALIT',
  brandTtsPronunciation: 'iks iks realit',
  introTemplate: 'Vítejte u XXREALIT.',
  outroTemplate: 'Sledujte XXREALIT pro další novinky ze světa realit a bydlení.',
  brandingFrequency: 'EVERY',
  jobsConcurrency: 1,
  heygenConcurrency: 1,
  automationPaused: false,
  automationPauseReason: null,
  videoFormat: 'VERTICAL_SHORT_9_16',
  durationPreset: '25_35',
  scenePacing: 'dynamic',
  useArticleImages: true,
  usePortalMedia: true,
  useBroll: true,
  useMusic: true,
  useSubtitles: true,
  useLogo: true,
  useCta: true,
  mentionBrandInScript: true,
  videoGoal: 'auto',
  videoGenerationMode: 'VIDEO_AGENT',
  allowVideoAgentFallback: true,
  videoStyle: 'auto',
  avatarFrequency: 'medium',
  avatarFraming: 'fullscreen',
  backgroundMode: 'auto',
  sceneFrequency: 'dynamic',
  videoTempo: 'dynamic',
  usePropertyImages: true,
  useTextGraphics: true,
  ctaTextMode: 'auto',
  customCtaText: 'Více najdete na XXREALIT.CZ.',
  youtubeCtaText: 'Sledujte XXREALIT a dejte odběr.',
};

export type VoiceGenerateInput = {
  text: string;
  voiceId?: string;
  language?: string;
  speed?: number;
  stability?: number;
  style?: number;
};

export type VoiceGenerateResult = {
  audioBuffer: Buffer;
  mimeType: string;
  durationSec: number | null;
  costEstimatedCzk: number;
  contentHash: string;
};

export type AvatarGenerateInput = {
  audioUrl?: string;
  text?: string;
  avatarId?: string;
  voiceId?: string;
  width?: number;
  height?: number;
};

export type AvatarGenerateStartResult = {
  externalJobId: string;
  costEstimatedCzk: number;
  contentHash: string;
};

export type AvatarPollResult = {
  status: 'QUEUED' | 'GENERATING' | 'READY' | 'FAILED';
  videoUrl?: string;
  errorMessage?: string;
};

export type ProviderConnectionStatus = {
  configured: boolean;
  connected: boolean | null;
  lastError?: string | null;
  latencyMs?: number | null;
};

export type AiInfluencerProviderConfig = {
  avatarProvider: AiAvatarProviderType;
  voiceProvider: AiVoiceProviderType;
  avatarId: string | null;
  voiceId: string | null;
};
