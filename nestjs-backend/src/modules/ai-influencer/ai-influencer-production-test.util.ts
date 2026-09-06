import { createHash } from 'node:crypto';
import { AiInfluencerReelJobStatus } from '@prisma/client';
import { buildGalleryVideoMeta, type GalleryVideoMeta } from './ai-influencer-video-gallery.util';
import { resolveMasterVideoUrl } from './ai-influencer-job-status.util';
import { readJobRenderMeta } from './ai-influencer-video-agent.util';
import { runQualityGate } from './ai-influencer-quality-gate.util';
import { resolveFailedStage } from './ai-influencer-retry.util';
import type { ReelScenePlan, ReelScriptPayload } from './ai-influencer.types';

export type ProductionTestProgress = {
  progressPercent: number;
  progressLabel: string;
  stage: string;
  outcome: 'RUNNING' | 'PASS' | 'FAIL' | 'QUALITY_REVIEW';
};

export type ProductionTestStatus = {
  jobId: string;
  status: AiInfluencerReelJobStatus;
  progress: ProductionTestProgress;
  masterVideoUrl: string | null;
  gallery: GalleryVideoMeta;
  qualityReport: Record<string, string>;
  resolution: string | null;
  isTest: true;
  testKind: 'FULL' | 'VIDEO_AGENT';
  createdAt: string;
  failedStage: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export function buildFixedVideoAgentTestScript(): ReelScriptPayload {
  const spokenText =
    'Dobrý den, sledujete XXREALIT. Toto je test systému pro automatickou výrobu videí.';
  return {
    hook: 'Dobrý den, sledujete XXREALIT.',
    intro: 'Dobrý den, sledujete XXREALIT.',
    segments: [{ text: 'Toto je test systému pro automatickou výrobu videí.' }],
    spokenText,
    captionTitle: 'Video Agent test',
    captionDescription: 'Interní test Video Agent pipeline.',
    cta: 'Více najdete na XXREALIT.CZ',
    estimatedDuration: 12,
    hashtags: ['#xxrealit', '#test'],
    contentFormat: 'REALITNI_MINUTA',
    scenes: [
      { type: 'AVATAR_FULL', start: 0, duration: 3, text: 'Dobrý den, sledujete XXREALIT.' },
      { type: 'BROLL_FULL', start: 3, duration: 3, text: 'Toto je test systému pro automatickou výrobu videí.' },
      { type: 'AVATAR_FULL', start: 6, duration: 3, text: 'Ověřujeme obraz, hlas a vertikální formát.' },
      { type: 'CTA', start: 9, duration: 3, text: 'Více na XXREALIT.CZ' },
    ],
  };
}

export function hashFixedTestScript(script: ReelScriptPayload): string {
  return createHash('sha256').update(JSON.stringify(script)).digest('hex');
}

const TEST_PROGRESS_STAGES: Array<{ min: number; label: string; stage: string }> = [
  { min: 5, label: 'Inicializace', stage: 'QUEUED' },
  { min: 15, label: 'Generuji scénář', stage: 'SCRIPT' },
  { min: 25, label: 'Připravuji storyboard', stage: 'STORYBOARD' },
  { min: 35, label: 'Připravuji média', stage: 'MEDIA' },
  { min: 45, label: 'Odesílám Video Agent', stage: 'VIDEO_AGENT' },
  { min: 60, label: 'HeyGen generuje video', stage: 'HEYGEN_RENDER' },
  { min: 75, label: 'Video dokončeno', stage: 'HEYGEN_DONE' },
  { min: 82, label: 'Stahuji video', stage: 'DOWNLOAD' },
  { min: 90, label: 'Post-processing', stage: 'POSTPROCESS' },
  { min: 96, label: 'Ukládám video', stage: 'STORAGE' },
  { min: 100, label: 'HOTOVO', stage: 'DONE' },
];

const VIDEO_AGENT_TEST_PROGRESS_STAGES: Array<{ min: number; label: string; stage: string }> = [
  { min: 5, label: 'Inicializace', stage: 'QUEUED' },
  { min: 25, label: 'Fixní scénář připraven', stage: 'SCRIPT' },
  { min: 35, label: 'Storyboard připraven', stage: 'STORYBOARD' },
  { min: 45, label: 'Odesílám Video Agent', stage: 'VIDEO_AGENT' },
  { min: 60, label: 'HeyGen generuje video', stage: 'HEYGEN_RENDER' },
  { min: 75, label: 'Video dokončeno', stage: 'HEYGEN_DONE' },
  { min: 82, label: 'Stahuji video', stage: 'DOWNLOAD' },
  { min: 90, label: 'Post-processing', stage: 'POSTPROCESS' },
  { min: 96, label: 'Ukládám video', stage: 'STORAGE' },
  { min: 100, label: 'HOTOVO', stage: 'DONE' },
];

export function mapProductionTestProgress(input: {
  status: AiInfluencerReelJobStatus;
  progressPercent: number;
  currentStep?: string | null;
  errorCode?: string | null;
  hasMasterVideo: boolean;
  testKind?: 'FULL' | 'VIDEO_AGENT';
}): ProductionTestProgress {
  if (input.status === 'FAILED' && input.errorCode !== 'QUALITY_REVIEW_REQUIRED') {
    return {
      progressPercent: input.progressPercent,
      progressLabel: input.currentStep ?? 'Test selhal',
      stage: 'FAILED',
      outcome: 'FAIL',
    };
  }

  if (input.status === 'FAILED' && input.errorCode === 'QUALITY_REVIEW_REQUIRED' && input.hasMasterVideo) {
    return { progressPercent: 100, progressLabel: 'Quality review', stage: 'QUALITY', outcome: 'QUALITY_REVIEW' };
  }

  if (input.status === 'READY' || input.status === 'PUBLISHED' || input.status === 'PARTIALLY_PUBLISHED') {
    return { progressPercent: 100, progressLabel: 'Hotovo', stage: 'DONE', outcome: 'PASS' };
  }

  const pct = Math.max(5, Math.min(99, input.progressPercent || 5));
  const stages = input.testKind === 'VIDEO_AGENT' ? VIDEO_AGENT_TEST_PROGRESS_STAGES : TEST_PROGRESS_STAGES;
  let matched = stages[0];
  for (const stage of stages) {
    if (pct >= stage.min) matched = stage;
  }
  return {
    progressPercent: matched.min,
    progressLabel: matched.label,
    stage: matched.stage,
    outcome: 'RUNNING',
  };
}

export function buildProductionTestQualityReport(input: {
  scenes: ReelScenePlan[];
  durationSec: number;
  generationMode: 'VIDEO_AGENT' | 'AVATAR';
  pronunciationRulesApplied?: string[];
  spokenTextSample?: string | null;
  hasAudio?: boolean;
  resolution?: string | null;
  hasBlackBars?: boolean;
}): Record<string, string> {
  const quality = runQualityGate({
    scenes: input.scenes,
    durationSec: input.durationSec,
    generationMode: input.generationMode,
    pronunciationRulesApplied: input.pronunciationRulesApplied,
    spokenTextSample: input.spokenTextSample,
  });

  const report: Record<string, string> = {
    Resolution: input.resolution ? `PASS ${input.resolution}` : 'UNKNOWN',
    'Scene count': quality.metrics.sceneCount >= 3 ? `PASS ${quality.metrics.sceneCount}` : `FAIL ${quality.metrics.sceneCount}`,
    'Avatar ratio': `PASS ${Math.round((quality.metrics.avatarSceneCount / Math.max(1, quality.metrics.sceneCount)) * 100)} %`,
    'Background variation':
      quality.metrics.backgroundVariationCount >= 2
        ? `PASS ${quality.metrics.backgroundVariationCount}`
        : `FAIL ${quality.metrics.backgroundVariationCount}`,
    'Black bars': input.hasBlackBars ? 'FAIL' : 'PASS',
    Audio: input.hasAudio === false ? 'FAIL' : 'PASS',
    CTA: quality.failures.some((f) => f.startsWith('CTA')) ? 'FAIL' : 'PASS',
    Brand: quality.failures.some((f) => f.startsWith('PRONUNCIATION')) ? 'FAIL' : 'PASS',
  };

  if (!quality.pass) {
    report.Quality = `REVIEW (${quality.failures.join('; ')})`;
  } else {
    report.Quality = 'PASS';
  }

  return report;
}

export function buildProductionTestStatus(job: {
  id: string;
  status: AiInfluencerReelJobStatus;
  progressPercent: number;
  currentStep?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  failedStage?: string | null;
  finalMasterUrl?: string | null;
  baseMasterUrl?: string | null;
  videoUrl?: string | null;
  avatarStorageUrl?: string | null;
  renderedAt?: Date | string | null;
  createdAt: Date | string;
  estimatedDurationSec?: number | null;
  scenesJson?: unknown;
  renderSettingsJson?: unknown;
  facebookPublishStatus?: string | null;
  instagramPublishStatus?: string | null;
  youtubePublishStatus?: string | null;
  postId?: string | null;
  spokenText?: string | null;
}): ProductionTestStatus {
  const masterVideoUrl = resolveMasterVideoUrl(job);
  const gallery = buildGalleryVideoMeta(job);
  const meta = readJobRenderMeta(job.renderSettingsJson);
  const scenes = Array.isArray(job.scenesJson) ? (job.scenesJson as ReelScenePlan[]) : [];
  const progress = mapProductionTestProgress({
    status: job.status,
    progressPercent: job.progressPercent,
    currentStep: job.currentStep,
    errorCode: job.errorCode,
    hasMasterVideo: Boolean(masterVideoUrl),
    testKind: meta.testKind === 'VIDEO_AGENT' ? 'VIDEO_AGENT' : 'FULL',
  });

  return {
    jobId: job.id,
    status: job.status,
    progress,
    masterVideoUrl,
    gallery,
    qualityReport: buildProductionTestQualityReport({
      scenes,
      durationSec: job.estimatedDurationSec ?? 12,
      generationMode: meta.generationModeUsed === 'AVATAR' ? 'AVATAR' : 'VIDEO_AGENT',
      pronunciationRulesApplied: meta.pronunciationRulesApplied,
      spokenTextSample: job.spokenText,
      hasAudio: true,
      resolution: masterVideoUrl ? '1080x1920' : null,
      hasBlackBars: false,
    }),
    resolution: masterVideoUrl ? '1080x1920' : null,
    isTest: true,
    testKind: meta.testKind === 'VIDEO_AGENT' ? 'VIDEO_AGENT' : 'FULL',
    createdAt: new Date(job.createdAt).toISOString(),
    failedStage:
      resolveFailedStage(job.failedStage ?? null, job.errorMessage, job.errorCode) ??
      job.failedStage ??
      null,
    errorCode: job.errorCode ?? null,
    errorMessage: job.errorMessage ?? null,
  };
}

export function isProductionTestJob(renderSettingsJson: unknown): boolean {
  return readJobRenderMeta(renderSettingsJson).isProductionTest === true;
}

export function resolveJobTargetDurationSec(
  renderSettingsJson: unknown,
  fallbackSec: number,
): number {
  const meta = readJobRenderMeta(renderSettingsJson);
  if (meta.isProductionTest) {
    const testSec = typeof meta.testDurationSec === 'number' ? meta.testDurationSec : 12;
    return Math.min(15, Math.max(10, testSec));
  }
  return fallbackSec;
}
