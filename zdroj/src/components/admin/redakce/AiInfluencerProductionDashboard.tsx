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
  nestAiInfluencerCreateJob,
  nestAiInfluencerDashboard,
  nestAiInfluencerDeleteFailedJobs,
  nestAiInfluencerDeleteJob,
  nestAiInfluencerJobs,
  nestAiInfluencerProfile,
  nestAiInfluencerPublishFacebook,
  nestAiInfluencerPublishInstagram,
  nestAiInfluencerPublishYoutube,
  nestAiInfluencerDeleteProductionTest,
  nestAiInfluencerProductionTestActive,
  nestAiInfluencerProductionTestStatus,
  nestAiInfluencerStartProductionTest,
  nestAiInfluencerRegenerateJob,
  nestAiInfluencerResumeAutomation,
  nestAiInfluencerRetryJob,
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
  type ProductionTestStatus,
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

function isProcessing(status: string) {
  return ![
    'READY',
    'PUBLISHED',
    'PARTIALLY_PUBLISHED',
    'FAILED',
    'CANCELLED',
    'SKIPPED_QUALITY',
    'SKIPPED_DUPLICATE',
  ].includes(status);
}

function modeLabel(mode?: string) {
  return mode === 'AVATAR' ? 'Avatar fallback' : 'Video Agent';
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
    POSTPROCESS: 'Post-processing',
    STORAGE: 'Storage',
    PUBLISH: 'Publikace',
    BRANDING_RENDER: 'Branding',
  };
  return map[stage] ?? stage;
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
  const [videoFilter, setVideoFilter] = useState<'all' | 'published' | 'ready' | 'failed' | 'video_agent' | 'avatar'>('all');
  const [selectedVoiceId, setSelectedVoiceId] = useState('');
  const [selectedAvatarId, setSelectedAvatarId] = useState('');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createState, setCreateState] = useState<'idle' | 'submitting' | 'accepted' | 'error'>('idle');
  const [toast, setToast] = useState<string | null>(null);
  const [playVideoUrl, setPlayVideoUrl] = useState<string | null>(null);
  const [showTestVideos, setShowTestVideos] = useState(false);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testArticleId, setTestArticleId] = useState('');
  const [productionTest, setProductionTest] = useState<ProductionTestStatus | null>(null);
  const [productionTestBusy, setProductionTestBusy] = useState(false);
  const prevActiveCountRef = useRef(0);

  const loadCore = useCallback(() => {
    if (!apiAccessToken) return;
    void Promise.all([
      nestAiInfluencerDashboard(apiAccessToken),
      nestAiInfluencerArticles(apiAccessToken),
      nestAiInfluencerJobs(apiAccessToken),
      nestAiInfluencerActiveJobs(apiAccessToken),
      nestAiInfluencerVideos(apiAccessToken, 60, showTestVideos),
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
  }, [apiAccessToken, showTestVideos]);

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
    const poll = () => {
      void nestAiInfluencerProductionTestStatus(apiAccessToken, productionTest.jobId).then((res) => {
        if (res?.job) setProductionTest(res.job);
      });
    };
    poll();
    const id = window.setInterval(poll, 2000);
    return () => window.clearInterval(id);
  }, [apiAccessToken, tab, productionTest?.jobId, productionTest?.progress.outcome]);

  useEffect(loadCore, [loadCore]);

  useEffect(() => {
    if (!apiAccessToken) return;
    if (tab !== 'production' && activeJobs.length === 0) return;

    const poll = () => {
      void Promise.all([
        nestAiInfluencerActiveJobs(apiAccessToken),
        nestAiInfluencerVideos(apiAccessToken, 60, showTestVideos),
        nestAiInfluencerDashboard(apiAccessToken),
        nestAiInfluencerJobs(apiAccessToken),
      ]).then(([active, v, d, j]) => {
        if (active) {
          if (prevActiveCountRef.current > 0 && active.length < prevActiveCountRef.current) {
            setToast('Video bylo vytvořeno.');
          }
          prevActiveCountRef.current = active.length;
          setActiveJobs(active);
        }
        if (v) setVideos(v);
        if (d) setDashboard(d);
        if (j) setJobs(j);
      });
    };

    poll();
    const id = window.setInterval(poll, 2500);
    return () => window.clearInterval(id);
  }, [apiAccessToken, tab, activeJobs.length]);

  useEffect(() => {
    prevActiveCountRef.current = activeJobs.length;
  }, [activeJobs.length]);

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

  const failedJobs = useMemo(
    () => jobs.filter((j) => j.status === 'FAILED'),
    [jobs],
  );

  const recentDone = useMemo(
    () =>
      jobs
        .filter((j) => ['READY', 'PUBLISHED', 'PARTIALLY_PUBLISHED'].includes(j.status))
        .slice(0, 5),
    [jobs],
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
      if (videoFilter === 'published') {
        return v.gallery?.galleryStatus === 'PUBLISHED' || v.gallery?.galleryStatus === 'PARTIAL';
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
  const providers = dashboard?.providers;

  const handleRetry = (jobId: string) => {
    setBusy(`retry-${jobId}`);
    void nestAiInfluencerRetryJob(apiAccessToken, jobId).then(() => {
      setBusy(null);
      loadCore();
      setTab('production');
    });
  };

  const handleDelete = (jobId: string, historyOnly = false) => {
    if (!window.confirm(historyOnly ? 'Odstranit pouze z historie?' : 'Odstranit tento neúspěšný pokus?')) return;
    setBusy(`delete-${jobId}`);
    void nestAiInfluencerDeleteJob(apiAccessToken, jobId, historyOnly).then(() => {
      setBusy(null);
      loadCore();
    });
  };

  const handleCancel = (jobId: string) => {
    if (!window.confirm('Zrušit běžící job?')) return;
    setBusy(`cancel-${jobId}`);
    void nestAiInfluencerCancelJob(apiAccessToken, jobId).then(() => {
      setBusy(null);
      loadCore();
    });
  };

  const handleCreateJob = async (articleId: string, force = false) => {
    setCreateError(null);
    setCreateState('submitting');
    const result = await nestAiInfluencerCreateJob(apiAccessToken, articleId, force);
    if (result.error || !result.data) {
      setCreateState('error');
      setCreateError(result.error ?? 'Vytvoření jobu selhalo.');
      return;
    }
    const created = result.data;
    const optimistic: AiInfluencerActiveJob = {
      id: created.jobId,
      status: created.status,
      progressPercent: created.progress,
      currentStep: 'Job vytvořen',
      errorMessage: null,
      failedStage: null,
      skipReason: null,
      facebookPublishStatus: null,
      youtubePublishStatus: null,
      articleTitle: created.articleTitle,
      score: null,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      generationMode: created.generationMode,
      sourceType: 'article',
    };
    setActiveJobs((prev) => [optimistic, ...prev.filter((j) => j.id !== optimistic.id)]);
    prevActiveCountRef.current += 1;
    setCreateState('accepted');
    window.setTimeout(() => {
      setCreateOpen(false);
      setCreateState('idle');
      setCreateError(null);
      setTab('production');
      loadCore();
    }, 700);
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
          onClick={() => {
            setCreateError(null);
            setCreateState('idle');
            setCreateOpen(true);
          }}
          className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
        >
          Vytvořit AI Reel
        </button>
      </div>

      {tab === 'overview' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {[
              ['Dnes spuštěno', dashboard?.stats.jobsStartedToday ?? dashboard?.stats.reelsToday ?? 0],
              ['Dnes dokončeno', dashboard?.stats.jobsCompletedToday ?? 0],
              ['Ve výrobě', dashboard?.stats.inQueue ?? activeJobs.length],
              ['Publikováno', dashboard?.stats.published ?? 0],
              ['Selhalo dnes', dashboard?.stats.failed ?? failedJobs.length],
              ['Náklady dnes', `${(dashboard?.stats.costTodayCzk ?? 0).toFixed(2)} Kč`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-zinc-200 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
                <p className="mt-1 text-2xl font-bold text-zinc-900">{value}</p>
              </div>
            ))}
          </div>

          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-zinc-600">
                  Aktivní režim: <strong>{modeLabel(productionMode)}</strong>
                </p>
                <p className="text-sm text-zinc-600">
                  Status výroby:{' '}
                  <strong className={productionReady ? 'text-emerald-700' : 'text-amber-700'}>
                    {productionReady ? 'READY' : 'DEGRADED'}
                  </strong>
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
              <HealthChip label="AI" ok={providers?.ai?.connected === true} detail="OpenAI pro scénáře a storyboard." />
              <HealthChip
                label="Video Agent"
                ok={providers?.videoEngine?.heygenVideoAgent === 'READY'}
                detail={providers?.videoEngine?.heygenVideoAgentMessage ?? undefined}
              />
              <HealthChip
                label="Voice"
                ok={
                  productionMode === 'VIDEO_AGENT' ||
                  providers?.elevenLabs?.ttsReady === true ||
                  providers?.elevenLabs?.status === 'CONNECTED'
                }
                detail={
                  productionMode === 'VIDEO_AGENT'
                    ? 'ElevenLabs není vyžadován pro Video Agent režim.'
                    : providers?.elevenLabs?.detailMessage ?? 'ElevenLabs TTS pro avatar pipeline.'
                }
              />
              <HealthChip label="Avatar" ok={providers?.heygen?.generationReady === true} detail={providers?.heygen?.detailMessage ?? undefined} />
              <HealthChip label="Storage" ok={providers?.storage?.configured === true} detail={providers?.storage?.message ?? undefined} />
              <HealthChip label="FB" ok={providers?.facebook?.connected === true} />
              <HealthChip
                label="IG"
                ok={providers?.instagram?.publishReady === true}
                warn={providers?.instagram?.connected === true && !providers?.instagram?.publishReady}
                detail={
                  providers?.instagram?.missingScopes?.length
                    ? `Chybí oprávnění: ${providers.instagram.missingScopes.join(', ')}`
                    : providers?.instagram?.message ?? undefined
                }
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
              <HealthChip label="YT" ok={providers?.youtube?.connected === true} />
              <HealthChip label="Shorts" ok={providers?.shorts?.connected === true} />
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
                        <p className="font-medium text-zinc-900">{job.articleTitle}</p>
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
                        <p className="font-medium text-zinc-900">{job.articleTitle}</p>
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
                        onClick={() => handleCancel(job.id)}
                      >
                        Zrušit job
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

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

          {recentDone.length > 0 ? (
            <section className="rounded-xl border border-zinc-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-zinc-900">Nedávno dokončeno</h2>
              <div className="mt-3 space-y-2">
                {recentDone.map((job) => (
                  <div key={job.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-100 px-3 py-2 text-sm">
                    <span>{resolveAiInfluencerJobTitle(job)}</span>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">{job.status}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {tab === 'videos' ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            {(['all', 'published', 'ready', 'failed', 'video_agent', 'avatar'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setVideoFilter(f)}
                className={`rounded-full px-3 py-1 text-xs ${videoFilter === f ? 'bg-orange-100 text-orange-800' : 'bg-zinc-100 text-zinc-600'}`}
              >
                {f === 'all'
                  ? 'Všechna'
                  : f === 'published'
                    ? 'Publikovaná'
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
                    <p className="line-clamp-2 text-sm font-medium text-zinc-900">{resolveAiInfluencerJobTitle(job)}</p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-zinc-600">
                      <span>Vytvořeno:</span>
                      <span>{gallery?.createdCombinedLabel ?? '—'}</span>
                      <span>Datum:</span>
                      <span>{gallery?.createdDateLabel ?? '—'}</span>
                      <span>Čas:</span>
                      <span>{gallery?.createdTimeLabel ?? '—'}</span>
                      <span>Délka:</span>
                      <span>{gallery?.durationFormatted ?? (job.estimatedDurationSec ? `${job.estimatedDurationSec}s` : '—')}</span>
                      <span>Režim:</span>
                      <span>{modeLabel(job.generationMode ?? job.display?.generationMode)}</span>
                      <span>Scény:</span>
                      <span>{gallery?.sceneCount ?? '—'}</span>
                      <span>Status:</span>
                      <span>{galleryStatusLabel(gallery?.galleryStatus)}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[10px] text-zinc-500">
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
                        onClick={() => handleDelete(job.id, false)}
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
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy === `retry-${job.id}`}
                      className="rounded bg-orange-600 px-3 py-1 text-xs font-medium text-white"
                      onClick={() => handleRetry(job.id)}
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
        </section>
      ) : null}

      {tab === 'settings' ? (
        <div className="space-y-4">
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
            <p className="mt-1 text-xs text-zinc-500">Spustí skutečný test job (10–15 s) bez publikace.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded bg-orange-600 px-3 py-1.5 text-sm font-medium text-white"
                onClick={() => setTestModalOpen(true)}
              >
                Test výroby videa
              </button>
              <button
                type="button"
                className="rounded border border-zinc-300 px-3 py-1.5 text-sm"
                onClick={() => void nestAiInfluencerTestVideoAgent(apiAccessToken)}
              >
                Rychlý HeyGen test
              </button>
            </div>

            {productionTest ? (
              <div className="mt-4 rounded-lg border border-zinc-100 bg-zinc-50 p-4">
                <p className="text-sm font-semibold text-zinc-900">
                  {productionTest.progress.outcome === 'PASS'
                    ? 'TEST VIDEO: PASS'
                    : productionTest.progress.outcome === 'FAIL'
                      ? 'TEST VIDEO: FAIL'
                      : 'TESTUJI VÝROBU VIDEA'}
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
                      <p>Scény: {productionTest.gallery.sceneCount}</p>
                      <p>Background variation: {productionTest.gallery.backgroundVariationCount ?? '—'}</p>
                    </div>
                    {Object.entries(productionTest.qualityReport).map(([key, value]) => (
                      <p key={key} className="text-xs text-zinc-600">
                        {key}: {value}
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
                        onClick={() => setDetailJobId(productionTest.jobId)}
                      >
                        Otevřít detail
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
                <p>completedVideosToday: {dashboard?.debugCounts?.completedVideosToday ?? '—'}</p>
                <p>publishedJobsToday: {dashboard?.debugCounts?.publishedJobsToday ?? '—'}</p>
                <p>failedJobsToday: {dashboard?.debugCounts?.failedJobsToday ?? '—'}</p>
                <p>galleryVideos: {dashboard?.debugCounts?.galleryVideos ?? videos.length}</p>
                <p>AI provider: {providers?.workerRuntime?.aiProvider ?? '—'}</p>
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
              <p>Režim: {modeLabel(detailJob.generationMode ?? detailJob.display?.generationMode)}</p>
              <p>Job ID: {detailJob.id}</p>
              <p>Vytvořeno: {detailJob.gallery?.createdCombinedLabel ?? detailJob.createdAt}</p>
              <p>Dokončeno: {detailJob.gallery?.finishedAt ?? detailJob.renderedAt ?? '—'}</p>
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
                <button type="button" className="rounded bg-orange-600 px-3 py-1 text-xs text-white" onClick={() => handleRetry(detailJob.id)}>
                  {jobRetryLabel(detailJob)}
                </button>
              ) : null}
              {(detailJob.finalMasterUrl ?? detailJob.videoUrl) && detailJob.status === 'READY' ? (
                <>
                  <button type="button" className="rounded border px-3 py-1 text-xs" onClick={() => void nestAiInfluencerPublishFacebook(apiAccessToken, detailJob.id).then(loadCore)}>FB</button>
                  <button type="button" className="rounded border px-3 py-1 text-xs" onClick={() => void nestAiInfluencerPublishInstagram(apiAccessToken, detailJob.id).then(loadCore)}>IG</button>
                  <button type="button" className="rounded border px-3 py-1 text-xs" onClick={() => void nestAiInfluencerPublishYoutube(apiAccessToken, detailJob.id).then(loadCore)}>YT</button>
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
              <h3 className="text-lg font-semibold text-zinc-900">TEST AI VIDEO</h3>
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
              <p className="text-sm text-zinc-600">Délka: 10–15 s · Použije aktuální nastavení · Bez publikace</p>
              <button
                type="button"
                disabled={productionTestBusy}
                className="w-full rounded-lg bg-orange-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => {
                  setProductionTestBusy(true);
                  void nestAiInfluencerStartProductionTest(
                    apiAccessToken,
                    testArticleId || undefined,
                  ).then((result) => {
                    setProductionTestBusy(false);
                    if (result.error || !result.data) {
                      setToast(result.error ?? 'Test selhal.');
                      return;
                    }
                    setTestModalOpen(false);
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
                    });
                  });
                }}
              >
                {productionTestBusy ? 'Spouštím…' : 'Spustit test'}
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
