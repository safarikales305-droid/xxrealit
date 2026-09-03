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
  autoPublishYoutube: boolean;
  youtubePrivacyStatus: 'private' | 'unlisted' | 'public';
  voiceCostPer1kCharsCzk: number;
  avatarCostPerSecCzk: number;
};

export const DEFAULT_AI_INFLUENCER_SETTINGS: AiInfluencerAutomationSettings = {
  enabled: false,
  minScore: 75,
  maxPerDay: 3,
  maxPerWeek: 15,
  minIntervalHours: 3,
  breakingThreshold: 92,
  approvalMode: 'SEMI_AUTO',
  dailyBudgetCzk: 300,
  qualityMode: 'STANDARD',
  targetDurationSec: 35,
  minDurationSec: 20,
  maxDurationSec: 60,
  defaultMusicTrackId: null,
  publishWindows: ['08:00', '12:30', '18:30'],
  autoPublishFacebook: false,
  autoPublishYoutube: false,
  youtubePrivacyStatus: 'private',
  voiceCostPer1kCharsCzk: 0.18,
  avatarCostPerSecCzk: 0.35,
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
