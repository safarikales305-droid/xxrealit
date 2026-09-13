'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import {
  resolveAiInfluencerJobSubtitle,
  resolveAiInfluencerJobTitle,
} from '@/lib/ai-influencer-display.util';
import {
  nestAiInfluencerApproveScript,
  nestAiInfluencerArticles,
  nestAiInfluencerActiveJobs,
  nestAiInfluencerCancelJob,
  nestAiInfluencerForceCancelJob,
  nestAiInfluencerRepairJobs,
  nestAiInfluencerCreateJob,
  nestAiInfluencerDashboard,
  nestAiInfluencerDeleteFailedJobs,
  nestAiInfluencerForceStartJob,
  nestAiInfluencerDeleteJob,
  nestAiInfluencerJobs,
  nestAiInfluencerProfile,
  nestAiInfluencerPublishFacebook,
  nestAiInfluencerPublishInstagram,
  nestAiInfluencerPublishManual,
  nestAiInfluencerPublishYoutube,
  nestAiInfluencerDeleteProductionTest,
  nestAiInfluencerProductionTestActive,
  nestAiInfluencerProductionTestStatus,
  nestAiInfluencerStartProductionTest,
  nestAiInfluencerTestScript,
  nestAiInfluencerRegenerateJob,
  nestAiInfluencerResumeAutomation,
  nestAiInfluencerRetryJob,
  nestAiInfluencerRetryStorageJob,
  nestAiInfluencerRunJobNow,
  nestAiInfluencerWakeWorker,
  nestAiInfluencerSyncHeyGen,
  nestAiInfluencerReconcileHeyGen,
  nestAiInfluencerTestAvatar,
  nestAiInfluencerTestFacebook,
  nestAiInfluencerTestInstagram,
  nestAiInfluencerTestVideoAgent,
  nestAiInfluencerTestVoice,
  nestAiInfluencerTestYoutube,
  nestAiInfluencerUpdateProfile,
  nestAiInfluencerUpdateSettings,
  nestAiInfluencerVerifyInstagram,
  nestAiInfluencerVideos,
  nestAiInfluencerYoutubeDisconnect,
  nestAiInfluencerGetJob,
  type AiInfluencerActiveJob,
  type AiInfluencerArticleRow,
  type AiInfluencerDashboard,
  type AiInfluencerJobRow,
  type AiInfluencerPipelineStep,
  type ManualPublishChannel,
  type ManualPublishResult,
  type AiInfluencerRepairReport,
  type ProductionTestStatus,
  type ScriptProviderTestResult,
} from '@/lib/ai-influencer-client';
import { nestYoutubeOAuthConnectUrl } from '@/lib/editorial-center-client';

type TabId = 'overview' | 'production' | 'videos' | 'errors' | 'settings';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Přehled' },
  { id: 'production', label: 'Výroba' },
  { id: 'videos', label: 'Videa' },
  { id: 'errors', label: 'Chyby / Retry' },
  { id: 'settings', label: 'Nastavení' },
];

const ACTIVE_GENERATION_STATUSES = [
  'EVALUATING',
  'CANDIDATE',
  'SCRIPT_GENERATING',
  'SCRIPT_READY',
  'VOICE_GENERATING',
  'VOICE_READY',
  'AVATAR_GENERATING',
  'AVATAR_READY',
  'RENDERING',
  'PUBLISHING',
] as const;

function isActiveGenerationStatus(status: string) {
  return (ACTIVE_GENERATION_STATUSES as readonly string[]).includes(status);
}

const SEEN_TOAST_EVENTS_KEY = 'xxrealit.ai-influencer.seenToastEvents';

function readSeenToastEvents(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.sessionStorage.getItem(SEEN_TOAST_EVENTS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function rememberToastEvent(eventId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const seen = readSeenToastEvents();
    seen.add(eventId);
    const trimmed = [...seen].slice(-200);
    window.sessionStorage.setItem(SEEN_TOAST_EVENTS_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
}

function jobHasGalleryVideo(row: AiInfluencerJobRow): boolean {
  return Boolean(
    row.gallery?.inGallery ||
      row.gallery?.masterVideoUrl ||
      row.finalMasterUrl?.trim() ||
      row.baseMasterUrl?.trim() ||
      row.videoUrl?.trim() ||
      row.hasMasterVideo,
  );
}

function buildVideoReadyEventId(row: AiInfluencerJobRow): string {
  const completedAt =
    row.gallery?.completedAtIso ?? row.renderedAt ?? row.updatedAt ?? row.createdAt ?? '';
  return `${row.id}:${completedAt}:VIDEO_READY`;
}

function isProcessing(status: string) {
  return isActiveGenerationStatus(status);
}

function modeLabel(mode?: string) {
  return mode === 'AVATAR' ? 'Avatar fallback' : 'Video Agent';
}

function providerDetailFacebook(providers?: AiInfluencerDashboard['providers'] | null): string {
  const fb = providers?.facebook;
  if (
    fb?.rateLimited ||
    fb?.healthStatus === 'CONNECTED_RATE_LIMITED' ||
    fb?.healthStatus === 'RATE_LIMITED' ||
    fb?.publishStatus === 'RATE_LIMITED'
  ) {
    return `Facebook: CONNECTED_RATE_LIMITED · Připojeno${fb.pageName ? `: ${fb.pageName}` : ''}. Meta dočasně omezuje API požadavky.${fb.nextCheckAt ? ` Další kontrola: ${new Date(fb.nextCheckAt).toLocaleTimeString('cs-CZ')}.` : ''}`;
  }
  if ((fb?.connected || fb?.storedPageConnected) && fb.publishStatus === 'READY') {
    return `Facebook: READY${fb.pageName ? ` · ${fb.pageName}` : ''}${fb.checkedAt ? ` · Poslední kontrola: ${new Date(fb.checkedAt).toLocaleTimeString('cs-CZ')}` : ''}`;
  }
  if (fb?.connected && fb.lastError) {
    return `Facebook: AUTH_REQUIRED · ${fb.lastError}`;
  }
  if (fb?.lastError) return `Facebook: AUTH_REQUIRED · ${fb.lastError}`;
  if (fb?.hint) return `Facebook: ${fb.hint}`;
  return 'Facebook: NOT_CONNECTED · Stránka není připojena nebo token vypršel.';
}

function facebookHealthChip(providers?: AiInfluencerDashboard['providers'] | null): {
  ok: boolean;
  warn: boolean;
  detail: string;
} {
  const fb = providers?.facebook;
  const rateLimited = Boolean(
    fb?.rateLimited ||
      fb?.healthStatus === 'CONNECTED_RATE_LIMITED' ||
      fb?.healthStatus === 'RATE_LIMITED',
  );
  const connected = Boolean(fb?.connected || fb?.storedPageConnected || fb?.pageId);
  return {
    ok: connected && !rateLimited && fb?.publishStatus === 'READY',
    warn: connected && rateLimited,
    detail: providerDetailFacebook(providers),
  };
}

function providerDetailYoutube(providers?: AiInfluencerDashboard['providers'] | null): string {
  const yt = providers?.youtube;
  if (yt?.connected && yt.refreshTokenOk && yt.uploadScopeOk) {
    return `YouTube: READY${yt.channelTitle ? ` · ${yt.channelTitle}` : ''}`;
  }
  if (yt?.message) return `YouTube: ${yt.publishStatus ?? 'ERROR'} · ${yt.message}`;
  return 'YouTube: NOT_CONNECTED · OAuth kanál není připojen.';
}

function providerDetailInstagram(providers?: AiInfluencerDashboard['providers'] | null): string {
  const ig = providers?.instagram;
  if (ig?.publishReady) return `Instagram: READY${ig.instagramUsername ? ` · @${ig.instagramUsername}` : ''}`;
  if (ig?.missingScopes?.length) {
    return `Instagram: MISSING_PERMISSIONS · ${ig.missingScopes.join(', ')}`;
  }
  if (ig?.message) return `Instagram: AUTH_REQUIRED · ${ig.message}`;
  return 'Instagram: NOT_CONNECTED · Vyžaduje Meta propojení a oprávnění.';
}

function providerDetailShorts(providers?: AiInfluencerDashboard['providers'] | null): string {
  const shorts = providers?.shorts;
  if (shorts?.connected) return 'XXREALIT Shorts: READY · Cloudinary storage';
  return shorts?.message ?? 'XXREALIT Shorts: NOT_CONFIGURED · chybí persistent storage';
}

function channelPublishReady(
  channel: ManualPublishChannel,
  providers?: AiInfluencerDashboard['providers'] | null,
): { ready: boolean; reason: string } {
  if (channel === 'facebook') {
    const fb = providers?.facebook;
    const ready = fb?.publishStatus === 'READY';
    return { ready, reason: providerDetailFacebook(providers) };
  }
  if (channel === 'instagram') {
    const ready = providers?.instagram?.publishReady === true;
    return { ready, reason: providerDetailInstagram(providers) };
  }
  if (channel === 'youtube') {
    const yt = providers?.youtube;
    const ready = Boolean(yt?.connected && yt.refreshTokenOk && yt.uploadScopeOk);
    return { ready, reason: providerDetailYoutube(providers) };
  }
  const ready = providers?.shorts?.connected === true;
  return { ready, reason: providerDetailShorts(providers) };
}

function stageLabel(stage: string | null | undefined) {
  if (!stage) return '—';
  const map: Record<string, string> = {
    SCRIPT: 'Scénář',
    STORYBOARD: 'Storyboard',
    MEDIA: 'Média',
    VIDEO_AGENT: 'Video Agent',
    VOICE: 'Hlas',
    AVATAR: 'Avatar',
    RENDER: 'Render',
    POST_PROCESSING: 'Post-processing',
    POSTPROCESS: 'Post-processing',
    DOWNLOAD: 'Stahování',
    STORAGE: 'Storage',
    PUBLISH: 'Publikace',
    BRANDING_RENDER: 'Branding',
  };
  return map[stage] ?? stage;
}

type AiPreflightAi = NonNullable<AiInfluencerDashboard['providers']['ai']>;

function aiScriptCanonicalReady(ai?: AiPreflightAi | null): boolean {
  return ai?.configured === true && ai?.enabled === true && ai?.usable === true;
}

function videoAgentCanonicalReady(providers?: AiInfluencerDashboard['providers'] | null): boolean {
  return providers?.videoEngine?.heygenVideoAgent === 'READY';
}

function videoAgentPreflightChip(providers?: AiInfluencerDashboard['providers'] | null): {
  ok: boolean;
  chip: string;
  detail: string;
  tone: 'ready' | 'configured' | 'disabled' | 'blocked';
} {
  const ready = videoAgentCanonicalReady(providers);
  const message =
    providers?.videoEngine?.heygenVideoAgentMessage ??
    providers?.renderer?.message ??
    'Video Agent není připraven.';
  return {
    ok: ready,
    chip: ready ? 'READY' : 'BLOCKED',
    detail: ready ? 'Připraveno' : message,
    tone: ready ? 'ready' : 'blocked',
  };
}

function productionPreflightReady(providers?: AiInfluencerDashboard['providers'] | null): boolean {
  return (
    aiScriptCanonicalReady(providers?.ai) &&
    videoAgentCanonicalReady(providers) &&
    providers?.renderer?.connected === true &&
    providers?.storage?.configured === true
  );
}

function pipelineErrorLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  const map: Record<string, string> = {
    OPENAI_API_KEY_MISSING: 'OpenAI API key není dostupný v generation workeru.',
    OPENAI_NOT_CONFIGURED: 'OpenAI API key není dostupný v generation workeru.',
    AI_PROVIDER_NOT_CONFIGURED: 'AI provider není nakonfigurován.',
    AI_PROVIDER_DISABLED: 'OpenAI je vypnuto v nastavení.',
    HEYGEN_NOT_CONFIGURED: 'HeyGen API není nakonfigurováno.',
    ELEVENLABS_NOT_CONFIGURED: 'ElevenLabs není dostupný v generation workeru.',
    STORAGE_FAILED: 'Cloudinary storage není nakonfigurováno.',
    RENDER_INPUT_MISSING: 'Chybí vstup pro render pipeline.',
  };
  return map[code] ?? null;
}

function aiScriptDisabled(ai?: AiPreflightAi | null): boolean {
  return ai?.configured === true && ai?.enabled === false;
}

function aiPreflightChip(ai?: AiPreflightAi | null): {
  ok: boolean;
  chip: string;
  detail: string;
  tone: 'ready' | 'configured' | 'disabled' | 'blocked';
} {
  if (aiScriptDisabled(ai)) {
    return {
      ok: false,
      chip: 'VYPNUTO',
      detail: ai?.message ?? 'OpenAI je vypnuto v nastavení.',
      tone: 'disabled',
    };
  }
  if (aiScriptCanonicalReady(ai)) {
    const label = ai?.scriptProvider ?? 'READY';
    return {
      ok: true,
      chip: label,
      detail: label === 'READY' ? 'Připraveno' : '⚠ CONFIGURED — test připojení nebyl spuštěn',
      tone: label === 'READY' ? 'ready' : 'configured',
    };
  }
  return {
    ok: false,
    chip: 'BLOCKED',
    detail: ai?.message ?? 'AI provider není připraven.',
    tone: 'blocked',
  };
}

function galleryStatusLabel(status?: string) {
  if (status === 'PUBLISHED') return 'PUBLISHED';
  if (status === 'PARTIAL') return 'PARTIAL';
  if (status === 'QUALITY_REVIEW') return 'QUALITY REVIEW';
  return 'READY';
}

function resolveMasterUrl(job: AiInfluencerJobRow): string | null {
  return job.gallery?.masterVideoUrl ?? job.finalMasterUrl ?? job.baseMasterUrl ?? job.videoUrl ?? null;
}

function publishIcon(status?: string | null) {
  if (status === 'PUBLISHED') return '✓';
  if (status === 'AUTH_REQUIRED') return '⚠';
  if (status === 'FAILED') return '✕';
  return '—';
}

function elapsedSince(iso: string | undefined) {
  if (!iso) return '—';
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function jobRetryLabel(job: AiInfluencerJobRow | AiInfluencerActiveJob) {
  return job.retryLabel ?? ('display' in job ? job.display?.retryLabel : undefined) ?? 'Zkusit znovu';
}

function jobErrorMessage(job: AiInfluencerJobRow) {
  if (job.display?.displayErrorMessage) return job.display.displayErrorMessage;
  if (job.errorKind === 'LEGACY_STALE') {
    return 'Zastaralá chyba z dřívějšího avatar pipeline — ElevenLabs není pro Video Agent režim potřeba.';
  }
  return job.errorMessage;
}

function HealthChip({
  label,
  ok,
  warn,
  detail,
  action,
}: {
  label: string;
  ok: boolean;
  warn?: boolean;
  detail?: string;
  action?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
          ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : warn ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-red-200 bg-red-50 text-red-800'
        }`}
      >
        {label} {ok ? '✓' : warn ? '⚠' : '✕'}
      </button>
      {open && detail ? (
        <div className="absolute left-0 top-full z-20 mt-2 w-72 rounded-lg border border-zinc-200 bg-white p-3 text-xs shadow-lg">
          <p className="text-zinc-700">{detail}</p>
          {action ? <div className="mt-2">{action}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

function PipelineBar({ steps }: { steps?: AiInfluencerPipelineStep[] }) {
  if (!steps?.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {steps.map((step) => (
        <span
          key={step.key}
          className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
            step.state === 'done'
              ? 'bg-emerald-100 text-emerald-800'
              : step.state === 'active'
                ? 'bg-orange-100 text-orange-800'
                : step.state === 'failed'
                  ? 'bg-red-100 text-red-800'
                  : 'bg-zinc-100 text-zinc-500'
          }`}
        >
          {step.label} {step.state === 'done' ? '✓' : step.state === 'active' ? '●' : step.state === 'failed' ? '✕' : '—'}
        </span>
      ))}
    </div>
  );
}

