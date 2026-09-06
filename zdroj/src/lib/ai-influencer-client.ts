import { API_BASE_URL } from './api';
import { nestAuthHeaders } from './nest-client';

async function aiInfluencerFetch<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  const res = await fetch(`${API_BASE_URL}/admin/ai-influencer${path}`, {
    ...init,
    headers: {
      ...nestAuthHeaders(token),
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export type ElevenLabsProviderStatus = {
  configured: boolean;
  connected: boolean | null;
  apiKeyPresence?: 'CONFIGURED' | 'MISSING';
  voiceIdPresence?: 'CONFIGURED' | 'MISSING';
  ttsReady?: boolean;
  voicesReadStatus?: string;
  status?:
    | 'NOT_CONFIGURED'
    | 'CONNECTED'
    | 'INVALID_API_KEY'
    | 'INSUFFICIENT_PERMISSIONS'
    | 'RATE_LIMITED'
    | 'QUOTA_EXCEEDED'
    | 'CONNECTION_ERROR';
  voiceStatus?: 'SELECTED' | 'NOT_SELECTED';
  voicesPermission?: 'PASS' | 'FAIL' | 'PERMISSION_REQUIRED' | 'NOT_CHECKED';
  ttsPermission?: 'PASS' | 'FAIL' | 'NOT_CHECKED';
  voiceId?: string | null;
  latencyMs?: number | null;
  lastError?: string | null;
  httpStatus?: number | null;
  detailStatus?: string | null;
  detailMessage?: string | null;
};

export type HeyGenProviderStatus = {
  configured: boolean;
  connected: boolean | null;
  generationReady?: boolean;
  apiKeyPresence?: 'CONFIGURED' | 'MISSING';
  status?:
    | 'NOT_CONFIGURED'
    | 'CONNECTED'
    | 'INVALID_API_KEY'
    | 'PERMISSION_REQUIRED'
    | 'RATE_LIMITED'
    | 'API_ERROR'
    | 'CONNECTION_ERROR';
  avatarStatus?: 'SELECTED' | 'NOT_SELECTED';
  avatarsPermission?: 'PASS' | 'FAIL' | 'PERMISSION_REQUIRED' | 'NOT_CHECKED';
  heygenApiKeyPresent?: boolean;
  avatarId?: string | null;
  latencyMs?: number | null;
  lastError?: string | null;
  httpStatus?: number | null;
  errorCode?: string | null;
  detailMessage?: string | null;
};

export type StorageProviderStatus = {
  configured: boolean;
  connected: boolean | null;
  source?: 'CLOUDINARY_URL' | 'CLOUDINARY_NAME_KEY_SECRET' | 'none';
  message?: string | null;
  cloudNamePresent?: boolean;
  apiKeyPresent?: boolean;
  apiSecretPresent?: boolean;
};

export type ShortsProviderStatus = {
  configured: boolean;
  connected: boolean | null;
  message?: string | null;
};

export type AiInfluencerReadyStatus = {
  ready: boolean;
  reason: string | null;
  reasons?: string[];
  productionReady?: boolean;
  publishReady?: boolean;
  publishReasons?: string[];
};

export type FacebookProviderStatus = {
  configured: boolean;
  connected: boolean | null;
  pageId?: string | null;
  pageName?: string | null;
  tokenActive?: boolean;
  lastError?: string | null;
};

export type YoutubeProviderStatus = {
  configured: boolean;
  connected: boolean | null;
  healthStatus?: string;
  channelId?: string | null;
  channelTitle?: string | null;
  uploadScopeOk?: boolean;
  refreshTokenOk?: boolean;
  autoPublishReady?: boolean;
  missingEnv?: string[];
  redirectUri?: string | null;
  message?: string | null;
};

export type InstagramProviderStatus = {
  connected: boolean;
  instagramBusinessId?: string | null;
  instagramUsername?: string | null;
  linkedPageName?: string | null;
  tokenActive?: boolean;
  scopesOk?: boolean;
  missingScopes?: string[];
  needsReconnect?: boolean;
  publishReady?: boolean;
  message?: string | null;
  testStatus?: string;
};

export type InstagramTestResult = {
  status: string;
  account: string | null;
  page: string | null;
  professionalAccount: boolean;
  publishingPermission: boolean;
  message: string | null;
  needsReconnect: boolean;
  missingScopes: string[];
};

export type AiInfluencerRenderSettings = {
  preset: string;
  layout: string;
  subtitles: { enabled: boolean; fontSize: number; maxLines: number; bottomMargin: number };
  hook: { enabled: boolean; fontSize: number; maxLines: number };
  music: { trackId: string | null; musicVolume: number; voiceVolume: number };
};

export type AiInfluencerDashboard = {
  settings: {
    enabled: boolean;
    minScore: number;
    maxPerDay: number;
    approvalMode: string;
    dailyBudgetCzk: number;
    autoPublishFacebook?: boolean;
    autoPublishInstagram?: boolean;
    autoPublishYoutube?: boolean;
    autoPublishPortal?: boolean;
    youtubePublishMode?: string;
    youtubePrivacyStatus?: string;
    defaultMusicTrackId?: string | null;
    videoFormat?: 'VERTICAL_SHORT_9_16';
    durationPreset?: '25_35' | '35_45' | '45_60';
    scenePacing?: 'dynamic' | 'calm';
    useArticleImages?: boolean;
    usePortalMedia?: boolean;
    useBroll?: boolean;
    useMusic?: boolean;
    useSubtitles?: boolean;
    useLogo?: boolean;
    useCta?: boolean;
    mentionBrandInScript?: boolean;
    videoGoal?: 'website_traffic' | 'youtube_subscribe' | 'facebook_follow' | 'instagram_follow' | 'auto';
    videoGenerationMode?: 'VIDEO_AGENT' | 'AVATAR';
    allowVideoAgentFallback?: boolean;
    videoStyle?: 'dynamic_influencer' | 'real_estate_news' | 'property_showcase' | 'educational' | 'auto';
    avatarFrequency?: 'low' | 'medium' | 'high';
    avatarFraming?: 'auto' | 'fullscreen' | 'medium' | 'closeup_mix';
    backgroundMode?: 'auto' | 'real_estate' | 'urban' | 'interiors' | 'mix';
    sceneFrequency?: 'very_dynamic' | 'dynamic' | 'balanced';
    videoTempo?: 'dynamic' | 'balanced' | 'calm';
    usePropertyImages?: boolean;
    useTextGraphics?: boolean;
    ctaTextMode?: 'auto' | 'custom';
    customCtaText?: string;
    youtubeCtaText?: string;
  };
  stats: {
    reelsToday: number;
    jobsStartedToday?: number;
    jobsCompletedToday?: number;
    reelsWeek: number;
    inQueue: number;
    published: number;
    failed: number;
    failedAllTime?: number;
    costTodayCzk: number;
    costMonthCzk: number;
  };
  debugCounts?: {
    jobsToday: number;
    activeJobs: number;
    completedVideosToday: number;
    publishedJobsToday: number;
    failedJobsToday: number;
    galleryVideos: number;
  };
  automation?: {
    enabled: boolean;
    paused: boolean;
    pauseReason: string | null;
    nextCheckInMinutes: number;
    videosToday: number;
    maxVideosPerDay: number;
    autoPublishFacebook: boolean;
    autoPublishInstagram: boolean;
    autoPublishYoutube: boolean;
    autoPublishPortal: boolean;
  };
  providers: {
    ready?: AiInfluencerReadyStatus;
    ai?: { configured: boolean; connected: boolean | null };
    elevenLabs?: ElevenLabsProviderStatus;
    heygen?: HeyGenProviderStatus;
    did?: { configured: boolean; connected: boolean | null; lastError?: string | null };
    facebook?: FacebookProviderStatus;
    instagram?: InstagramProviderStatus;
    youtube?: YoutubeProviderStatus;
    renderer?: { configured: boolean; connected: boolean | null; preset?: string };
    storage?: StorageProviderStatus;
    cloudinary?: StorageProviderStatus;
    shorts?: ShortsProviderStatus;
    videoEngine?: {
      mode: string;
      videoGenerationMode: 'VIDEO_AGENT' | 'AVATAR';
      allowFallback: boolean;
      videoStyle: string;
      avatarFrequency: string;
      format: string;
      heygenVideoAgent: 'READY' | 'NOT AVAILABLE' | 'AUTH ERROR';
      heygenVideoAgentMessage?: string | null;
      fallback: 'READY' | 'NOT READY';
      selectedAvatarId?: string | null;
    };
    workerRuntime?: {
      service: string;
      railwayServiceHint: string;
      generationMode: 'VIDEO_AGENT' | 'AVATAR';
      elevenRequired: boolean;
      elevenLabsApiKey: 'CONFIGURED' | 'MISSING';
      heygenApiKey: 'CONFIGURED' | 'MISSING';
      storage: 'READY' | 'NOT READY';
      aiProvider: 'READY' | 'NOT READY';
      heygenVideoAgent: 'READY' | 'NOT AVAILABLE' | 'AUTH ERROR';
      elevenLabsRequired: boolean;
      elevenLabsStatus: 'READY' | 'MISSING' | 'NOT_REQUIRED';
      avatarFallback: 'READY' | 'NOT READY';
      providerElevenLabsApiKey: 'CONFIGURED' | 'MISSING';
      providerHeygenApiKey: 'CONFIGURED' | 'MISSING';
    };
  };
};

export type ElevenLabsVoiceOption = {
  voiceId: string;
  name: string;
  category: string | null;
  previewUrl: string | null;
};

export type ElevenLabsVoicesResponse = {
  voices: ElevenLabsVoiceOption[];
  permission: 'PASS' | 'FAIL' | 'PERMISSION_REQUIRED' | 'NOT_CHECKED';
  message?: string | null;
};

export type HeyGenAvatarOption = {
  avatarId: string;
  name: string;
  previewUrl: string | null;
};

export type HeyGenAvatarsResponse = {
  avatars: HeyGenAvatarOption[];
  permission: 'PASS' | 'FAIL' | 'PERMISSION_REQUIRED' | 'NOT_CHECKED';
  message?: string | null;
};

export type AiInfluencerArticleRow = {
  id: string;
  title: string;
  publishedAt: string | null;
  category: string;
  ogImageUrl: string | null;
  reelScore: number | null;
  latestJob: { id: string; status: string; candidate?: { reelPotentialScore: number } | null } | null;
};

export type AiInfluencerPipelineStep = {
  key: string;
  label: string;
  state: 'done' | 'active' | 'pending' | 'failed';
};

export type AiInfluencerJobDisplay = {
  generationMode: 'VIDEO_AGENT' | 'AVATAR';
  failedStageResolved: string | null;
  errorKind: 'NONE' | 'ACTIVE' | 'LEGACY_STALE';
  displayErrorMessage: string | null;
  displayErrorCode: string | null;
  retryLabel: string;
  retryHint: string | null;
  hasMasterVideo: boolean;
  pipelineSteps: AiInfluencerPipelineStep[];
};

export type AiInfluencerActiveJob = {
  id: string;
  status: string;
  progressPercent: number;
  currentStep: string | null;
  errorMessage: string | null;
  errorCode?: string | null;
  failedStage: string | null;
  skipReason: string | null;
  facebookPublishStatus: string | null;
  youtubePublishStatus: string | null;
  articleTitle: string;
  score: number | null;
  updatedAt: string;
  createdAt?: string;
  generationMode?: 'VIDEO_AGENT' | 'AVATAR';
  retryLabel?: string;
  errorKind?: 'NONE' | 'ACTIVE' | 'LEGACY_STALE';
  pipelineSteps?: AiInfluencerPipelineStep[];
  sourceType?: 'article' | 'property';
};

export type AiInfluencerGalleryMeta = {
  masterVideoUrl: string | null;
  videoCreatedAt: string | null;
  masterCreatedAt: string | null;
  finishedAt: string | null;
  sceneCount: number;
  backgroundVariationCount: number | null;
  galleryStatus: 'READY' | 'PUBLISHED' | 'PARTIAL' | 'QUALITY_REVIEW';
  durationFormatted: string | null;
  createdDateLabel: string | null;
  createdTimeLabel: string | null;
  createdCombinedLabel: string | null;
};

export type AiInfluencerJobRow = {
  id: string;
  status: string;
  progressPercent?: number;
  currentStep?: string | null;
  skipReason?: string | null;
  spokenText?: string | null;
  spokenTextTts?: string | null;
  selectedHook: string | null;
  videoUrl: string | null;
  finalMasterUrl?: string | null;
  baseMasterUrl?: string | null;
  totalExternalCost: number;
  failedStage: string | null;
  errorCode?: string | null;
  errorMessage: string | null;
  facebookPublishStatus?: string | null;
  facebookPermalink?: string | null;
  instagramPublishStatus?: string | null;
  instagramPermalink?: string | null;
  instagramMediaId?: string | null;
  instagramUsername?: string | null;
  instagramPublishError?: string | null;
  youtubePublishStatus?: string | null;
  youtubePublishError?: string | null;
  youtubePermalink?: string | null;
  estimatedDurationSec?: number | null;
  createdAt: string;
  updatedAt?: string;
  captionTitle?: string | null;
  article: { id: string; title: string; publishedAt: string | null; status: string; category?: string } | null;
  property?: { id: string; title: string } | null;
  profile: { id: string; name: string; slug: string };
  generationMode?: 'VIDEO_AGENT' | 'AVATAR';
  retryLabel?: string;
  errorKind?: 'NONE' | 'ACTIVE' | 'LEGACY_STALE';
  hasMasterVideo?: boolean;
  display?: AiInfluencerJobDisplay;
  candidate?: { reelPotentialScore: number | null } | null;
  gallery?: AiInfluencerGalleryMeta;
  isTest?: boolean;
  renderedAt?: string | null;
  postId?: string | null;
};

export type ShortsMusicOption = {
  id: string;
  title: string;
  artist: string | null;
  previewUrl: string | null;
  fileUrl: string;
};

export function nestAiInfluencerDashboard(token: string) {
  return aiInfluencerFetch<AiInfluencerDashboard>(token, '/dashboard');
}

export function nestAiInfluencerArticles(token: string) {
  return aiInfluencerFetch<AiInfluencerArticleRow[]>(token, '/articles');
}

export function nestAiInfluencerJobs(token: string) {
  return aiInfluencerFetch<AiInfluencerJobRow[]>(token, '/jobs');
}

export function nestAiInfluencerActiveJobs(token: string) {
  return aiInfluencerFetch<AiInfluencerActiveJob[]>(token, '/jobs/active');
}

export type AiInfluencerCreateJobResponse = {
  jobId: string;
  status: string;
  progress: number;
  articleTitle: string;
  generationMode: 'VIDEO_AGENT' | 'AVATAR';
  sourceType: 'ARTICLE';
  sourceId: string;
};

export function nestAiInfluencerCreateJob(token: string, articleId: string, force = false) {
  return aiInfluencerFetchAccepted<AiInfluencerCreateJobResponse>(
    token,
    `/jobs/from-article/${articleId}`,
    {
      method: 'POST',
      body: JSON.stringify({ force }),
    },
  );
}

export function nestAiInfluencerForceStartJob(token: string, jobId: string) {
  return aiInfluencerFetch<AiInfluencerJobRow>(token, `/jobs/${jobId}/force-start`, {
    method: 'POST',
  });
}

export function nestAiInfluencerResumeAutomation(token: string) {
  return aiInfluencerFetch(token, '/automation/resume', { method: 'POST' });
}

export function nestAiInfluencerApproveScript(token: string, jobId: string) {
  return aiInfluencerFetch<AiInfluencerJobRow>(token, `/jobs/${jobId}/approve-script`, {
    method: 'POST',
  });
}

export function nestAiInfluencerRetryJob(token: string, jobId: string) {
  return aiInfluencerFetch<AiInfluencerJobRow>(token, `/jobs/${jobId}/retry`, { method: 'POST' });
}

export function nestAiInfluencerAcceptUnbranded(token: string, jobId: string) {
  return aiInfluencerFetchWithError<AiInfluencerJobRow>(token, `/jobs/${jobId}/accept-unbranded`, {
    method: 'POST',
  });
}

export function nestAiInfluencerTestVoice(token: string, text?: string, voiceId?: string) {
  return aiInfluencerFetchWithError<{ ok: boolean; previewUrl: string }>(token, '/test/voice', {
    method: 'POST',
    body: JSON.stringify({ text, voiceId }),
  });
}

export function nestAiInfluencerTestPronunciation(token: string, text?: string, voiceId?: string) {
  return aiInfluencerFetchWithError<{
    ok: boolean;
    displayText: string;
    speechText: string;
    previewUrl: string;
    pronunciationRulesApplied: string[];
  }>(token, '/test/pronunciation', {
    method: 'POST',
    body: JSON.stringify({ text, voiceId }),
  });
}

async function aiInfluencerFetchWithError<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<{ data: T | null; error: string | null }> {
  const res = await fetch(`${API_BASE_URL}/admin/ai-influencer${path}`, {
    ...init,
    headers: {
      ...nestAuthHeaders(token),
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const json = (await res.json().catch(() => null)) as T | { message?: string | string[] } | null;
  if (!res.ok) {
    const msg = Array.isArray((json as { message?: string[] })?.message)
      ? (json as { message: string[] }).message.join(', ')
      : (json as { message?: string })?.message;
    return { data: null, error: msg || `HTTP ${res.status}` };
  }
  return { data: json as T, error: null };
}

export function nestAiInfluencerElevenLabsVoices(token: string) {
  return aiInfluencerFetch<ElevenLabsVoicesResponse>(token, '/voices/elevenlabs');
}

export function nestAiInfluencerHeyGenAvatars(token: string) {
  return aiInfluencerFetch<HeyGenAvatarsResponse>(token, '/avatars/heygen');
}

export function nestAiInfluencerTestAvatar(token: string, text?: string, avatarId?: string) {
  return aiInfluencerFetchWithError<{
    ok: boolean;
    avatarId: string;
    verified: boolean;
    message: string;
  }>(token, '/test/avatar', { method: 'POST', body: JSON.stringify({ text, avatarId }) });
}

export function nestAiInfluencerTestVideoAgent(token: string) {
  return aiInfluencerFetchAccepted<VideoAgentTestStartResponse>(token, '/test/video-agent', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export type VideoAgentTestStage =
  | 'QUEUED'
  | 'SUBMITTING'
  | 'SUBMITTED'
  | 'PROCESSING'
  | 'READY'
  | 'DOWNLOADING'
  | 'VALIDATING'
  | 'DONE'
  | 'FAILED';

export type VideoAgentTestJob = {
  id: string;
  status: VideoAgentTestStage;
  progressPercent: number;
  progressLabel: string;
  sessionId?: string | null;
  videoId?: string | null;
  providerJobIdMasked?: string | null;
  previewUrl?: string | null;
  durationSec?: number | null;
  width?: number | null;
  height?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  failedStage?: VideoAgentTestStage | null;
  httpStatus?: number | null;
  providerCode?: string | null;
  submittedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VideoAgentTestStartResponse = {
  jobId: string;
  status: VideoAgentTestStage;
  progressPercent: number;
  progressLabel: string;
};

async function aiInfluencerFetchAccepted<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<{ data: T | null; error: string | null; errorCode?: string | null }> {
  const res = await fetch(`${API_BASE_URL}/admin/ai-influencer${path}`, {
    ...init,
    headers: {
      ...nestAuthHeaders(token),
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const json = (await res.json().catch(() => null)) as
    | T
    | { message?: string | string[]; code?: string }
    | null;
  if (!res.ok) {
    const msg = Array.isArray((json as { message?: string[] })?.message)
      ? (json as { message: string[] }).message.join(', ')
      : (json as { message?: string })?.message;
    return {
      data: null,
      error: msg || `HTTP ${res.status}`,
      errorCode: (json as { code?: string })?.code ?? null,
    };
  }
  if (res.status !== 202 && res.status !== 200) {
    return { data: json as T, error: null };
  }
  return { data: json as T, error: null };
}

export function nestAiInfluencerVideoAgentTestStatus(token: string, jobId: string) {
  return aiInfluencerFetch<{ job: VideoAgentTestJob }>(
    token,
    `/test/video-agent/${encodeURIComponent(jobId)}/status`,
  );
}

export function nestAiInfluencerVideoAgentTestActive(token: string) {
  return aiInfluencerFetch<{ job: VideoAgentTestJob | null }>(token, '/test/video-agent/active');
}

export function nestAiInfluencerTestFallback(token: string, avatarId?: string) {
  return aiInfluencerFetchWithError<{
    ok: boolean;
    avatarId: string;
    verified: boolean;
    message: string;
  }>(token, '/test/fallback', { method: 'POST', body: JSON.stringify({ avatarId }) });
}

export function nestAiInfluencerProfile(token: string) {
  return aiInfluencerFetch<Record<string, unknown>>(token, '/profile');
}

export function nestAiInfluencerUpdateProfile(token: string, body: Record<string, unknown>) {
  return aiInfluencerFetch<Record<string, unknown>>(token, '/profile', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function nestAiInfluencerUpdateSettings(token: string, body: Record<string, unknown>) {
  return aiInfluencerFetch<Record<string, unknown>>(token, '/settings', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function nestAiInfluencerMusic(token: string) {
  return aiInfluencerFetch<ShortsMusicOption[]>(token, '/music');
}

export function nestAiInfluencerRenderSettings(token: string) {
  return aiInfluencerFetch<{ preset: string; settings: AiInfluencerRenderSettings }>(
    token,
    '/render-settings',
  );
}

export function nestAiInfluencerUpdateRenderSettings(
  token: string,
  body: { preset?: string; settings: Partial<AiInfluencerRenderSettings> },
) {
  return aiInfluencerFetch(token, '/render-settings', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function nestAiInfluencerTestFacebook(token: string) {
  return aiInfluencerFetchWithError<{ ok: boolean; pageName?: string; pageId?: string }>(
    token,
    '/test/facebook',
    { method: 'POST' },
  );
}

export function nestAiInfluencerYoutubeStatus(token: string) {
  return aiInfluencerFetch<YoutubeProviderStatus & { channelHandle?: string | null }>(
    token,
    '/youtube/status',
  );
}

export function nestAiInfluencerTestYoutube(token: string) {
  return aiInfluencerFetchWithError<YoutubeProviderStatus & { status?: string; message?: string | null }>(
    token,
    '/test/youtube',
    { method: 'POST' },
  );
}

export function nestAiInfluencerTestYoutubeUpload(token: string, body?: { jobId?: string; videoUrl?: string }) {
  return aiInfluencerFetchWithError<{
    ok: boolean;
    youtubeVideoId?: string;
    youtubeUrl?: string;
    youtubeUploadStatus?: string;
    message?: string;
  }>(token, '/test/youtube/upload', {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  });
}

export function nestAiInfluencerYoutubeDisconnect(token: string) {
  return aiInfluencerFetchWithError<{ ok: boolean }>(token, '/youtube/disconnect', { method: 'POST' });
}

export function nestAiInfluencerRegenerateJob(token: string, jobId: string) {
  return aiInfluencerFetch<AiInfluencerJobRow>(token, `/jobs/${jobId}/regenerate`, {
    method: 'POST',
  });
}

export function nestAiInfluencerPublishFacebook(token: string, jobId: string) {
  return aiInfluencerFetchWithError<{ permalink?: string; postId?: string }>(
    token,
    `/jobs/${jobId}/publish/facebook`,
    { method: 'POST' },
  );
}

export function nestAiInfluencerPublishYoutube(token: string, jobId: string) {
  return aiInfluencerFetchWithError<{ videoId: string; url: string }>(
    token,
    `/jobs/${jobId}/publish/youtube`,
    { method: 'POST' },
  );
}

export function nestAiInfluencerPublishInstagram(token: string, jobId: string) {
  return aiInfluencerFetchWithError<{ permalink?: string; mediaId?: string }>(
    token,
    `/jobs/${jobId}/publish/instagram`,
    { method: 'POST' },
  );
}

export function nestAiInfluencerVerifyInstagram(token: string) {
  return aiInfluencerFetchWithError<Record<string, unknown>>(token, '/instagram/verify', {
    method: 'POST',
  });
}

export function nestAiInfluencerTestInstagram(token: string) {
  return aiInfluencerFetchWithError<InstagramTestResult>(token, '/test/instagram', {
    method: 'POST',
  });
}

export function nestAiInfluencerGetJob(token: string, jobId: string) {
  return aiInfluencerFetch<AiInfluencerJobRow>(token, `/jobs/${jobId}`);
}

export function nestAiInfluencerVideos(token: string, limit = 60, includeTest = false) {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (includeTest) qs.set('includeTest', '1');
  return aiInfluencerFetch<AiInfluencerJobRow[]>(token, `/videos?${qs.toString()}`);
}

export type ProductionTestStartResponse = {
  jobId: string;
  status: string;
  progressPercent: number;
  progressLabel: string;
  generationMode: 'VIDEO_AGENT' | 'AVATAR';
  articleTitle: string;
};

export type ProductionTestStatus = {
  jobId: string;
  status: string;
  progress: {
    progressPercent: number;
    progressLabel: string;
    stage: string;
    outcome: 'RUNNING' | 'PASS' | 'FAIL' | 'QUALITY_REVIEW';
  };
  masterVideoUrl: string | null;
  gallery: AiInfluencerGalleryMeta;
  qualityReport: Record<string, string>;
  resolution: string | null;
  isTest: true;
};

export function nestAiInfluencerStartProductionTest(token: string, articleId?: string) {
  return aiInfluencerFetchAccepted<ProductionTestStartResponse>(token, '/test/production', {
    method: 'POST',
    body: JSON.stringify(articleId ? { articleId } : {}),
  });
}

export function nestAiInfluencerProductionTestActive(token: string) {
  return aiInfluencerFetch<{ job: ProductionTestStatus | null }>(token, '/test/production/active');
}

export function nestAiInfluencerProductionTestStatus(token: string, jobId: string) {
  return aiInfluencerFetch<{ job: ProductionTestStatus }>(
    token,
    `/test/production/${encodeURIComponent(jobId)}/status`,
  );
}

export function nestAiInfluencerDeleteProductionTest(token: string, jobId: string) {
  return aiInfluencerFetch<{ ok: boolean; deletedId: string }>(
    token,
    `/test/production/${encodeURIComponent(jobId)}`,
    { method: 'DELETE' },
  );
}

export function nestAiInfluencerCancelJob(token: string, jobId: string, reason?: string) {
  return aiInfluencerFetch<AiInfluencerJobRow>(token, `/jobs/${jobId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function nestAiInfluencerDeleteJob(token: string, jobId: string, historyOnly = false) {
  const qs = historyOnly ? '?historyOnly=1' : '';
  return aiInfluencerFetch<{ ok: boolean; deletedId: string }>(token, `/jobs/${jobId}${qs}`, {
    method: 'DELETE',
  });
}

export function nestAiInfluencerDeleteFailedJobs(token: string) {
  return aiInfluencerFetch<{ ok: boolean; deleted: number }>(token, '/jobs/bulk/failed', {
    method: 'DELETE',
  });
}
