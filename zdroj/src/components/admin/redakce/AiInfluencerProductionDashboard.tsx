'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

  const loadCore = useCallback(() => {
    if (!apiAccessToken) return;
    void Promise.all([
      nestAiInfluencerDashboard(apiAccessToken),
      nestAiInfluencerArticles(apiAccessToken),
      nestAiInfluencerJobs(apiAccessToken),
      nestAiInfluencerActiveJobs(apiAccessToken),
      nestAiInfluencerVideos(apiAccessToken),
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
  }, [apiAccessToken]);

  useEffect(loadCore, [loadCore]);

  useEffect(() => {
    if (!apiAccessToken || activeJobs.length === 0) return;
    const id = window.setInterval(() => {
      void nestAiInfluencerActiveJobs(apiAccessToken).then((active) => {
        if (active) setActiveJobs(active);
      });
    }, 3000);
    return () => window.clearInterval(id);
  }, [apiAccessToken, activeJobs.length]);

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
      if (videoFilter === 'published') return v.status === 'PUBLISHED' || v.status === 'PARTIALLY_PUBLISHED';
      if (videoFilter === 'ready') return v.status === 'READY';
      if (videoFilter === 'video_agent') return (v.generationMode ?? v.display?.generationMode) !== 'AVATAR';
      if (videoFilter === 'avatar') return (v.generationMode ?? v.display?.generationMode) === 'AVATAR';
      return true;
    });
  }, [videos, videoFilter]);

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

  return (
    <div className="space-y-4">
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
          onClick={() => setCreateOpen(true)}
          className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
        >
          Vytvořit AI Reel
        </button>
      </div>

      {tab === 'overview' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ['Dnes vytvořeno', dashboard?.stats.reelsToday ?? 0],
              ['Ve výrobě', dashboard?.stats.inQueue ?? activeJobs.length],
              ['Publikováno', dashboard?.stats.published ?? 0],
              ['Selhalo', dashboard?.stats.failed ?? failedJobs.length],
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
              <p className="mt-3 text-sm text-zinc-500">Žádný aktivní job.</p>
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
                          className="rounded bg-orange-600 px-2 py-1 text-xs font-medium text-white"
                          onClick={() => {
                            void nestAiInfluencerCreateJob(apiAccessToken, a.id).then(loadCore);
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
            {(['all', 'published', 'ready', 'video_agent', 'avatar'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setVideoFilter(f)}
                className={`rounded-full px-3 py-1 text-xs ${videoFilter === f ? 'bg-orange-100 text-orange-800' : 'bg-zinc-100 text-zinc-600'}`}
              >
                {f === 'all' ? 'Všechna' : f === 'published' ? 'Publikovaná' : f === 'ready' ? 'Čekající' : f === 'video_agent' ? 'Video Agent' : 'Avatar fallback'}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredVideos.map((job) => {
              const master = job.finalMasterUrl ?? job.baseMasterUrl ?? job.videoUrl;
              return (
                <div key={job.id} className="overflow-hidden rounded-xl border border-zinc-200">
                  <div className="aspect-[9/16] max-h-64 bg-zinc-900">
                    {master ? (
                      <video className="h-full w-full object-cover" src={master} controls preload="metadata">
                        <track kind="captions" />
                      </video>
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-zinc-400">Bez náhledu</div>
                    )}
                  </div>
                  <div className="space-y-2 p-3">
                    <p className="line-clamp-2 text-sm font-medium text-zinc-900">{resolveAiInfluencerJobTitle(job)}</p>
                    <div className="flex flex-wrap gap-2 text-[10px] text-zinc-500">
                      <span>{job.estimatedDurationSec ? `${job.estimatedDurationSec}s` : '—'}</span>
                      <span>{modeLabel(job.generationMode ?? job.display?.generationMode)}</span>
                      <span>FB {job.facebookPublishStatus === 'PUBLISHED' ? '✓' : '—'}</span>
                      <span>IG {job.instagramPublishStatus === 'PUBLISHED' ? '✓' : job.instagramPublishStatus === 'AUTH_REQUIRED' ? '⚠' : '—'}</span>
                      <span>YT {job.youtubePublishStatus === 'PUBLISHED' ? '✓' : '—'}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {master ? (
                        <Link href={master} target="_blank" className="rounded border border-zinc-300 px-2 py-1 text-xs">
                          Přehrát
                        </Link>
                      ) : null}
                      <button type="button" className="rounded border border-zinc-300 px-2 py-1 text-xs" onClick={() => setDetailJobId(job.id)}>
                        Detail
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
            <p className="mt-3 text-sm text-zinc-500">Žádné chybné joby.</p>
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
            <h2 className="text-sm font-semibold text-zinc-900">Testy</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded border border-zinc-300 px-3 py-1.5 text-sm"
                onClick={() => void nestAiInfluencerTestVideoAgent(apiAccessToken)}
              >
                Test Video Agent
              </button>
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
              <button
                type="button"
                disabled={!createArticleId || busy === 'create'}
                className="w-full rounded-lg bg-orange-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => {
                  setBusy('create');
                  void nestAiInfluencerCreateJob(apiAccessToken, createArticleId).then(() => {
                    setBusy(null);
                    setCreateOpen(false);
                    loadCore();
                    setTab('production');
                  });
                }}
              >
                Vytvořit video
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
              <p>Progress: {detailJob.progressPercent ?? 0} %</p>
              <p>Krok: {detailJob.currentStep ?? '—'}</p>
            </div>
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
    </div>
  );
}