export function AiInfluencerProductionDashboard({ apiAccessToken }: { apiAccessToken: string }) {
  const [tab, setTab] = useState<TabId>('overview');
  const [dashboard, setDashboard] = useState<AiInfluencerDashboard | null>(null);
  const [articles, setArticles] = useState<AiInfluencerArticleRow[]>([]);
  const [jobs, setJobs] = useState<AiInfluencerJobRow[]>([]);
  const [activeJobs, setActiveJobs] = useState<AiInfluencerActiveJob[]>([]);
  const [videos, setVideos] = useState<AiInfluencerJobRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createArticleId, setCreateArticleId] = useState('');
  const [detailJobId, setDetailJobId] = useState<string | null>(null);
  const [detailJob, setDetailJob] = useState<AiInfluencerJobRow | null>(null);
  const [candidateFilter, setCandidateFilter] = useState<'all' | 'suitable' | 'unused' | 'used'>('suitable');
  const [showTestVideos, setShowTestVideos] = useState(false);
  const [videoFilter, setVideoFilter] = useState<
    'all' | 'production' | 'test' | 'published' | 'unpublished' | 'ready' | 'failed' | 'video_agent' | 'avatar'
  >('production');
  const [selectedVoiceId, setSelectedVoiceId] = useState('');
  const [selectedAvatarId, setSelectedAvatarId] = useState('');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createState, setCreateState] = useState<'idle' | 'submitting' | 'accepted' | 'error'>('idle');
  const [toast, setToast] = useState<string | null>(null);
  const [heygenSyncBusy, setHeygenSyncBusy] = useState(false);
  const [heygenSyncResult, setHeygenSyncResult] = useState<string | null>(null);
  const [playVideoUrl, setPlayVideoUrl] = useState<string | null>(null);
  const [publishJob, setPublishJob] = useState<AiInfluencerJobRow | null>(null);
  const [publishChannels, setPublishChannels] = useState<Record<ManualPublishChannel, boolean>>({
    facebook: true,
    instagram: false,
    youtube: true,
    portal: true,
  });
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishResult, setPublishResult] = useState<ManualPublishResult | null>(null);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testArticleId, setTestArticleId] = useState('');
  const [productionTest, setProductionTest] = useState<ProductionTestStatus | null>(null);
  const [productionTestBusy, setProductionTestBusy] = useState(false);
  const [scriptTestBusy, setScriptTestBusy] = useState(false);
  const [scriptTestResult, setScriptTestResult] = useState<
    (ScriptProviderTestResult & { ok: true }) | { ok: false; message: string; code?: string } | null
  >(null);
  const prevActiveIdsRef = useRef<string[]>([]);
  const [cancelModalJob, setCancelModalJob] = useState<AiInfluencerActiveJob | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [repairBusy, setRepairBusy] = useState(false);
  const [repairResult, setRepairResult] = useState<AiInfluencerRepairReport | null>(null);

  const includeTestInApi = showTestVideos || videoFilter === 'test';
  const generationBlocked = activeJobs.length > 0;
  const primaryActiveJob = activeJobs[0] ?? null;

  const loadCore = useCallback(() => {
    if (!apiAccessToken) return;
    void Promise.all([
      nestAiInfluencerDashboard(apiAccessToken),
      nestAiInfluencerArticles(apiAccessToken),
      nestAiInfluencerJobs(apiAccessToken),
      nestAiInfluencerActiveJobs(apiAccessToken),
      nestAiInfluencerVideos(apiAccessToken, 60, includeTestInApi),
      nestAiInfluencerProfile(apiAccessToken),
    ]).then(([d, a, j, active, v, profile]) => {
      if (d) setDashboard(d);
      if (a) setArticles(a);
      if (j) setJobs(j);
      if (active) setActiveJobs(active);
      if (v) setVideos(v);
      if (profile && typeof profile.voiceId === 'string') setSelectedVoiceId(profile.voiceId);
      if (profile && typeof profile.avatarId === 'string') setSelectedAvatarId(profile.avatarId);
    });
  }, [apiAccessToken, includeTestInApi]);

  useEffect(() => {
    if (!apiAccessToken || tab !== 'settings') return;
    void nestAiInfluencerProductionTestActive(apiAccessToken).then((res) => {
      if (res?.job) setProductionTest(res.job);
    });
  }, [apiAccessToken, tab]);

  useEffect(() => {
    if (!apiAccessToken || tab !== 'settings') return;
    if (!productionTest || productionTest.progress.outcome === 'PASS' || productionTest.progress.outcome === 'FAIL') {
      return;
    }
    const pollActive = () => {
      void nestAiInfluencerActiveJobs(apiAccessToken).then((active) => {
        if (active) setActiveJobs(active);
      });
    };
    pollActive();
    const activeId = window.setInterval(pollActive, 2500);
    return () => window.clearInterval(activeId);
  }, [apiAccessToken, tab, productionTest?.jobId, productionTest?.progress.outcome]);

  useEffect(() => {
    if (!apiAccessToken || tab !== 'settings') return;
    if (!productionTest || productionTest.progress.outcome === 'PASS' || productionTest.progress.outcome === 'FAIL') {
      return;
    }
    const poll = () => {
      void nestAiInfluencerProductionTestStatus(apiAccessToken, productionTest.jobId).then((res) => {
        if (res?.job) {
          setProductionTest(res.job);
          if (res.job.progress.outcome === 'PASS') {
            setToast('Testovací video bylo vytvořeno.');
            void nestAiInfluencerVideos(apiAccessToken, 60, true).then((v) => {
              if (v) setVideos(v);
            });
          }
        }
      });
    };
    poll();
    const id = window.setInterval(poll, 2000);
    return () => window.clearInterval(id);
  }, [apiAccessToken, tab, productionTest?.jobId, productionTest?.progress.outcome]);

  useEffect(loadCore, [loadCore]);

  useEffect(() => {
    try {
      window.sessionStorage.removeItem('xxrealit.ai-influencer.activeJobs');
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!apiAccessToken) return;
    const shouldPoll =
      tab === 'production' || tab === 'overview' || tab === 'videos' || activeJobs.length > 0;
    if (!shouldPoll) return;

    const poll = () => {
      void Promise.all([
        nestAiInfluencerActiveJobs(apiAccessToken),
        nestAiInfluencerVideos(apiAccessToken, 60, includeTestInApi),
        nestAiInfluencerDashboard(apiAccessToken),
        nestAiInfluencerJobs(apiAccessToken),
      ]).then(([active, v, d, j]) => {
        if (active) {
          const prevIds = prevActiveIdsRef.current;
          const nextIds = active.map((job) => job.id);
          const removedIds = prevIds.filter((id) => !nextIds.includes(id));
          if (removedIds.length > 0 && j) {
            const completedRows = removedIds
              .map((id) => j.find((job) => job.id === id))
              .filter(
                (row): row is AiInfluencerJobRow =>
                  Boolean(row) &&
                  ['READY', 'PUBLISHED', 'PARTIALLY_PUBLISHED'].includes(row!.status) &&
                  jobHasGalleryVideo(row!),
              );
            for (const row of completedRows) {
              const eventId = buildVideoReadyEventId(row);
              const seen = readSeenToastEvents();
              if (seen.has(eventId)) continue;
              rememberToastEvent(eventId);
              setToast(
                row.isTest
                  ? 'Testovací video bylo vytvořeno a uloženo do galerie.'
                  : 'Video bylo vytvořeno a uloženo do galerie.',
              );
              break;
            }
          }
          prevActiveIdsRef.current = nextIds;
          setActiveJobs(active);
        }
        if (v) setVideos(v);
        if (d) setDashboard(d);
        if (j) setJobs(j);
      });
    };

    poll();
    const id = window.setInterval(poll, 4000);
    return () => window.clearInterval(id);
  }, [apiAccessToken, tab, includeTestInApi, activeJobs.length]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!apiAccessToken || !detailJobId) return;
    void nestAiInfluencerGetJob(apiAccessToken, detailJobId).then((job) => {
      if (job) setDetailJob(job);
    });
  }, [apiAccessToken, detailJobId]);

  const skippedJobs = useMemo(
    () => jobs.filter((j) => ['SKIPPED_QUALITY', 'SKIPPED_DUPLICATE'].includes(j.status)),
    [jobs],
  );

  const failedJobs = useMemo(
    () => jobs.filter((j) => j.status === 'FAILED'),
    [jobs],
  );

  const cancelledJobs = useMemo(
    () => jobs.filter((j) => j.status === 'CANCELLED'),
    [jobs],
  );

  const jobsConsistencyAlert =
    dashboard?.jobsConsistencyAlert ??
    ((dashboard?.stats.jobsStartedToday ?? 0) > 0 &&
    (dashboard?.stats.jobsUnaccountedToday ?? dashboard?.debugCounts?.jobsUnaccountedToday ?? 0) > 0
      ? 'Nekonzistentní stav jobů – některé spuštěné joby nejsou zařazené.'
      : null);

  const recentCompleted = useMemo(
    () => dashboard?.recentCompleted ?? [],
    [dashboard?.recentCompleted],
  );

  const filteredArticles = useMemo(() => {
    return articles.filter((a) => {
      if (candidateFilter === 'suitable') return (a.reelScore ?? 0) >= (dashboard?.settings.minScore ?? 60);
      if (candidateFilter === 'unused') return !a.latestJob;
      if (candidateFilter === 'used') return Boolean(a.latestJob);
      return true;
    });
  }, [articles, candidateFilter, dashboard?.settings.minScore]);

  const filteredVideos = useMemo(() => {
    return videos.filter((v) => {
      if (!showTestVideos && v.isTest) return false;
      if (videoFilter === 'test') return v.isTest === true;
      if (videoFilter === 'production') return !v.isTest;
      if (videoFilter === 'published') {
        return v.gallery?.galleryStatus === 'PUBLISHED' || v.gallery?.galleryStatus === 'PARTIAL';
      }
      if (videoFilter === 'unpublished') {
        return v.gallery?.galleryStatus === 'READY' || v.status === 'READY';
      }
      if (videoFilter === 'ready') {
        return v.gallery?.galleryStatus === 'READY' || v.status === 'READY';
      }
      if (videoFilter === 'failed') return v.gallery?.galleryStatus === 'QUALITY_REVIEW' || v.status === 'FAILED';
      if (videoFilter === 'video_agent') return (v.generationMode ?? v.display?.generationMode) !== 'AVATAR';
      if (videoFilter === 'avatar') return (v.generationMode ?? v.display?.generationMode) === 'AVATAR';
      return true;
    });
  }, [videos, videoFilter, showTestVideos]);

  const productionMode = dashboard?.providers.videoEngine?.videoGenerationMode ?? 'VIDEO_AGENT';
  const productionReady = dashboard?.providers.ready?.productionReady ?? dashboard?.providers.ready?.ready;
  const productionVerified =
    dashboard?.productionVerification?.status === 'VERIFIED' ||
    dashboard?.providers.ready?.productionVerified === true;
  const productionVerificationStatus =
    dashboard?.productionVerification?.status ??
    dashboard?.providers.ready?.productionVerificationStatus ??
    'UNVERIFIED';
  const providers = dashboard?.providers;

  const handleRetry = (job: AiInfluencerJobRow) => {
    setBusy(`retry-${job.id}`);
    const action =
      job.status === 'SKIPPED_QUALITY'
        ? nestAiInfluencerForceStartJob(apiAccessToken, job.id)
        : job.status === 'SKIPPED_DUPLICATE' && job.article?.id
          ? nestAiInfluencerCreateJob(apiAccessToken, job.article.id, true)
          : nestAiInfluencerRetryJob(apiAccessToken, job.id);
    void action.then(() => {
      setBusy(null);
      loadCore();
      setTab('production');
    });
  };

  const handleReconcileHeyGen = (jobId: string) => {
    setBusy(`reconcile-${jobId}`);
    void nestAiInfluencerReconcileHeyGen(apiAccessToken, jobId).then((result) => {
      setBusy(null);
      if (result.error || !result.data) {
        setToast(result.error ?? 'Synchronizace HeyGen selhala.');
        return;
      }
      setToast(result.data.message ?? `HeyGen sync: ${result.data.outcome}`);
      void loadCore();
    });
  };

  const handleDelete = (jobId: string, historyOnly = false, isProduction = false) => {
    const message = historyOnly
      ? 'Odstranit pouze z historie?'
      : isProduction
        ? 'Odstranit produkční video? Smaže se pouze lokální záznam ve správě, ne na sociálních sítích.'
        : 'Odstranit tento záznam?';
    if (!window.confirm(message)) return;
    setBusy(`delete-${jobId}`);
    void nestAiInfluencerDeleteJob(apiAccessToken, jobId, historyOnly).then(() => {
      setBusy(null);
      loadCore();
    });
  };

  const handleCancel = (job: AiInfluencerActiveJob) => {
    setCancelError(null);
    setCancelModalJob(job);
  };

  const confirmCancel = (force = false) => {
    if (!cancelModalJob) return;
    const jobId = cancelModalJob.id;
    setBusy(`cancel-${jobId}`);
    const request = force
      ? nestAiInfluencerForceCancelJob(apiAccessToken, jobId)
      : nestAiInfluencerCancelJob(apiAccessToken, jobId);
    void request.then((result) => {
      setBusy(null);
      if (result.error) {
        setCancelError(result.error);
        return;
      }
      const cleanedOrphan =
        result.data &&
        typeof result.data === 'object' &&
        'cleanedOrphan' in result.data &&
        result.data.cleanedOrphan === true;
      if (!result.data && !cleanedOrphan) {
        setCancelError('Zrušení výroby selhalo.');
        return;
      }
      setCancelModalJob(null);
      setCancelError(null);
      setActiveJobs((prev) => prev.filter((job) => job.id !== jobId));
      prevActiveIdsRef.current = prevActiveIdsRef.current.filter((id) => id !== jobId);
      try {
        window.sessionStorage.removeItem('xxrealit.ai-influencer.activeJobs');
      } catch {
        /* ignore */
      }
      setToast('Výroba byla ukončena.');
      loadCore();
    });
  };

  const handleRepairJobs = () => {
    setRepairBusy(true);
    setRepairResult(null);
    void nestAiInfluencerRepairJobs(apiAccessToken, 40).then((result) => {
      setRepairBusy(false);
      if (result.error || !result.data) {
        setToast(result.error ?? 'Oprava jobů selhala.');
        return;
      }
      setRepairResult(result.data);
      setToast(
        `Oprava: nalezeno ${result.data.scanned}, obnoveno ${result.data.recovered}, zrušeno ${result.data.cancelled}, orphan ${result.data.orphaned}`,
      );
      loadCore();
    });
  };

  const handleCreateJob = async (articleId: string, force = false) => {
    setCreateError(null);
    setCreateState('submitting');
    const result = await nestAiInfluencerCreateJob(apiAccessToken, articleId, true);
    if (result.error || !result.data) {
      setCreateState('error');
      if (result.errorCode === 'VIDEO_GENERATION_ALREADY_RUNNING') {
        setCreateError('Probíhá výroba jiného videa. Počkejte na dokončení nebo zrušte aktivní job.');
      } else {
        setCreateError(result.error ?? 'Vytvoření jobu selhalo.');
      }
      return;
    }
    const created = result.data;
    setCreateState('accepted');
    setToast('Výroba byla spuštěna');
    setCreateOpen(false);
    setCreateState('idle');
    setCreateError(null);
    setTab('production');
    prevActiveIdsRef.current = [created.jobId, ...prevActiveIdsRef.current.filter((id) => id !== created.jobId)];
    loadCore();
  };

  const openPublishModal = (job: AiInfluencerJobRow) => {
    setPublishResult(null);
    setPublishJob(job);
    setPublishChannels({
      facebook: channelPublishReady('facebook', providers).ready,
      instagram: channelPublishReady('instagram', providers).ready,
      youtube: channelPublishReady('youtube', providers).ready,
      portal: channelPublishReady('portal', providers).ready,
    });
  };

  const handleManualPublish = async () => {
    if (!publishJob) return;
    const selected = (Object.entries(publishChannels) as Array<[ManualPublishChannel, boolean]>)
      .filter(([, enabled]) => enabled)
      .map(([channel]) => channel);
    if (selected.length === 0) {
      setToast('Vyberte alespoň jeden kanál.');
      return;
    }
    setPublishBusy(true);
    setPublishResult(null);
    const result = await nestAiInfluencerPublishManual(apiAccessToken, publishJob.id, selected);
    setPublishBusy(false);
    if (result.error || !result.data) {
      setToast(result.error ?? 'Publikace selhala.');
      return;
    }
    setPublishResult(result.data);
    setToast(result.data.ok ? 'Publikace dokončena.' : 'Publikace dokončena s chybami.');
    loadCore();
  };

  return (
    <div className="space-y-4">
      {toast ? (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-emerald-700 px-4 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                tab === t.id ? 'bg-white text-orange-700 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={generationBlocked}
          onClick={() => {
            if (generationBlocked) return;
            setCreateError(null);
            setCreateState('idle');
            setCreateOpen(true);
          }}
          className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Vytvořit AI Reel
        </button>
      </div>

      {generationBlocked && primaryActiveJob ? (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-950">
          <p className="font-semibold">Probíhá výroba jiného videa.</p>
          <p className="mt-1">
            {primaryActiveJob.articleTitle} · {primaryActiveJob.progressPercent ?? 0} % ·{' '}
            {primaryActiveJob.currentStep ?? 'Generuji…'} · {elapsedSince(primaryActiveJob.createdAt ?? primaryActiveJob.updatedAt)}
          </p>
          <button
            type="button"
            className="mt-2 rounded border border-orange-400 px-3 py-1 text-xs font-medium"
            onClick={() => setTab('production')}
          >
            Přejít na výrobu
          </button>
        </div>
      ) : null}

      {tab === 'overview' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {[
              ['Dnes spuštěno', dashboard?.stats.jobsStartedToday ?? dashboard?.stats.reelsToday ?? 0],
              ['Dnes dokončeno', dashboard?.stats.jobsCompletedToday ?? 0],
              ['Ve výrobě', dashboard?.stats.inQueue ?? activeJobs.length],
              ['Čeká ve frontě', dashboard?.stats.queuedToday ?? dashboard?.debugCounts?.queuedJobsToday ?? 0],
              [
                'HeyGen hotovo / čeká import',
                dashboard?.stats.heygenPendingImport ?? 0,
              ],
              ['Publikováno', dashboard?.stats.published ?? 0],
              ['Selhalo dnes', dashboard?.stats.failed ?? failedJobs.length],
              ...(dashboard?.stats.skippedToday
                ? [['Přeskočeno dnes', dashboard.stats.skippedToday] as const]
                : []),
              ['Náklady dnes', `${(dashboard?.stats.costTodayCzk ?? 0).toFixed(2)} Kč`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-zinc-200 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
                <p className="mt-1 text-2xl font-bold text-zinc-900">{value}</p>
              </div>
            ))}
          </div>

          {jobsConsistencyAlert ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">{jobsConsistencyAlert}</p>
              <button
                type="button"
                className="mt-2 rounded border border-amber-400 px-3 py-1 text-xs font-medium"
                onClick={() => {
                  setTab('settings');
                  setShowDiagnostics(true);
                }}
              >
                Spustit diagnostiku
              </button>
            </div>
          ) : null}

          {(dashboard?.stats.heygenPendingImport ?? 0) > 0 ? (
            <div className="rounded-xl border border-orange-300 bg-orange-50 p-4 text-sm text-orange-950">
              <p className="font-semibold">
                HeyGen dokončil {dashboard?.stats.heygenPendingImport} videí, která ještě nebyla uložena do
                XXREALIT.
              </p>
              <button
                type="button"
                disabled={heygenSyncBusy}
                className="mt-2 rounded bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
                onClick={() => {
                  setHeygenSyncBusy(true);
                  void nestAiInfluencerSyncHeyGen(apiAccessToken, { limit: 30, sinceDays: 14 }).then((res) => {
                    setHeygenSyncBusy(false);
                    if (!res) {
                      setToast('Synchronizace HeyGen selhala.');
                      return;
                    }
                    setHeygenSyncResult(
                      `Nalezeno: ${res.foundInHeyGen}, obnoveno: ${res.recovered}, galerie: ${res.storedInGallery}, stále se vyrábí: ${res.stillProcessing}, chybí ID: ${res.providerIdMissing}, chyby: ${res.errors}`,
                    );
                    setToast(`HeyGen sync: uloženo ${res.storedInGallery} videí.`);
                    loadCore();
                  });
                }}
              >
                {heygenSyncBusy ? 'Synchronizuji…' : 'Dokončit synchronizaci'}
              </button>
              {heygenSyncResult ? <p className="mt-2 text-xs">{heygenSyncResult}</p> : null}
            </div>
          ) : null}

          {dashboard?.generationQueue ? (
            <section className="rounded-xl border border-zinc-200 bg-white p-4">
              <p className="text-sm font-semibold text-zinc-900">Generation queue</p>
              <div className="mt-2 grid gap-2 text-sm text-zinc-700 sm:grid-cols-2 lg:grid-cols-4">
                <p>Queued: {dashboard.generationQueue.queued}</p>
                <p>Processing: {dashboard.generationQueue.processing ?? dashboard.generationQueue.claimed}</p>
                <p>Claimed: {dashboard.generationQueue.claimed}</p>
                <p>
                  Worker:{' '}
                  <strong
                    className={
                      dashboard.generationQueue.workerStatus === 'READY'
                        ? 'text-emerald-700'
                        : 'text-amber-700'
                    }
                  >
                    {dashboard.generationQueue.workerStatus}
                  </strong>
                </p>
                <p>
                  Last run:{' '}
                  {dashboard.generationQueue.lastWorkerRun
                    ? new Date(dashboard.generationQueue.lastWorkerRun).toLocaleTimeString('cs-CZ')
                    : '—'}
                </p>
                <p>
                  Last claimed: {dashboard.generationQueue.lastClaimedJobId ?? '—'}
                </p>
              </div>
              {dashboard.generationQueue.message ? (
                <p className="mt-2 text-xs text-amber-700">{dashboard.generationQueue.message}</p>
              ) : null}
              <button
                type="button"
                className="mt-3 rounded border border-zinc-300 px-3 py-1 text-xs"
                onClick={() => void nestAiInfluencerWakeWorker(apiAccessToken).then(loadCore)}
              >
                Probudit worker
              </button>
            </section>
          ) : null}

          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-zinc-600">
                  Aktivní režim: <strong>{modeLabel(productionMode)}</strong>
                </p>
                <p className="text-sm text-zinc-600">
                  Konfigurace:{' '}
                  <strong className={productionReady ? 'text-emerald-700' : 'text-amber-700'}>
                    {productionReady ? 'CONFIGURED' : 'DEGRADED'}
                  </strong>
                </p>
                <p className="text-sm text-zinc-600">
                  Pipeline:{' '}
                  <strong className={productionVerified ? 'text-emerald-700' : 'text-amber-700'}>
                    {productionVerified ? 'READY' : productionVerificationStatus === 'FAILED' ? 'FAILED' : 'UNVERIFIED'}
                  </strong>
                </p>
                <p className="text-sm text-zinc-600">
                  Aktivní výroba: <strong>{activeJobs.length}</strong>
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  dashboard?.automation?.paused
                    ? 'bg-red-100 text-red-800'
                    : dashboard?.automation?.enabled
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-zinc-100 text-zinc-700'
                }`}
              >
                {dashboard?.automation?.paused ? 'POZASTAVENO' : dashboard?.automation?.enabled ? 'AUTOMATIKA ZAPNUTA' : 'AUTOMATIKA VYPNUTA'}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <HealthChip
                label="Script AI"
                ok={aiScriptCanonicalReady(providers?.ai)}
                detail={providers?.ai?.message ?? 'OpenAI pro scénáře a storyboard.'}
              />
              <HealthChip
                label="Video Agent"
                ok={videoAgentCanonicalReady(providers)}
                detail={
                  providers?.videoEngine?.heygenVideoAgentMessage ??
                  providers?.renderer?.message ??
                  undefined
                }
              />
              <HealthChip
                label="Renderer"
                ok={providers?.renderer?.connected === true}
                detail={providers?.renderer?.message ?? 'ffmpeg pro finální render.'}
              />
              <HealthChip
                label="Voice"
                ok={
                  !providers?.activePipeline?.elevenLabsRequired ||
                  providers?.elevenLabs?.ttsReady === true ||
                  providers?.elevenLabs?.status === 'CONNECTED'
                }
                detail={
                  !providers?.activePipeline?.elevenLabsRequired
                    ? `Voice: ${providers?.activePipeline?.voiceEngine ?? 'HeyGen built-in'}`
                    : providers?.elevenLabs?.detailMessage ?? 'ElevenLabs TTS pro avatar pipeline.'
                }
              />
              <HealthChip label="Avatar" ok={providers?.heygen?.generationReady === true} detail={providers?.heygen?.detailMessage ?? undefined} />
              <HealthChip label="Storage" ok={providers?.storage?.configured === true} detail={providers?.storage?.message ?? undefined} />
              <HealthChip
                label="FB"
                ok={facebookHealthChip(providers).ok}
                warn={facebookHealthChip(providers).warn}
                detail={facebookHealthChip(providers).detail}
              />
              <HealthChip
                label="IG"
                ok={providers?.instagram?.publishReady === true}
                warn={providers?.instagram?.connected === true && !providers?.instagram?.publishReady}
                detail={providerDetailInstagram(providers)}
                action={
                  !providers?.instagram?.publishReady ? (
                    <button
                      type="button"
                      className="text-orange-700 underline"
                      onClick={() => void nestAiInfluencerVerifyInstagram(apiAccessToken).then(loadCore)}
                    >
                      Opravit Instagram
                    </button>
                  ) : undefined
                }
              />
              <HealthChip label="YT" ok={Boolean(providers?.youtube?.connected && providers?.youtube?.refreshTokenOk && providers?.youtube?.uploadScopeOk)} detail={providerDetailYoutube(providers)} />
              <HealthChip label="Shorts" ok={providers?.shorts?.connected === true} detail={providerDetailShorts(providers)} />
            </div>
          </section>

          {activeJobs.length > 0 ? (
            <section className="rounded-xl border border-zinc-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-zinc-900">Aktuálně se vyrábí</h2>
              <div className="mt-3 space-y-3">
                {activeJobs.slice(0, 3).map((job) => (
                  <div key={job.id} className="rounded-lg border border-zinc-100 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-zinc-900">
                          {job.isTest ? (
                            <span className="mr-2 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-800">
                              Test
                            </span>
                          ) : null}
                          {job.articleTitle}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {job.sourceType === 'property' ? 'nemovitost' : 'článek'} · {modeLabel(job.generationMode)} · {elapsedSince(job.createdAt ?? job.updatedAt)}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-orange-700">{job.progressPercent ?? 0} %</span>
                    </div>
                    <p className="mt-1 text-sm text-zinc-700">{job.currentStep ?? 'Generuji…'}</p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100">
                      <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${Math.min(100, job.progressPercent ?? 0)}%` }} />
                    </div>
                    <PipelineBar steps={job.pipelineSteps} />
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {failedJobs.length > 0 ? (
            <section className="rounded-xl border border-red-100 bg-red-50/40 p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-red-900">Vyžaduje pozornost ({failedJobs.length})</h2>
                <button type="button" className="text-sm text-orange-700 underline" onClick={() => setTab('errors')}>
                  Zobrazit vše
                </button>
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {tab === 'production' ? (
        <>
          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-zinc-900">Aktuálně se vyrábí</h2>
            {activeJobs.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">Aktuálně se nevyrábí žádné video.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {activeJobs.map((job) => (
                  <div key={job.id} className="rounded-lg border border-zinc-100 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-zinc-900">
                          {job.isTest ? (
                            <span className="mr-2 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-800">
                              Test
                            </span>
                          ) : null}
                          {job.articleTitle}
                        </p>
                        <p className="text-xs text-zinc-500">
                          Job ID: {job.canonicalJobId ?? job.id}
                          {job.providerJobId ? ` · HeyGen: ${job.providerJobId}` : ''}
                        </p>
                        <p className="text-xs text-zinc-500">
                          Zdroj: {job.sourceType === 'property' ? 'nemovitost' : 'článek'} · Režim: {modeLabel(job.generationMode)}
                        </p>
                        <p className="mt-1 text-sm text-zinc-700">Aktuální krok: {job.currentStep ?? '—'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-orange-700">{job.progressPercent ?? 0} %</p>
                        <p className="text-xs text-zinc-500">Čas: {elapsedSince(job.createdAt ?? job.updatedAt)}</p>
                      </div>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100">
                      <div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.min(100, job.progressPercent ?? 0)}%` }} />
                    </div>
                    <PipelineBar steps={job.pipelineSteps} />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className="rounded border border-zinc-300 px-3 py-1 text-xs" onClick={() => setDetailJobId(job.id)}>
                        Detail
                      </button>
                      <button
                        type="button"
                        disabled={busy === `cancel-${job.id}`}
                        className="rounded border border-red-200 px-3 py-1 text-xs text-red-700"
                        onClick={() => handleCancel(job)}
                      >
                        Zrušit výrobu
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {recentCompleted.length > 0 ? (
            <section className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-zinc-900">Nedávno dokončeno</h2>
                <button
                  type="button"
                  className="text-xs font-medium text-orange-700 underline"
                  onClick={() => setTab('videos')}
                >
                  Zobrazit všechna videa
                </button>
              </div>
              <div className="mt-3 space-y-3">
                {recentCompleted.map((job) => {
                  const master = resolveMasterUrl(job);
                  const gallery = job.gallery;
                  return (
                    <div key={job.id} className="rounded-lg border border-zinc-100 p-3">
                      <div className="flex flex-wrap gap-3">
                        <div className="h-20 w-14 shrink-0 overflow-hidden rounded bg-zinc-900">
                          {master ? (
                            <video className="h-full w-full object-cover" src={master} preload="metadata" muted>
                              <track kind="captions" />
                            </video>
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs text-zinc-500">—</div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-zinc-900">{resolveAiInfluencerJobTitle(job)}</p>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                                job.isTest ? 'bg-violet-100 text-violet-800' : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {job.isTest ? 'Test' : 'Produkční'}
                            </span>
                            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-zinc-700">
                              {galleryStatusLabel(gallery?.galleryStatus)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-zinc-600">
                            Dokončeno: {gallery?.completedCombinedLabel ?? gallery?.finishedAt ?? '—'}
                          </p>
                          <p className="text-xs text-zinc-600">
                            Délka: {gallery?.durationFormatted ?? '—'} · Režim:{' '}
                            {modeLabel(job.generationMode ?? job.display?.generationMode)} · V galerii:{' '}
                            {gallery?.inGallery ? '✓' : '—'}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-zinc-500">
                            <span>FB {publishIcon(job.facebookPublishStatus)}</span>
                            <span>IG {publishIcon(job.instagramPublishStatus)}</span>
                            <span>YT {publishIcon(job.youtubePublishStatus)}</span>
                            <span>Shorts {job.postId ? '✓' : '—'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {master ? (
                          <button
                            type="button"
                            className="rounded border border-zinc-300 px-2 py-1 text-xs"
                            onClick={() => setPlayVideoUrl(master)}
                          >
                            Přehrát
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="rounded border border-zinc-300 px-2 py-1 text-xs"
                          onClick={() => setDetailJobId(job.id)}
                        >
                          Detail
                        </button>
                        <button
                          type="button"
                          className="rounded border border-zinc-300 px-2 py-1 text-xs"
                          onClick={() => setTab('videos')}
                        >
                          Přejít do galerie
                        </button>
                        {['READY', 'PARTIALLY_PUBLISHED'].includes(job.status) ? (
                          <button
                            type="button"
                            className="rounded bg-orange-600 px-2 py-1 text-xs font-medium text-white"
                            onClick={() => openPublishModal(job)}
                          >
                            Publikovat
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="rounded border border-red-200 px-2 py-1 text-xs text-red-700"
                          onClick={() => handleDelete(job.id, false, !job.isTest)}
                        >
                          Odstranit
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-zinc-900">Kandidáti</h2>
              <select
                value={candidateFilter}
                onChange={(e) => setCandidateFilter(e.target.value as typeof candidateFilter)}
                className="rounded border border-zinc-300 px-2 py-1 text-xs"
              >
                <option value="suitable">Vhodné pro Reel</option>
                <option value="unused">Nevybrané</option>
                <option value="used">Již použité</option>
                <option value="all">Všechny</option>
              </select>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500">
                    <th className="py-2 pr-4">Název</th>
                    <th className="py-2 pr-4">Kategorie</th>
                    <th className="py-2 pr-4">AI score</th>
                    <th className="py-2 pr-4">Stav</th>
                    <th className="py-2">Akce</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredArticles.slice(0, 30).map((a) => (
                    <tr key={a.id} className="border-b border-zinc-50">
                      <td className="py-2 pr-4 font-medium text-zinc-900">{a.title}</td>
                      <td className="py-2 pr-4 text-zinc-600">{a.category}</td>
                      <td className="py-2 pr-4">{a.reelScore ?? '—'}</td>
                      <td className="py-2 pr-4 text-xs">{a.latestJob?.status ?? '—'}</td>
                      <td className="py-2">
                        <button
                          type="button"
                          className="rounded bg-orange-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                          disabled={busy === `create-${a.id}`}
                          onClick={() => {
                            setBusy(`create-${a.id}`);
                            void handleCreateJob(
                              a.id,
                              (a.reelScore ?? 0) < (dashboard?.settings.minScore ?? 60),
                            ).finally(() => setBusy(null));
                          }}
                        >
                          {(a.reelScore ?? 0) < (dashboard?.settings.minScore ?? 60) ? 'Vytvořit i tak' : 'Vytvořit Reel'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {tab === 'videos' ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            {(['all', 'production', 'test', 'published', 'unpublished', 'ready', 'failed', 'video_agent', 'avatar'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setVideoFilter(f)}
                className={`rounded-full px-3 py-1 text-xs ${videoFilter === f ? 'bg-orange-100 text-orange-800' : 'bg-zinc-100 text-zinc-600'}`}
              >
                {f === 'all'
                  ? 'Všechna'
                  : f === 'production'
                    ? 'Produkční'
                    : f === 'test'
                      ? 'Testovací'
                      : f === 'published'
                        ? 'Publikovaná'
                        : f === 'unpublished'
                          ? 'Nepublikovaná'
                          : f === 'ready'
                            ? 'Čekající'
                            : f === 'failed'
                              ? 'Quality review'
                              : f === 'video_agent'
                                ? 'Video Agent'
                                : 'Avatar fallback'}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowTestVideos((v) => !v)}
              className={`rounded-full px-3 py-1 text-xs ${showTestVideos ? 'bg-violet-100 text-violet-800' : 'bg-zinc-100 text-zinc-600'}`}
            >
              {showTestVideos ? 'Skrýt testovací' : 'Zobrazit testovací'}
            </button>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredVideos.length === 0 ? (
              <p className="col-span-full text-sm text-zinc-500">Zatím nebylo dokončeno žádné video.</p>
            ) : null}
            {filteredVideos.map((job) => {
              const master = resolveMasterUrl(job);
              const gallery = job.gallery;
              return (
                <div key={job.id} className="overflow-hidden rounded-xl border border-zinc-200">
                  <div className="aspect-[9/16] max-h-72 bg-zinc-900">
                    {master ? (
                      <video className="h-full w-full object-cover" src={master} controls preload="metadata">
                        <track kind="captions" />
                      </video>
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-xs text-zinc-400">
                        <span className="text-2xl">▶</span>
                        <span>{resolveAiInfluencerJobTitle(job)}</span>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="line-clamp-2 text-sm font-medium text-zinc-900">{resolveAiInfluencerJobTitle(job)}</p>
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          job.isTest ? 'bg-violet-100 text-violet-800' : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {job.isTest ? 'Test' : 'Produkční'}
                      </span>
                      <span className="rounded bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-700">
                        {galleryStatusLabel(gallery?.galleryStatus)}
                      </span>
                      <span className="rounded bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
                        {(job.generationMode ?? job.display?.generationMode) === 'AVATAR' ? 'Avatar' : 'Video Agent'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-zinc-600">
                      <span>Dokončeno:</span>
                      <span>{gallery?.completedCombinedLabel ?? gallery?.finishedAt ?? '—'}</span>
                      <span>Vytvořeno:</span>
                      <span>{gallery?.createdCombinedLabel ?? '—'}</span>
                      <span>Délka:</span>
                      <span>{gallery?.durationFormatted ?? (job.estimatedDurationSec ? `${job.estimatedDurationSec}s` : '—')}</span>
                      <span>Režim:</span>
                      <span>{modeLabel(job.generationMode ?? job.display?.generationMode)}</span>
                      <span>Status:</span>
                      <span>{galleryStatusLabel(gallery?.galleryStatus)}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[10px] text-zinc-500">
                      <span>Publikace:</span>
                      <span>FB {publishIcon(job.facebookPublishStatus)}</span>
                      <span>IG {publishIcon(job.instagramPublishStatus)}</span>
                      <span>YT {publishIcon(job.youtubePublishStatus)}</span>
                      <span>Shorts {job.postId ? '✓' : '—'}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {master ? (
                        <button
                          type="button"
                          className="rounded border border-zinc-300 px-2 py-1 text-xs"
                          onClick={() => setPlayVideoUrl(master)}
                        >
                          Přehrát
                        </button>
                      ) : null}
                      <button type="button" className="rounded border border-zinc-300 px-2 py-1 text-xs" onClick={() => setDetailJobId(job.id)}>
                        Detail
                      </button>
                      {['READY', 'PARTIALLY_PUBLISHED'].includes(job.status) ? (
                        <button
                          type="button"
                          className="rounded bg-orange-600 px-2 py-1 text-xs font-medium text-white"
                          onClick={() => openPublishModal(job)}
                        >
                          Publikovat
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="rounded border border-zinc-300 px-2 py-1 text-xs"
                        disabled={busy === `regen-${job.id}`}
                        onClick={() => {
                          setBusy(`regen-${job.id}`);
                          void nestAiInfluencerRegenerateJob(apiAccessToken, job.id).finally(() => {
                            setBusy(null);
                            loadCore();
                          });
                        }}
                      >
                        Znovu vytvořit
                      </button>
                      <button
                        type="button"
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-700"
                        onClick={() => handleDelete(job.id, false, !job.isTest)}
                      >
                        Odstranit
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {tab === 'errors' ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-900">Vyžaduje pozornost</h2>
            {failedJobs.length > 0 ? (
              <button
                type="button"
                className="rounded border border-red-200 px-3 py-1 text-xs text-red-700"
                onClick={() => {
                  if (!window.confirm('Odstranit všechny neúspěšné pokusy?')) return;
                  void nestAiInfluencerDeleteFailedJobs(apiAccessToken).then(loadCore);
                }}
              >
                Odstranit všechny neúspěšné pokusy
              </button>
            ) : null}
          </div>
          {skippedJobs.length > 0 ? (
            <div className="mt-4 space-y-3">
              <h3 className="text-sm font-semibold text-amber-900">Přeskočeno automatikou ({skippedJobs.length})</h3>
              {skippedJobs.map((job) => (
                <div key={job.id} className="rounded-lg border border-amber-100 bg-amber-50/40 p-4">
                  <p className="font-medium text-zinc-900">{resolveAiInfluencerJobTitle(job)}</p>
                  <p className="mt-1 text-sm text-amber-900">{job.skipReason ?? job.currentStep ?? 'Automatika přeskočila'}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded bg-orange-600 px-3 py-1 text-xs font-medium text-white"
                      onClick={() => handleRetry(job)}
                    >
                      Vytvořit i tak
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {failedJobs.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">Žádné problémy.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {failedJobs.map((job) => (
                <div key={job.id} className="rounded-lg border border-red-100 bg-red-50/30 p-4">
                  <p className="font-medium text-zinc-900">{resolveAiInfluencerJobTitle(job)}</p>
                  <p className="mt-1 text-sm text-zinc-700">
                    Fáze: <strong>{stageLabel(job.failedStage ?? job.display?.failedStageResolved)}</strong>
                  </p>
                  <p className="mt-1 text-sm text-red-800">{jobErrorMessage(job)}</p>
                  {job.errorCode || job.display?.displayErrorCode ? (
                    <details className="mt-2 text-xs text-zinc-500">
                      <summary>Technický detail</summary>
                      <p className="mt-1">{job.display?.displayErrorCode ?? job.errorCode}</p>
                      {job.errorMessage && job.errorKind === 'LEGACY_STALE' ? <p>{job.errorMessage}</p> : null}
                    </details>
                  ) : null}
                  {job.providerJobIdMasked ? (
                    <p className="mt-1 text-xs text-zinc-600">HeyGen job: {job.providerJobIdMasked}</p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {job.canReconcileHeyGen ? (
                      <button
                        type="button"
                        disabled={busy === `reconcile-${job.id}`}
                        className="rounded bg-emerald-700 px-3 py-1 text-xs font-medium text-white"
                        onClick={() => handleReconcileHeyGen(job.id)}
                      >
                        {busy === `reconcile-${job.id}` ? 'Synchronizuji…' : 'Dovést video z HeyGen'}
                      </button>
                    ) : null}
                    {job.errorCode === 'STORAGE_FAILED' ? (
                      <button
                        type="button"
                        disabled={busy === `storage-${job.id}`}
                        className="rounded bg-emerald-700 px-3 py-1 text-xs font-medium text-white"
                        onClick={() => {
                          setBusy(`storage-${job.id}`);
                          void nestAiInfluencerRetryStorageJob(apiAccessToken, job.id).then((result) => {
                            setBusy(null);
                            if (result.error) {
                              setToast(result.error);
                              return;
                            }
                            setToast('Ukládání znovu spuštěno.');
                            loadCore();
                          });
                        }}
                      >
                        Zkusit znovu uložit
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy === `retry-${job.id}`}
                      className="rounded bg-orange-600 px-3 py-1 text-xs font-medium text-white"
                      onClick={() => handleRetry(job)}
                    >
                      {jobRetryLabel(job)}
                    </button>
                    <button type="button" className="rounded border border-zinc-300 px-3 py-1 text-xs" onClick={() => setDetailJobId(job.id)}>
                      Otevřít detail
                    </button>
                    <button
                      type="button"
                      className="rounded border border-red-200 px-3 py-1 text-xs text-red-700"
                      onClick={() => handleDelete(job.id, false)}
                    >
                      Odstranit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {cancelledJobs.length > 0 ? (
            <div className="mt-6 space-y-3">
              <h3 className="text-sm font-semibold text-zinc-800">Zrušené ({cancelledJobs.length})</h3>
              {cancelledJobs.slice(0, 20).map((job) => (
                <div key={job.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                  <p className="font-medium text-zinc-900">{resolveAiInfluencerJobTitle(job)}</p>
                  <p className="mt-1 text-sm text-zinc-600">{job.skipReason ?? job.currentStep ?? 'Zrušeno'}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Provider spuštěn: {job.providerJobIdMasked ? 'ANO' : 'NE'} · Video v galerii:{' '}
                    {jobHasGalleryVideo(job) ? 'ANO' : 'NE'}
                  </p>
                  <button
                    type="button"
                    className="mt-2 rounded border border-zinc-300 px-3 py-1 text-xs"
                    onClick={() => setDetailJobId(job.id)}
                  >
                    Detail
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === 'settings' ? (
        <div className="space-y-4">
          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-zinc-900">HeyGen synchronizace</h2>
            <p className="mt-1 text-xs text-zinc-600">
              Stáhne již dokončená HeyGen videa do XXREALIT bez vytvoření nové placené generace.
            </p>
            <button
              type="button"
              disabled={heygenSyncBusy}
              className="mt-3 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm font-medium text-orange-900 hover:bg-orange-100 disabled:opacity-60"
              onClick={() => {
                setHeygenSyncBusy(true);
                void nestAiInfluencerSyncHeyGen(apiAccessToken, { limit: 40, sinceDays: 21 }).then((res) => {
                  setHeygenSyncBusy(false);
                  if (!res) {
                    setToast('Synchronizace HeyGen selhala.');
                    return;
                  }
                  setHeygenSyncResult(
                    `Nalezeno v HeyGen: ${res.foundInHeyGen}, obnoveno: ${res.recovered}, galerie: ${res.storedInGallery}, processing: ${res.stillProcessing}, chybí ID: ${res.providerIdMissing}, chyby: ${res.errors}`,
                  );
                  setToast(`Synchronizace dokončena — ${res.storedInGallery} videí v galerii.`);
                  loadCore();
                });
              }}
            >
              {heygenSyncBusy ? 'Synchronizuji HeyGen…' : 'Synchronizovat dokončená HeyGen videa'}
            </button>
            {heygenSyncResult ? <p className="mt-2 text-xs text-zinc-600">{heygenSyncResult}</p> : null}
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-zinc-900">Automatika a publikování</h2>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={dashboard?.settings.enabled ?? false}
                  onChange={(e) => void nestAiInfluencerUpdateSettings(apiAccessToken, { enabled: e.target.checked }).then(loadCore)}
                />
                Automaticky vytvářet AI Reels
              </label>
              {dashboard?.automation?.paused ? (
                <button type="button" className="text-orange-700 underline" onClick={() => void nestAiInfluencerResumeAutomation(apiAccessToken).then(loadCore)}>
                  Obnovit automatiku
                </button>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Režim: {modeLabel(productionMode)} · Max/den: {dashboard?.settings.maxPerDay ?? 5}
            </p>
            {providers?.activePipeline ? (
              <div className="mt-4 rounded-lg border border-zinc-100 bg-zinc-50 p-3">
                <p className="text-xs font-semibold text-zinc-800">Aktivní pipeline</p>
                <p className="mt-1 text-xs text-zinc-600">
                  Voice: {providers.activePipeline.voiceEngine}
                  {providers.activePipeline.elevenLabsRequired ? '' : ' · ElevenLabs optional'}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-zinc-700">
                  {providers.activePipeline.steps.map((step, index) => (
                    <span key={step} className="inline-flex items-center gap-1">
                      {index > 0 ? <span className="text-zinc-400">↓</span> : null}
                      <span className="rounded bg-white px-2 py-0.5 shadow-sm">{step}</span>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-zinc-900">Video styl</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-xs text-zinc-600">
                Režim
                <select
                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-sm"
                  value={dashboard?.settings.videoGenerationMode ?? 'VIDEO_AGENT'}
                  onChange={(e) =>
                    void nestAiInfluencerUpdateSettings(apiAccessToken, {
                      videoGenerationMode: e.target.value as 'VIDEO_AGENT' | 'AVATAR',
                    }).then(loadCore)
                  }
                >
                  <option value="VIDEO_AGENT">Video Agent</option>
                  <option value="AVATAR">Avatar fallback</option>
                </select>
              </label>
              <label className="text-xs text-zinc-600">
                Délka
                <select
                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-sm"
                  value={dashboard?.settings.durationPreset ?? '25_35'}
                  onChange={(e) =>
                    void nestAiInfluencerUpdateSettings(apiAccessToken, {
                      durationPreset: e.target.value as '25_35' | '35_45' | '45_60',
                    }).then(loadCore)
                  }
                >
                  <option value="25_35">25–35 s</option>
                  <option value="35_45">35–50 s</option>
                  <option value="45_60">50–60 s</option>
                </select>
              </label>
              <label className="text-xs text-zinc-600">
                Tempo
                <select
                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-sm"
                  value={dashboard?.settings.videoTempo ?? dashboard?.settings.scenePacing ?? 'dynamic'}
                  onChange={(e) =>
                    void nestAiInfluencerUpdateSettings(apiAccessToken, {
                      videoTempo: e.target.value as 'dynamic' | 'balanced' | 'calm',
                      scenePacing: e.target.value === 'calm' ? 'calm' : e.target.value === 'balanced' ? 'balanced' : 'dynamic',
                    }).then(loadCore)
                  }
                >
                  <option value="dynamic">Dynamické</option>
                  <option value="balanced">Vyvážené</option>
                  <option value="calm">Klidné</option>
                </select>
              </label>
              <label className="text-xs text-zinc-600">
                Frekvence scén
                <select
                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-sm"
                  value={dashboard?.settings.sceneFrequency ?? 'dynamic'}
                  onChange={(e) =>
                    void nestAiInfluencerUpdateSettings(apiAccessToken, {
                      sceneFrequency: e.target.value as 'very_dynamic' | 'dynamic' | 'balanced',
                    }).then(loadCore)
                  }
                >
                  <option value="very_dynamic">Velmi dynamická</option>
                  <option value="dynamic">Dynamická</option>
                  <option value="balanced">Vyvážená</option>
                </select>
              </label>
              <label className="text-xs text-zinc-600">
                Avatar ve videu
                <select
                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-sm"
                  value={dashboard?.settings.avatarFrequency ?? 'medium'}
                  onChange={(e) =>
                    void nestAiInfluencerUpdateSettings(apiAccessToken, {
                      avatarFrequency: e.target.value as 'low' | 'medium' | 'high',
                    }).then(loadCore)
                  }
                >
                  <option value="low">Málo</option>
                  <option value="medium">Středně</option>
                  <option value="high">Často</option>
                </select>
              </label>
              <label className="text-xs text-zinc-600">
                Avatar framing
                <select
                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-sm"
                  value={dashboard?.settings.avatarFraming ?? 'fullscreen'}
                  onChange={(e) =>
                    void nestAiInfluencerUpdateSettings(apiAccessToken, {
                      avatarFraming: e.target.value as 'auto' | 'fullscreen' | 'medium' | 'closeup_mix',
                    }).then(loadCore)
                  }
                >
                  <option value="auto">Automaticky</option>
                  <option value="fullscreen">Fullscreen</option>
                  <option value="medium">Medium</option>
                  <option value="closeup_mix">Close-up mix</option>
                </select>
              </label>
              <label className="text-xs text-zinc-600">
                Pozadí
                <select
                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-sm"
                  value={dashboard?.settings.backgroundMode ?? 'auto'}
                  onChange={(e) =>
                    void nestAiInfluencerUpdateSettings(apiAccessToken, {
                      backgroundMode: e.target.value as 'auto' | 'real_estate' | 'urban' | 'interiors' | 'mix',
                    }).then(loadCore)
                  }
                >
                  <option value="auto">Automaticky měnit</option>
                  <option value="real_estate">Realitní</option>
                  <option value="urban">Městské</option>
                  <option value="interiors">Interiéry</option>
                  <option value="mix">Mix</option>
                </select>
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              {[
                ['useBroll', 'B-roll', dashboard?.settings.useBroll],
                ['useArticleImages', 'Obrázky článků', dashboard?.settings.useArticleImages],
                ['usePropertyImages', 'Fotky nemovitostí', dashboard?.settings.usePropertyImages ?? true],
                ['useTextGraphics', 'Text graphics', dashboard?.settings.useTextGraphics ?? true],
                ['useSubtitles', 'Titulky', dashboard?.settings.useSubtitles],
                ['useMusic', 'Hudba', dashboard?.settings.useMusic],
                ['useLogo', 'Logo', dashboard?.settings.useLogo],
                ['useCta', 'CTA', dashboard?.settings.useCta],
                ['mentionBrandInScript', 'Brand mention', dashboard?.settings.mentionBrandInScript],
              ].map(([key, label, checked]) => (
                <label key={String(key)} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(checked)}
                    onChange={(e) =>
                      void nestAiInfluencerUpdateSettings(apiAccessToken, {
                        [String(key)]: e.target.checked,
                      }).then(loadCore)
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-zinc-900">Test výroby videa</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Oba testy používají stejnou produkční orchestraci v DB jobu. Bez publikace.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {(
                [
                  ['AI provider', aiPreflightChip(providers?.ai)],
                  ['Scénář', aiPreflightChip(providers?.ai)],
                  ['Video Agent', videoAgentPreflightChip(providers)],
                  [
                    'Renderer',
                    {
                      ok: providers?.renderer?.connected === true,
                      chip: providers?.renderer?.connected ? 'READY' : 'BLOCKED',
                      detail: providers?.renderer?.message ?? 'ffmpeg pro finální render.',
                      tone: providers?.renderer?.connected ? 'ready' : 'blocked',
                    },
                  ],
                  [
                    'Storage',
                    {
                      ok: providers?.storage?.configured === true,
                      chip: providers?.storage?.configured ? 'READY' : 'BLOCKED',
                      detail: providers?.storage?.message ?? '',
                      tone: providers?.storage?.configured ? 'ready' : 'blocked',
                    },
                  ],
                ] as const
              ).map(([label, chip]) => (
                <div
                  key={String(label)}
                  className={`rounded border px-3 py-2 text-xs ${
                    chip.ok
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                      : chip.tone === 'configured'
                        ? 'border-amber-200 bg-amber-50 text-amber-900'
                        : chip.tone === 'disabled'
                          ? 'border-amber-200 bg-amber-50 text-amber-900'
                          : 'border-amber-200 bg-amber-50 text-amber-900'
                  }`}
                >
                  <span className="font-medium">{label}</span>{' '}
                  {chip.ok
                    ? `✓ ${chip.chip}`
                    : chip.tone === 'disabled'
                      ? '⚠ VYPNUTO'
                      : chip.tone === 'configured'
                        ? '⚠ CONFIGURED'
                        : '✕ BLOCKED'}
                  {!chip.ok && chip.detail ? <p className="mt-1 text-[11px] opacity-90">{chip.detail}</p> : null}
                </div>
              ))}
            </div>
            {!productionPreflightReady(providers) ? (
              <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                <p className="font-medium">Kompletní výrobu nelze spustit.</p>
                {!aiScriptCanonicalReady(providers?.ai) ? (
                  <>
                    <p className="mt-1">AI generování scénáře není připraveno.</p>
                    <p className="mt-1 text-xs">Důvod: {providers?.ai?.message}</p>
                  </>
                ) : null}
                {!videoAgentCanonicalReady(providers) ? (
                  <p className="mt-1 text-xs">
                    Video Agent: {providers?.videoEngine?.heygenVideoAgentMessage ?? 'není připraven'}
                  </p>
                ) : null}
                {providers?.renderer?.connected !== true ? (
                  <p className="mt-1 text-xs">Renderer: {providers?.renderer?.message ?? 'není připraven'}</p>
                ) : null}
                {providers?.storage?.configured !== true ? (
                  <p className="mt-1 text-xs">Storage: {providers?.storage?.message ?? 'není nakonfigurováno'}</p>
                ) : null}
                <a href="/admin/marketing/ai-centrum" className="mt-2 inline-block text-xs font-semibold text-orange-700 underline">
                  Otevřít nastavení AI
                </a>
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded border border-zinc-300 px-3 py-1.5 text-sm"
                disabled={scriptTestBusy || !aiScriptCanonicalReady(providers?.ai)}
                onClick={() => {
                  setScriptTestBusy(true);
                  setScriptTestResult(null);
                  void nestAiInfluencerTestScript(apiAccessToken).then((result) => {
                    setScriptTestBusy(false);
                    if (result.error || !result.data) {
                      setScriptTestResult({
                        ok: false,
                        message: result.error ?? 'Test scénáře selhal.',
                        code: result.errorCode ?? undefined,
                      });
                      return;
                    }
                    setScriptTestResult({ ...result.data, ok: true });
                  });
                }}
              >
                {scriptTestBusy ? 'Testuji scénář…' : 'Test scénáře'}
              </button>
              <button
                type="button"
                className="rounded bg-orange-600 px-3 py-1.5 text-sm font-medium text-white"
                onClick={() => setTestModalOpen(true)}
              >
                Test kompletní výroby
              </button>
              <button
                type="button"
                className="rounded border border-zinc-300 px-3 py-1.5 text-sm"
                disabled={productionTestBusy}
                onClick={() => {
                  setProductionTestBusy(true);
                  void nestAiInfluencerStartProductionTest(apiAccessToken, { mode: 'video_agent' }).then(
                    (result) => {
                      setProductionTestBusy(false);
                      if (result.error || !result.data) {
                        setToast(result.error ?? 'Test Video Agentu selhal.');
                        return;
                      }
                      setProductionTest({
                        jobId: result.data.jobId,
                        status: result.data.status,
                        progress: {
                          progressPercent: result.data.progressPercent,
                          progressLabel: result.data.progressLabel,
                          stage: 'SCRIPT',
                          outcome: 'RUNNING',
                        },
                        masterVideoUrl: null,
                        gallery: {
                          masterVideoUrl: null,
                          videoCreatedAt: null,
                          masterCreatedAt: null,
                          finishedAt: null,
                          sceneCount: 0,
                          backgroundVariationCount: null,
                          galleryStatus: 'READY',
                          durationFormatted: null,
                          createdDateLabel: null,
                          createdTimeLabel: null,
                          createdCombinedLabel: null,
                        },
                        qualityReport: {},
                        resolution: null,
                        isTest: true,
                        testKind: 'VIDEO_AGENT',
                        createdAt: new Date().toISOString(),
                        failedStage: null,
                        errorCode: null,
                        errorMessage: null,
                      });
                    },
                  );
                }}
              >
                {productionTestBusy ? 'Spouštím…' : 'Test Video Agentu'}
              </button>
            </div>

            {scriptTestResult ? (
              <div
                className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                  scriptTestResult.ok
                    ? 'border-green-200 bg-green-50 text-green-900'
                    : 'border-red-200 bg-red-50 text-red-900'
                }`}
              >
                <p className="font-semibold">{scriptTestResult.ok ? 'TEST SCÉNÁŘE: PASS' : 'TEST SCÉNÁŘE: FAIL'}</p>
                {scriptTestResult.ok ? (
                  <>
                    <p className="mt-1 text-xs">
                      Provider: {scriptTestResult.provider} · Model: {scriptTestResult.model} ·{' '}
                      {scriptTestResult.label}
                    </p>
                    <p className="mt-1 truncate text-xs opacity-80">{scriptTestResult.sample}</p>
                  </>
                ) : (
                  <>
                    {scriptTestResult.code ? (
                      <p className="mt-1 text-xs">
                        Error code: <code>{scriptTestResult.code}</code>
                        {pipelineErrorLabel(scriptTestResult.code) ? (
                          <span> — {pipelineErrorLabel(scriptTestResult.code)}</span>
                        ) : null}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs">{scriptTestResult.message}</p>
                    {providers?.ai?.scriptDiagnostics &&
                    providers.ai.scriptDiagnostics.canonicalUsable === 'YES' ? (
                      <p className="mt-2 text-xs">
                        Preflight READY, ale script service FAIL — config mismatch (API:{' '}
                        {providers.ai.scriptDiagnostics.apiRuntime}, worker:{' '}
                        {providers.ai.scriptDiagnostics.workerRuntime}, script service:{' '}
                        {providers.ai.scriptDiagnostics.scriptService ?? '—'}).
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            {productionTest ? (
              <div className="mt-4 rounded-lg border border-zinc-100 bg-zinc-50 p-4">
                <p className="text-sm font-semibold text-zinc-900">
                  {productionTest.progress.outcome === 'PASS'
                    ? 'TEST VIDEO: PASS'
                    : productionTest.progress.outcome === 'FAIL'
                      ? 'TEST VIDEO: FAIL'
                      : 'TEST PROBÍHÁ'}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Typ: {productionTest.testKind === 'VIDEO_AGENT' ? 'Video Agent (fixní scénář)' : 'Kompletní pipeline'}
                </p>
                {productionTest.progress.outcome === 'RUNNING' || productionTest.progress.outcome === 'QUALITY_REVIEW' ? (
                  <>
                    <p className="mt-1 text-sm text-zinc-700">
                      {productionTest.progress.progressPercent} % {productionTest.progress.progressLabel}
                    </p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200">
                      <div
                        className="h-full rounded-full bg-orange-500 transition-all"
                        style={{ width: `${productionTest.progress.progressPercent}%` }}
                      />
                    </div>
                  </>
                ) : null}
                {productionTest.progress.outcome === 'FAIL' ? (
                  <div className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                    <p>
                      Fáze: <strong>{stageLabel(productionTest.failedStage ?? productionTest.progress.stage)}</strong>
                    </p>
                    {productionTest.errorCode ? (
                      <p className="mt-1">
                        Error code: <code>{productionTest.errorCode}</code>
                        {pipelineErrorLabel(productionTest.errorCode) ? (
                          <span> — {pipelineErrorLabel(productionTest.errorCode)}</span>
                        ) : null}
                      </p>
                    ) : null}
                    {productionTest.errorMessage ? (
                      <p className="mt-1">{productionTest.errorMessage}</p>
                    ) : null}
                  </div>
                ) : null}
                {productionTest.masterVideoUrl ? (
                  <div className="mt-4">
                    <video
                      className="mx-auto aspect-[9/16] max-h-80 w-full max-w-xs rounded-lg bg-black object-cover"
                      src={productionTest.masterVideoUrl}
                      controls
                      preload="metadata"
                    >
                      <track kind="captions" />
                    </video>
                    <div className="mt-3 grid gap-1 text-xs text-zinc-600 sm:grid-cols-2">
                      <p>Délka: {productionTest.gallery.durationFormatted ?? '—'}</p>
                      <p>Rozlišení: {productionTest.resolution ?? '1080x1920'}</p>
                      <p>Storage: {productionTest.masterVideoUrl ? 'PASS' : 'FAIL'}</p>
                      <p>Galerie: {productionTest.masterVideoUrl ? 'PASS' : 'FAIL'}</p>
                      <p>Scény: {productionTest.gallery.sceneCount}</p>
                      <p>Background variation: {productionTest.gallery.backgroundVariationCount ?? '—'}</p>
                    </div>
                    {Object.entries(productionTest.qualityReport).map(([key, value]) => (
                      <p key={key} className="text-xs text-zinc-600">
                        {key}: {String(value)}
                      </p>
                    ))}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded border border-zinc-300 px-2 py-1 text-xs"
                        onClick={() => setPlayVideoUrl(productionTest.masterVideoUrl)}
                      >
                        Přehrát
                      </button>
                      <button
                        type="button"
                        className="rounded border border-zinc-300 px-2 py-1 text-xs"
                        onClick={() => {
                          setTab('videos');
                          setVideoFilter(productionTest.isTest ? 'test' : 'all');
                          setShowTestVideos(true);
                        }}
                      >
                        Otevřít v galerii
                      </button>
                      <button type="button" className="rounded border border-zinc-300 px-2 py-1 text-xs" onClick={() => setTestModalOpen(true)}>
                        Spustit test znovu
                      </button>
                      <button
                        type="button"
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-700"
                        onClick={() =>
                          void nestAiInfluencerDeleteProductionTest(apiAccessToken, productionTest.jobId).then(() =>
                            setProductionTest(null),
                          )
                        }
                      >
                        Odstranit test
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-zinc-900">Testy providerů</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="rounded border border-zinc-300 px-3 py-1.5 text-sm" onClick={() => void nestAiInfluencerTestVoice(apiAccessToken, undefined, selectedVoiceId)}>
                Otestovat hlas
              </button>
              <button type="button" className="rounded border border-zinc-300 px-3 py-1.5 text-sm" onClick={() => void nestAiInfluencerTestAvatar(apiAccessToken, undefined, selectedAvatarId)}>
                Otestovat avatar
              </button>
              <button type="button" className="rounded border border-zinc-300 px-3 py-1.5 text-sm" onClick={() => void nestAiInfluencerTestFacebook(apiAccessToken)}>
                Test Facebook
              </button>
              <button type="button" className="rounded border border-zinc-300 px-3 py-1.5 text-sm" onClick={() => void nestAiInfluencerTestInstagram(apiAccessToken)}>
                Test Instagram
              </button>
              <button type="button" className="rounded border border-zinc-300 px-3 py-1.5 text-sm" onClick={() => void nestAiInfluencerTestYoutube(apiAccessToken)}>
                Test YouTube
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-zinc-500">Voice ID</label>
                <input
                  value={selectedVoiceId}
                  onChange={(e) => setSelectedVoiceId(e.target.value)}
                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-sm"
                />
                <button type="button" className="mt-2 rounded border border-zinc-300 px-2 py-1 text-xs" onClick={() => void nestAiInfluencerUpdateProfile(apiAccessToken, { voiceId: selectedVoiceId }).then(loadCore)}>
                  Uložit hlas
                </button>
              </div>
              <div>
                <label className="text-xs text-zinc-500">Avatar ID</label>
                <input
                  value={selectedAvatarId}
                  onChange={(e) => setSelectedAvatarId(e.target.value)}
                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-sm"
                />
                <button type="button" className="mt-2 rounded border border-zinc-300 px-2 py-1 text-xs" onClick={() => void nestAiInfluencerUpdateProfile(apiAccessToken, { avatarId: selectedAvatarId }).then(loadCore)}>
                  Uložit avatar
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <button type="button" className="text-sm font-semibold text-zinc-900" onClick={() => setShowDiagnostics((v) => !v)}>
              Technická diagnostika {showDiagnostics ? '▾' : '▸'}
            </button>
            {showDiagnostics ? (
              <div className="mt-3 space-y-1 font-mono text-xs text-zinc-600">
                <p>jobsToday: {dashboard?.debugCounts?.jobsToday ?? '—'}</p>
                <p>activeJobs: {dashboard?.debugCounts?.activeJobs ?? '—'}</p>
                <div className="py-2">
                  <button
                    type="button"
                    disabled={repairBusy}
                    className="rounded bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                    onClick={handleRepairJobs}
                  >
                    {repairBusy ? 'Opravuji…' : 'Opravit zaseknuté joby'}
                  </button>
                  {repairResult ? (
                    <p className="mt-2 text-xs text-zinc-700">
                      Nalezeno: {repairResult.scanned} · Obnoveno: {repairResult.recovered} · Zrušeno:{' '}
                      {repairResult.cancelled} · Dokončeno: {repairResult.completed} · Orphan:{' '}
                      {repairResult.orphaned} · Duplicity: {repairResult.duplicates}
                    </p>
                  ) : null}
                </div>
                <p>queuedJobsToday: {dashboard?.debugCounts?.queuedJobsToday ?? '—'}</p>
                <p>skippedJobsToday: {dashboard?.debugCounts?.skippedJobsToday ?? '—'}</p>
                <p>jobsUnaccountedToday: {dashboard?.debugCounts?.jobsUnaccountedToday ?? '—'}</p>
                <p>completedVideosToday: {dashboard?.debugCounts?.completedVideosToday ?? '—'}</p>
                <p>publishedJobsToday: {dashboard?.debugCounts?.publishedJobsToday ?? '—'}</p>
                <p>failedJobsToday: {dashboard?.debugCounts?.failedJobsToday ?? '—'}</p>
                <p>galleryVideos: {dashboard?.debugCounts?.galleryVideos ?? videos.length}</p>
                {dashboard?.todayJobs?.length ? (
                  <>
                    <p className="pt-2 font-semibold text-zinc-800">TODAY JOBS</p>
                    {dashboard.todayJobs.map((job) => (
                      <p key={job.jobId}>
                        {job.jobId.slice(0, 8)} · {job.status} · {job.visibility} · {job.progress}%
                        {job.skipReason ? ` · ${job.skipReason}` : ''}
                      </p>
                    ))}
                  </>
                ) : null}
                <p>AI provider: {providers?.ai?.provider ?? '—'}</p>
                <p>Configured: {providers?.ai?.configured ? 'YES' : 'NO'}</p>
                <p>Enabled: {providers?.ai?.enabled ? 'YES' : 'NO'} (db={providers?.ai?.dbEnabled ? 'YES' : 'NO'}, env={providers?.ai?.envEnabled ? 'YES' : 'NO'})</p>
                <p>Usable: {providers?.ai?.usable ? 'YES' : 'NO'}</p>
                <p>Config source: {providers?.ai?.configSource ?? providers?.ai?.source ?? '—'}</p>
                <p>Worker sees same config: {providers?.ai?.workerSeesSameConfig ? 'YES' : 'NO'}</p>
                <p>Script label: {providers?.ai?.scriptProvider ?? '—'}</p>
                <p>Reason: {providers?.ai?.message ?? '—'}</p>
                {providers?.ai?.scriptDiagnostics ? (
                  <>
                    <p className="pt-2 font-semibold text-zinc-800">SCRIPT PROVIDER</p>
                    <p>Provider: {providers.ai.scriptDiagnostics.provider}</p>
                    <p>API process: {providers.ai.scriptDiagnostics.apiRuntime}</p>
                    <p>Worker process: {providers.ai.scriptDiagnostics.workerRuntime}</p>
                    <p>Script service: {providers.ai.scriptDiagnostics.scriptService ?? '—'}</p>
                    <p>Enabled: {providers.ai.scriptDiagnostics.canonicalEnabled}</p>
                    <p>Model: {providers.ai.scriptDiagnostics.model ?? providers?.ai?.model ?? '—'}</p>
                    <p>API key: {providers.ai.scriptDiagnostics.apiKey}</p>
                    <p>Client ready: {providers.ai.scriptDiagnostics.clientReady ?? '—'}</p>
                    <p>DB enabled: {providers.ai.scriptDiagnostics.dbEnabled}</p>
                    <p>Env enabled: {providers.ai.scriptDiagnostics.envEnabled}</p>
                    <p>Canonical configured: {providers.ai.scriptDiagnostics.canonicalConfigured}</p>
                    <p>Canonical usable: {providers.ai.scriptDiagnostics.canonicalUsable}</p>
                    <p>Config source: {providers.ai.scriptDiagnostics.configSource}</p>
                    <p>Last resolved: {providers.ai.scriptDiagnostics.lastResolved ?? '—'}</p>
                  </>
                ) : null}
                {providers?.elevenLabs?.runtime ? (
                  <>
                    <p className="pt-2 font-semibold text-zinc-800">ELEVENLABS RUNTIME</p>
                    <p>API process: {providers.elevenLabs.runtime.apiProcess}</p>
                    <p>Worker process: {providers.elevenLabs.runtime.workerProcess}</p>
                    <p>Voice service: {providers.elevenLabs.runtime.voiceService}</p>
                    <p>Voice ID: {providers.elevenLabs.runtime.voiceId}</p>
                    <p>Voices read: {providers.elevenLabs.runtime.voicesRead}</p>
                    <p>Required for production: {providers.elevenLabs.requiredForProduction ? 'YES' : 'NO'}</p>
                  </>
                ) : null}
                {providers?.workerRuntime?.providerDiagnostics ? (
                  <>
                    <p className="pt-2 font-semibold text-zinc-800">PROVIDER RUNTIME</p>
                    <p>OpenAI: {providers.workerRuntime.providerDiagnostics.openAi.status}</p>
                    <p>ElevenLabs: {providers.workerRuntime.providerDiagnostics.elevenLabs.status}</p>
                    <p>HeyGen API: {providers.workerRuntime.providerDiagnostics.heyGenApi.status}</p>
                    <p>
                      HeyGen Video Agent: {providers.workerRuntime.providerDiagnostics.heyGenVideoAgent.status}
                    </p>
                    <p>Renderer: {providers.workerRuntime.providerDiagnostics.renderer.status}</p>
                    <p>Storage: {providers.workerRuntime.providerDiagnostics.storage.status}</p>
                    <p>
                      API HEYGEN_API_KEY: {providers.workerRuntime.providerDiagnostics.apiWorker.heygenApiKey}
                    </p>
                    <p>
                      Worker HEYGEN_API_KEY:{' '}
                      {providers.workerRuntime.providerDiagnostics.heyGenVideoAgent.workerApiKey}
                    </p>
                    <p>
                      API ELEVENLABS_API_KEY:{' '}
                      {providers.workerRuntime.providerDiagnostics.apiWorker.elevenLabsApiKey}
                    </p>
                    <p>
                      Worker ELEVENLABS_API_KEY: {providers.workerRuntime.providerDiagnostics.elevenLabs.apiKey}
                    </p>
                  </>
                ) : null}
                <p>HeyGen Video Agent: {providers?.workerRuntime?.heygenVideoAgent ?? '—'}</p>
                <p>ElevenLabs: {providers?.workerRuntime?.elevenLabsStatus ?? '—'}</p>
                <p>WORKER HEYGEN_API_KEY: {providers?.workerRuntime?.heygenApiKey ?? '—'}</p>
                <p>WORKER ELEVENLABS_API_KEY: {providers?.workerRuntime?.elevenLabsApiKey ?? '—'}</p>
                <p>Generation mode: {providers?.workerRuntime?.generationMode ?? productionMode}</p>
                <p>YouTube redirect: {providers?.youtube?.redirectUri ?? '—'}</p>
                <button
                  type="button"
                  className="text-orange-700 underline"
                  onClick={() => {
                    void nestYoutubeOAuthConnectUrl(apiAccessToken).then((result) => {
                      if (result.url) window.location.href = result.url;
                    });
                  }}
                >
                  Připojit YouTube
                </button>
                {' · '}
                <button type="button" className="text-orange-700 underline" onClick={() => void nestAiInfluencerYoutubeDisconnect(apiAccessToken).then(loadCore)}>
                  Odpojit YouTube
                </button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {publishJob ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-zinc-900">Publikovat video</h3>
              <button
                type="button"
                onClick={() => {
                  setPublishJob(null);
                  setPublishResult(null);
                }}
                aria-label="Zavřít"
              >
                <X className="size-5 text-zinc-500" />
              </button>
            </div>
            <p className="mt-2 text-sm font-medium text-zinc-900">{resolveAiInfluencerJobTitle(publishJob)}</p>
            {publishJob.isTest ? (
              <p className="mt-1 text-xs text-violet-700">
                Testovací video — publikace proběhne ručně. Historie zůstane označena jako TEST.
              </p>
            ) : null}
            <div className="mt-4 space-y-2">
              {(
                [
                  ['facebook', 'Facebook'],
                  ['instagram', 'Instagram'],
                  ['youtube', 'YouTube'],
                  ['portal', 'XXREALIT Shorts'],
                ] as Array<[ManualPublishChannel, string]>
              ).map(([channel, label]) => {
                const readiness = channelPublishReady(channel, providers);
                return (
                  <label
                    key={channel}
                    className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-sm ${
                      readiness.ready ? 'border-zinc-200' : 'border-zinc-100 bg-zinc-50 opacity-80'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={publishChannels[channel]}
                      disabled={!readiness.ready || publishBusy}
                      onChange={(e) =>
                        setPublishChannels((prev) => ({ ...prev, [channel]: e.target.checked }))
                      }
                      className="mt-1"
                    />
                    <span>
                      <span className="font-medium text-zinc-900">{label}</span>
                      <span className="mt-0.5 block text-xs text-zinc-600">{readiness.reason}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {publishResult ? (
              <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700">
                {(['facebook', 'instagram', 'youtube', 'portal'] as ManualPublishChannel[]).map((channel) => {
                  const row = publishResult.channels[channel];
                  if (!row) return null;
                  return (
                    <p key={channel}>
                      {channel}: {row.ok ? '✓ publikováno' : `✕ ${row.error ?? 'selhalo'}`}
                    </p>
                  );
                })}
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={publishBusy}
                className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => void handleManualPublish()}
              >
                {publishBusy ? 'Publikuji…' : 'Spustit publikaci'}
              </button>
              <button
                type="button"
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm"
                onClick={() => {
                  setPublishJob(null);
                  setPublishResult(null);
                }}
              >
                Zavřít
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-zinc-900">Vytvořit AI Reel</h3>
              <button type="button" onClick={() => setCreateOpen(false)} aria-label="Zavřít">
                <X className="size-5 text-zinc-500" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-zinc-500">Obsah (článek)</label>
                <select
                  value={createArticleId}
                  onChange={(e) => setCreateArticleId(e.target.value)}
                  className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                >
                  <option value="">— vyberte článek —</option>
                  {articles.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title} {a.reelScore != null ? `(${a.reelScore})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-sm text-zinc-600">
                Režim: <strong>{modeLabel(productionMode)}</strong> · Délka: 35–50 s · Cíl: návštěvnost XXREALIT.CZ
              </p>
              {createError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{createError}</p>
              ) : null}
              <button
                type="button"
                disabled={!createArticleId || createState === 'submitting' || createState === 'accepted'}
                className="w-full rounded-lg bg-orange-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => void handleCreateJob(createArticleId)}
              >
                {createState === 'submitting'
                  ? 'Zakládám job…'
                  : createState === 'accepted'
                    ? 'Vytvořeno ✓'
                    : createState === 'error'
                      ? 'Zkusit znovu'
                      : 'Vytvořit video'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {detailJobId && detailJob ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-zinc-900">Detail jobu</h3>
              <button type="button" onClick={() => { setDetailJobId(null); setDetailJob(null); }} aria-label="Zavřít">
                <X className="size-5 text-zinc-500" />
              </button>
            </div>
            <p className="mt-2 font-medium">{resolveAiInfluencerJobTitle(detailJob)}</p>
            {resolveAiInfluencerJobSubtitle(detailJob) ? (
              <p className="text-xs text-amber-700">{resolveAiInfluencerJobSubtitle(detailJob)}</p>
            ) : null}
            <div className="mt-3 grid gap-2 text-sm text-zinc-700 sm:grid-cols-2">
              <p>Stav: {detailJob.status}</p>
              <p>Test / Produkční: {detailJob.isTest ? 'TEST' : 'PRODUKČNÍ'}</p>
              <p>Režim: {modeLabel(detailJob.generationMode ?? detailJob.display?.generationMode)}</p>
              <p>XXREALIT Job ID: {detailJob.id}</p>
              <p>HeyGen Job ID: {detailJob.providerJobIdMasked ?? '—'}</p>
              <p>Galerie video: {detailJob.gallery?.masterVideoUrl ? 'ANO' : 'NE'}</p>
              <p>Vytvořeno: {detailJob.gallery?.createdCombinedLabel ?? detailJob.createdAt}</p>
              <p>Dokončeno: {detailJob.gallery?.completedCombinedLabel ?? detailJob.gallery?.finishedAt ?? detailJob.renderedAt ?? '—'}</p>
              <p>Publikováno: {detailJob.publishedAt ?? '—'}</p>
              <p>Délka: {detailJob.gallery?.durationFormatted ?? detailJob.estimatedDurationSec ?? '—'}</p>
              <p>Scény: {detailJob.gallery?.sceneCount ?? '—'}</p>
              <p>Pozadí: {detailJob.gallery?.backgroundVariationCount ?? '—'}</p>
              <p>Progress: {detailJob.progressPercent ?? 0} %</p>
              <p>Krok: {detailJob.currentStep ?? '—'}</p>
              <p>Náklady: {detailJob.totalExternalCost.toFixed(2)} Kč</p>
            </div>
            {resolveMasterUrl(detailJob) ? (
              <video
                className="mt-4 aspect-[9/16] max-h-96 w-full rounded-lg bg-black object-cover"
                src={resolveMasterUrl(detailJob) ?? undefined}
                controls
                preload="metadata"
              >
                <track kind="captions" />
              </video>
            ) : null}
            <PipelineBar steps={detailJob.display?.pipelineSteps} />
            {detailJob.status === 'FAILED' ? (
              <div className="mt-3 rounded border border-red-100 bg-red-50 p-3 text-sm text-red-800">
                {jobErrorMessage(detailJob)}
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {detailJob.status === 'SCRIPT_READY' ? (
                <button type="button" className="rounded bg-orange-600 px-3 py-1 text-xs text-white" onClick={() => void nestAiInfluencerApproveScript(apiAccessToken, detailJob.id).then(loadCore)}>
                  Schválit scénář
                </button>
              ) : null}
              {detailJob.status === 'FAILED' ? (
                <button type="button" className="rounded bg-orange-600 px-3 py-1 text-xs text-white" onClick={() => handleRetry(detailJob)}>
                  {jobRetryLabel(detailJob)}
                </button>
              ) : null}
              {(detailJob.finalMasterUrl ?? detailJob.videoUrl) &&
              ['READY', 'PARTIALLY_PUBLISHED'].includes(detailJob.status) ? (
                <>
                  <button
                    type="button"
                    className="rounded bg-orange-600 px-3 py-1 text-xs font-medium text-white"
                    onClick={() => openPublishModal(detailJob)}
                  >
                    Publikovat
                  </button>
                  <button type="button" className="rounded border px-3 py-1 text-xs" onClick={() => void nestAiInfluencerRegenerateJob(apiAccessToken, detailJob.id).then(loadCore)}>Přegenerovat</button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {testModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-zinc-900">Test kompletní výroby</h3>
              <button type="button" onClick={() => setTestModalOpen(false)} aria-label="Zavřít">
                <X className="size-5 text-zinc-500" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-zinc-500">Zdroj</label>
                <select
                  value={testArticleId}
                  onChange={(e) => setTestArticleId(e.target.value)}
                  className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                >
                  <option value="">Automatický test (nejnovější článek)</option>
                  {articles.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-sm text-zinc-600">
                AI scénář → storyboard → média → Video Agent → storage · 10–15 s · bez publikace
              </p>
              {!aiScriptCanonicalReady(providers?.ai) ? (
                <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  <p className="font-medium">Kompletní výrobu nelze spustit.</p>
                  <p className="mt-1">AI generování scénáře není připraveno: {providers?.ai?.message}</p>
                  <a href="/admin/marketing/ai-centrum" className="mt-2 inline-block text-xs font-semibold text-orange-700 underline">
                    Otevřít nastavení AI
                  </a>
                </div>
              ) : null}
              <button
                type="button"
                disabled={productionTestBusy || !productionPreflightReady(providers)}
                className="w-full rounded-lg bg-orange-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => {
                  setProductionTestBusy(true);
                  void nestAiInfluencerStartProductionTest(apiAccessToken, {
                    mode: 'full',
                    articleId: testArticleId || undefined,
                  }).then((result) => {
                    setProductionTestBusy(false);
                    if (result.error || !result.data) {
                      setToast(result.error ?? 'Test selhal.');
                      return;
                    }
                    setTestModalOpen(false);
                    setToast('Výroba testovacího videa byla spuštěna.');
                    setProductionTest({
                      jobId: result.data.jobId,
                      status: result.data.status,
                      progress: {
                        progressPercent: result.data.progressPercent,
                        progressLabel: result.data.progressLabel,
                        stage: 'QUEUED',
                        outcome: 'RUNNING',
                      },
                      masterVideoUrl: null,
                      gallery: {
                        masterVideoUrl: null,
                        videoCreatedAt: null,
                        masterCreatedAt: null,
                        finishedAt: null,
                        sceneCount: 0,
                        backgroundVariationCount: null,
                        galleryStatus: 'READY',
                        durationFormatted: null,
                        createdDateLabel: null,
                        createdTimeLabel: null,
                        createdCombinedLabel: null,
                      },
                      qualityReport: {},
                      resolution: null,
                      isTest: true,
                      testKind: 'FULL',
                      createdAt: new Date().toISOString(),
                      failedStage: null,
                      errorCode: null,
                      errorMessage: null,
                    });
                  });
                }}
              >
                {productionTestBusy ? 'Spouštím…' : 'Spustit test kompletní výroby'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {cancelModalJob ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-zinc-900">Zrušit výrobu videa?</h3>
            <p className="mt-3 text-sm text-zinc-700">
              {cancelModalJob.providerJobId
                ? 'HeyGen již video zpracovává. Zrušení na portálu nemusí vrátit spotřebovaný kredit.'
                : 'Tato výroba bude okamžitě zastavena.'}
            </p>
            <p className="mt-2 text-sm font-medium text-zinc-900">{cancelModalJob.articleTitle}</p>
            <p className="mt-1 font-mono text-xs text-zinc-500">XXREALIT Job ID: {cancelModalJob.id}</p>
            {cancelError ? (
              <p className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{cancelError}</p>
            ) : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm"
                onClick={() => {
                  setCancelModalJob(null);
                  setCancelError(null);
                }}
              >
                Nechat běžet
              </button>
              {cancelError ? (
                <button
                  type="button"
                  disabled={busy === `cancel-${cancelModalJob.id}`}
                  className="rounded-lg border border-red-400 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 disabled:opacity-60"
                  onClick={() => confirmCancel(true)}
                >
                  Vynutit ukončení
                </button>
              ) : null}
              <button
                type="button"
                disabled={busy === `cancel-${cancelModalJob.id}`}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                onClick={() => confirmCancel(false)}
              >
                Zrušit výrobu
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {playVideoUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl bg-black p-2 shadow-xl">
            <div className="mb-2 flex justify-end">
              <button type="button" onClick={() => setPlayVideoUrl(null)} aria-label="Zavřít">
                <X className="size-5 text-white" />
              </button>
            </div>
            <video className="max-h-[80vh] w-full rounded-lg" src={playVideoUrl} controls autoPlay>
              <track kind="captions" />
            </video>
          </div>
        </div>
      ) : null}
    </div>
  );
}
