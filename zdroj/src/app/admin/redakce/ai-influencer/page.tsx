'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { EditorialCenterShell } from '@/components/admin/redakce/EditorialCenterShell';
import { AiInfluencerReelEditor } from '@/components/admin/redakce/AiInfluencerReelEditor';
import { nestYoutubeOAuthConnectUrl } from '@/lib/editorial-center-client';
import {
  resolveAiInfluencerJobSubtitle,
  resolveAiInfluencerJobTitle,
} from '@/lib/ai-influencer-display.util';
import {
  nestAiInfluencerApproveScript,
  nestAiInfluencerArticles,
  nestAiInfluencerActiveJobs,
  nestAiInfluencerCreateJob,
  nestAiInfluencerDashboard,
  nestAiInfluencerElevenLabsVoices,
  nestAiInfluencerForceStartJob,
  nestAiInfluencerHeyGenAvatars,
  nestAiInfluencerJobs,
  nestAiInfluencerProfile,
  nestAiInfluencerResumeAutomation,
  nestAiInfluencerRetryJob,
  nestAiInfluencerAcceptUnbranded,
  nestAiInfluencerUpdateSettings,
  nestAiInfluencerPublishFacebook,
  nestAiInfluencerPublishInstagram,
  nestAiInfluencerPublishYoutube,
  nestAiInfluencerRegenerateJob,
  nestAiInfluencerTestAvatar,
  nestAiInfluencerTestVideoAgent,
  nestAiInfluencerVideoAgentTestActive,
  nestAiInfluencerVideoAgentTestStatus,
  nestAiInfluencerTestFallback,
  nestAiInfluencerTestFacebook,
  nestAiInfluencerTestInstagram,
  nestAiInfluencerVerifyInstagram,
  nestAiInfluencerTestYoutube,
  nestAiInfluencerTestYoutubeUpload,
  nestAiInfluencerYoutubeDisconnect,
  nestAiInfluencerTestVoice,
  nestAiInfluencerTestPronunciation,
  nestAiInfluencerUpdateProfile,
  type AiInfluencerActiveJob,
  type AiInfluencerArticleRow,
  type AiInfluencerDashboard,
  type AiInfluencerJobRow,
  type ElevenLabsProviderStatus,
  type ElevenLabsVoiceOption,
  type HeyGenAvatarOption,
  type HeyGenProviderStatus,
  type StorageProviderStatus,
  type VideoAgentTestJob,
} from '@/lib/ai-influencer-client';

function statusTone(status: string) {
  if (status === 'READY' || status === 'PUBLISHED') return 'bg-emerald-100 text-emerald-800';
  if (status === 'PARTIALLY_PUBLISHED') return 'bg-blue-100 text-blue-800';
  if (status === 'SKIPPED_QUALITY' || status === 'SKIPPED_DUPLICATE') return 'bg-zinc-100 text-zinc-700';
  if (status === 'CANDIDATE') return 'bg-violet-100 text-violet-800';
  if (status === 'FAILED') return 'bg-red-100 text-red-800';
  if (status === 'SCRIPT_READY') return 'bg-blue-100 text-blue-800';
  return 'bg-amber-100 text-amber-800';
}

function statusLabel(status: string) {
  if (status === 'SKIPPED_QUALITY') return 'NEVYBRÁNO';
  if (status === 'SKIPPED_DUPLICATE') return 'DUPLICITA';
  if (status === 'CANDIDATE') return 'KANDIDÁT';
  return status;
}

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

function failedStageLabel(stage: string | null | undefined): string {
  if (!stage) return 'kroku';
  if (stage === 'BRANDING_RENDER') return 'brandingu';
  if (stage === 'RENDER') return 'renderu';
  if (stage === 'VOICE') return 'hlasu';
  if (stage === 'AVATAR') return 'avataru';
  if (stage === 'SCRIPT') return 'scénáře';
  if (stage === 'PUBLISH') return 'publikování';
  return stage.toLowerCase();
}

function effectiveFailedStage(job: {
  failedStage?: string | null;
  errorMessage?: string | null;
  errorCode?: string | null;
}): string | null {
  const msg = (job.errorMessage ?? '').toLowerCase();
  const code = (job.errorCode ?? '').toUpperCase();
  if (
    code.startsWith('ELEVENLABS_') ||
    /elevenlabs|eleven.?labs/i.test(msg) ||
    (job.failedStage === 'RENDER' && /elevenlabs|api key není nakonfigurován|vyberte hlas/i.test(msg))
  ) {
    return 'VOICE';
  }
  return job.failedStage ?? null;
}

function youtubePublishLabel(
  job: {
    youtubePublishStatus?: string | null;
    youtubePublishError?: string | null;
    status: string;
  },
  settings?: { autoPublishYoutube?: boolean; youtubePublishMode?: string },
): string {
  const status = job.youtubePublishStatus ?? '—';
  if (status !== 'SKIPPED') return status;
  if (job.youtubePublishError?.trim()) {
    return `SKIPPED — ${job.youtubePublishError.trim().slice(0, 80)}`;
  }
  const autoEnabled =
    settings?.autoPublishYoutube === true &&
    settings?.youtubePublishMode === 'AUTO_AFTER_GENERATION';
  if (!autoEnabled) return 'SKIPPED — target disabled';
  if (!['READY', 'PUBLISHED', 'PARTIALLY_PUBLISHED', 'PUBLISHING'].includes(job.status)) {
    return 'SKIPPED — pending generation';
  }
  return 'SKIPPED — not attempted';
}

function providerLabel(connected: boolean | null, configured: boolean) {
  if (!configured) return 'NOT CONFIGURED';
  if (connected === true) return 'CONNECTED';
  if (connected === false) return 'ERROR';
  return 'UNKNOWN';
}

function elevenLabsLabel(status?: ElevenLabsProviderStatus['status']) {
  if (status === 'CONNECTED') return 'CONNECTED';
  if (status === 'INVALID_API_KEY') return 'INVALID API KEY';
  if (status === 'INSUFFICIENT_PERMISSIONS') return 'PERMISSION REQUIRED';
  if (status === 'RATE_LIMITED') return 'RATE LIMITED';
  if (status === 'QUOTA_EXCEEDED') return 'QUOTA EXCEEDED';
  if (status === 'CONNECTION_ERROR') return 'CONNECTION ERROR';
  return 'NOT CONFIGURED';
}

function heyGenLabel(heygen?: HeyGenProviderStatus) {
  if (heygen?.generationReady || heygen?.connected === true) return 'READY';
  if (heygen?.apiKeyPresence === 'MISSING' || heygen?.status === 'NOT_CONFIGURED') {
    return 'NOT CONFIGURED';
  }
  if (heygen?.status === 'INVALID_API_KEY') return 'AUTH FAILED';
  if (heygen?.status === 'PERMISSION_REQUIRED') return 'PERMISSION REQUIRED';
  if (heygen?.status === 'RATE_LIMITED') return 'RATE LIMITED';
  if (heygen?.status === 'API_ERROR') return 'API ERROR';
  if (heygen?.status === 'CONNECTION_ERROR') return 'CONNECTION ERROR';
  if (heygen?.status === 'CONNECTED' && heygen.avatarStatus !== 'SELECTED') {
    return 'AVATAR NOT SELECTED';
  }
  return heygen?.lastError ?? 'NOT READY';
}

function storageLabel(storage?: StorageProviderStatus) {
  if (storage?.configured) return 'READY';
  return storage?.message ?? 'NOT CONFIGURED';
}

function ProviderCard({
  title,
  lines,
}: {
  title: string;
  lines: Array<{ ok: boolean | null; text: string }>;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <p className="text-sm font-semibold text-zinc-900">{title}</p>
      <ul className="mt-2 space-y-1 text-sm text-zinc-700">
        {lines.map((line) => (
          <li key={line.text} className="flex items-start gap-2">
            <span aria-hidden className={line.ok === true ? 'text-emerald-600' : line.ok === false ? 'text-amber-600' : 'text-zinc-400'}>
              {line.ok === true ? '✓' : line.ok === false ? '⚠' : '·'}
            </span>
            <span>{line.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AiInfluencerPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const [dashboard, setDashboard] = useState<AiInfluencerDashboard | null>(null);
  const [articles, setArticles] = useState<AiInfluencerArticleRow[]>([]);
  const [jobs, setJobs] = useState<AiInfluencerJobRow[]>([]);
  const [activeJobs, setActiveJobs] = useState<AiInfluencerActiveJob[]>([]);
  const [voicePreview, setVoicePreview] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [avatarMessage, setAvatarMessage] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [fbTestMsg, setFbTestMsg] = useState<string | null>(null);
  const [igTestMsg, setIgTestMsg] = useState<string | null>(null);
  const [ytTestMsg, setYtTestMsg] = useState<string | null>(null);
  const [ytConnectError, setYtConnectError] = useState<string | null>(null);
  const [voices, setVoices] = useState<ElevenLabsVoiceOption[]>([]);
  const [avatars, setAvatars] = useState<HeyGenAvatarOption[]>([]);
  const [voicesPermission, setVoicesPermission] = useState<string | null>(null);
  const [avatarsPermission, setAvatarsPermission] = useState<string | null>(null);
  const [voicesMessage, setVoicesMessage] = useState<string | null>(null);
  const [avatarsMessage, setAvatarsMessage] = useState<string | null>(null);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('');
  const [selectedAvatarId, setSelectedAvatarId] = useState<string>('');
  const [busy, setBusy] = useState<string | null>(null);
  const [videoAgentTest, setVideoAgentTest] = useState<VideoAgentTestJob | null>(null);
  const [videoAgentTestError, setVideoAgentTestError] = useState<string | null>(null);

  const elevenLabs = dashboard?.providers.elevenLabs;
  const heygen = dashboard?.providers.heygen;
  const workerRuntime = dashboard?.providers.workerRuntime;
  const ready = dashboard?.providers.ready;

  const load = () => {
    if (!apiAccessToken) return;
    void Promise.all([
      nestAiInfluencerDashboard(apiAccessToken),
      nestAiInfluencerArticles(apiAccessToken),
      nestAiInfluencerJobs(apiAccessToken),
      nestAiInfluencerActiveJobs(apiAccessToken),
      nestAiInfluencerProfile(apiAccessToken),
    ]).then(([d, a, j, active, profile]) => {
      if (d) setDashboard(d);
      if (a) setArticles(a);
      if (j) setJobs(j);
      if (active) setActiveJobs(active);
      if (profile && typeof profile.voiceId === 'string') {
        setSelectedVoiceId(profile.voiceId);
      }
      if (profile && typeof profile.avatarId === 'string') {
        setSelectedAvatarId(profile.avatarId);
      }
      const el = d?.providers.elevenLabs;
      if (el?.configured && apiAccessToken) {
        void nestAiInfluencerElevenLabsVoices(apiAccessToken).then((result) => {
          if (!result) return;
          setVoices(result.voices ?? []);
          setVoicesPermission(result.permission ?? null);
          setVoicesMessage(result.message ?? null);
        });
      }
      const hg = d?.providers.heygen;
      if (hg?.heygenApiKeyPresent && apiAccessToken) {
        void nestAiInfluencerHeyGenAvatars(apiAccessToken).then((result) => {
          if (!result) return;
          setAvatars(result.avatars ?? []);
          setAvatarsPermission(result.permission ?? null);
          setAvatarsMessage(result.message ?? null);
        });
      }
    });
  };

  useEffect(() => {
    if (!isLoading && user?.role !== 'ADMIN') router.replace('/');
  }, [isLoading, user, router]);

  useEffect(load, [apiAccessToken]);

  useEffect(() => {
    if (!apiAccessToken) return;
    void nestAiInfluencerVideoAgentTestActive(apiAccessToken).then((res) => {
      if (res?.job) setVideoAgentTest(res.job);
    });
  }, [apiAccessToken]);

  useEffect(() => {
    if (!apiAccessToken || !videoAgentTest?.id) return;
    if (videoAgentTest.status === 'DONE' || videoAgentTest.status === 'FAILED') return;
    const id = window.setInterval(() => {
      void nestAiInfluencerVideoAgentTestStatus(apiAccessToken, videoAgentTest.id).then((res) => {
        if (res?.job) setVideoAgentTest(res.job);
      });
    }, 3000);
    return () => window.clearInterval(id);
  }, [apiAccessToken, videoAgentTest?.id, videoAgentTest?.status]);

  useEffect(() => {
    if (!apiAccessToken) return;
    const hasActive =
      activeJobs.length > 0 || jobs.some((j) => isProcessing(j.status));
    if (!hasActive) return;
    const id = window.setInterval(() => load(), 3000);
    return () => window.clearInterval(id);
  }, [apiAccessToken, activeJobs.length, jobs]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-orange-600" />
      </div>
    );
  }

  return (
    <EditorialCenterShell
      title="AI Influencer"
      subtitle="Automatická výroba Reelů 9:16 z článků — master video, Facebook Reels a YouTube Shorts."
    >
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">AI Influencer automatika</h2>
            <p className="text-xs text-zinc-500">
              Dnes: {dashboard?.automation?.videosToday ?? 0} / {dashboard?.automation?.maxVideosPerDay ?? dashboard?.settings.maxPerDay ?? 5} videí
              {dashboard?.automation?.nextCheckInMinutes != null
                ? ` · další kontrola za ${dashboard.automation.nextCheckInMinutes} min`
                : null}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-sm font-semibold ${
              dashboard?.automation?.paused
                ? 'bg-red-100 text-red-800'
                : dashboard?.automation?.enabled
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-zinc-100 text-zinc-700'
            }`}
          >
            {dashboard?.automation?.paused
              ? 'POZASTAVENO'
              : dashboard?.automation?.enabled
                ? 'ZAPNUTO'
                : 'VYPNUTO'}
          </span>
        </div>
        {dashboard?.automation?.paused && dashboard.automation.pauseReason ? (
          <p className="mt-2 text-sm text-red-700">
            Důvod: {dashboard.automation.pauseReason}
            {apiAccessToken ? (
              <button
                type="button"
                className="ml-3 text-sm font-medium text-orange-700 underline"
                onClick={() => void nestAiInfluencerResumeAutomation(apiAccessToken).then(load)}
              >
                Obnovit
              </button>
            ) : null}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-zinc-700">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={dashboard?.settings.enabled ?? false}
              onChange={(e) => {
                if (!apiAccessToken) return;
                void nestAiInfluencerUpdateSettings(apiAccessToken, { enabled: e.target.checked }).then(load);
              }}
            />
            Automaticky vytvářet AI Reels
          </label>
          <span>FB: {dashboard?.automation?.autoPublishFacebook ? '✓' : '—'}</span>
          <span>IG: {dashboard?.automation?.autoPublishInstagram ? '✓' : dashboard?.providers.instagram?.publishReady ? '—' : '⚠'}</span>
          <span>YT: {dashboard?.automation?.autoPublishYoutube ? '✓' : dashboard?.providers.youtube?.connected ? '—' : '⚠'}</span>
          <span>Shorts: {dashboard?.automation?.autoPublishPortal ? '✓' : '—'}</span>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          ['Dnes', dashboard?.stats.reelsToday ?? 0],
          ['Ve frontě', dashboard?.stats.inQueue ?? 0],
          ['Publikováno', dashboard?.stats.published ?? 0],
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
          <h2 className="text-sm font-semibold text-zinc-900">Stav providerů</h2>
          {ready ? (
            <span
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                ready.ready ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}
            >
              AI INFLUENCER ·{' '}
              {ready.productionReady ?? ready.ready
                ? '● Připraven k výrobě'
                : `● ${ready.reason}`}
              {ready.publishReasons?.length ? (
                <span className="ml-2 text-xs font-normal">
                  · Publikování: {ready.publishReasons.join(', ')}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <ProviderCard
            title="AI"
            lines={[
              {
                ok: dashboard?.providers.ai?.connected === true,
                text:
                  dashboard?.providers.ai?.connected === true
                    ? 'Připojeno'
                    : providerLabel(dashboard?.providers.ai?.connected ?? null, dashboard?.providers.ai?.configured ?? false),
              },
            ]}
          />
          <ProviderCard
            title="Generation worker"
            lines={[
              {
                ok: workerRuntime?.aiProvider === 'READY',
                text: `AI provider: ${workerRuntime?.aiProvider ?? '—'}`,
              },
              {
                ok: workerRuntime?.heygenVideoAgent === 'READY',
                text: `HeyGen Video Agent: ${workerRuntime?.heygenVideoAgent ?? '—'}`,
              },
              {
                ok:
                  workerRuntime?.elevenLabsStatus === 'NOT_REQUIRED' ||
                  workerRuntime?.elevenLabsStatus === 'READY',
                text: `ElevenLabs: ${workerRuntime?.elevenLabsStatus ?? '—'}`,
              },
              {
                ok: workerRuntime?.avatarFallback === 'READY',
                text: `Avatar fallback: ${workerRuntime?.avatarFallback ?? '—'}`,
              },
              {
                ok: workerRuntime?.storage === 'READY',
                text: `Storage: ${workerRuntime?.storage ?? '—'}`,
              },
              {
                ok: workerRuntime?.heygenApiKey === 'CONFIGURED',
                text: `WORKER HEYGEN_API_KEY: ${workerRuntime?.heygenApiKey ?? 'MISSING'}`,
              },
              {
                ok:
                  workerRuntime?.elevenLabsApiKey === 'CONFIGURED' ||
                  workerRuntime?.elevenLabsStatus === 'NOT_REQUIRED',
                text: `WORKER ELEVENLABS_API_KEY: ${workerRuntime?.elevenLabsApiKey ?? 'MISSING'}`,
              },
              {
                ok: true,
                text: `Generation mode: ${workerRuntime?.generationMode ?? dashboard?.providers.videoEngine?.videoGenerationMode ?? 'VIDEO_AGENT'}`,
              },
            ]}
          />
          <ProviderCard
            title="ElevenLabs"
            lines={[
              {
                ok:
                  workerRuntime?.elevenLabsStatus === 'NOT_REQUIRED' ||
                  elevenLabs?.apiKeyPresence === 'CONFIGURED',
                text:
                  workerRuntime?.elevenLabsStatus === 'NOT_REQUIRED'
                    ? 'Not required for VIDEO_AGENT'
                    : `API key: ${elevenLabs?.apiKeyPresence ?? 'MISSING'}`,
              },
              {
                ok: elevenLabs?.voiceIdPresence === 'CONFIGURED' || elevenLabs?.voiceStatus === 'SELECTED',
                text: `Voice ID: ${elevenLabs?.voiceIdPresence ?? (elevenLabs?.voiceStatus === 'SELECTED' ? 'CONFIGURED' : 'MISSING')}`,
              },
              {
                ok: elevenLabs?.ttsReady === true || elevenLabs?.status === 'CONNECTED',
                text: `TTS permission: ${elevenLabs?.ttsReady || elevenLabs?.status === 'CONNECTED' ? 'READY' : 'NOT READY'}`,
              },
              {
                ok: elevenLabs?.voicesReadStatus?.includes('READY') ?? elevenLabs?.voicesPermission === 'PASS',
                text: `Voices read: ${elevenLabs?.voicesReadStatus ?? (elevenLabs?.voicesPermission === 'PERMISSION_REQUIRED' ? 'OPTIONAL / MISSING' : 'OPTIONAL')}`,
              },
              {
                ok: elevenLabs?.status === 'CONNECTED',
                text:
                  elevenLabs?.status === 'CONNECTED'
                    ? 'Připojeno'
                    : elevenLabsLabel(elevenLabs?.status),
              },
            ]}
          />
          <ProviderCard
            title="HeyGen"
            lines={[
              {
                ok: heygen?.generationReady === true || heygen?.connected === true,
                text:
                  heygen?.generationReady === true || heygen?.connected === true
                    ? 'READY'
                    : heyGenLabel(heygen),
              },
              {
                ok: heygen?.avatarStatus === 'SELECTED',
                text:
                  heygen?.avatarStatus === 'SELECTED' ? 'Avatar vybrán' : 'Avatar není vybrán',
              },
              {
                ok: heygen?.apiKeyPresence === 'CONFIGURED',
                text: `HEYGEN_API_KEY: ${heygen?.apiKeyPresence ?? 'MISSING'}`,
              },
            ]}
          />
          <ProviderCard
            title="Storage"
            lines={[
              {
                ok: dashboard?.providers.storage?.configured === true,
                text: storageLabel(dashboard?.providers.storage),
              },
              {
                ok: dashboard?.providers.storage?.configured === true,
                text:
                  dashboard?.providers.storage?.source === 'CLOUDINARY_URL'
                    ? 'Cloudinary (CLOUDINARY_URL)'
                    : dashboard?.providers.storage?.source === 'CLOUDINARY_NAME_KEY_SECRET'
                      ? 'Cloudinary (NAME + KEY + SECRET)'
                      : 'Permanentní veřejné media storage',
              },
            ]}
          />
          <ProviderCard
            title="Facebook"
            lines={[
              {
                ok: dashboard?.providers.facebook?.connected === true,
                text:
                  dashboard?.providers.facebook?.connected === true
                    ? `Připojeno${dashboard.providers.facebook.pageName ? ` · ${dashboard.providers.facebook.pageName}` : ''}`
                    : dashboard?.providers.facebook?.lastError ?? 'Nepřipojeno',
              },
              {
                ok: dashboard?.providers.facebook?.tokenActive === true,
                text: dashboard?.providers.facebook?.pageId
                  ? `Page ID: ${dashboard.providers.facebook.pageId}`
                  : 'Token: —',
              },
            ]}
          />
          <ProviderCard
            title="Instagram"
            lines={[
              {
                ok: dashboard?.providers.instagram?.connected === true,
                text:
                  dashboard?.providers.instagram?.instagramUsername
                    ? `Připojeno · @${dashboard.providers.instagram.instagramUsername}`
                    : dashboard?.providers.instagram?.connected
                      ? 'Připojeno'
                      : dashboard?.providers.instagram?.message ?? 'Instagram účet nenalezen',
              },
              {
                ok: Boolean(dashboard?.providers.instagram?.linkedPageName),
                text: dashboard?.providers.instagram?.linkedPageName
                  ? `Propojeno přes ${dashboard.providers.instagram.linkedPageName}`
                  : 'Není propojeno s Facebook Page',
              },
              {
                ok: dashboard?.providers.instagram?.publishReady === true,
                text: dashboard?.providers.instagram?.publishReady
                  ? 'Reels publikování připraveno'
                  : dashboard?.providers.instagram?.scopesOk === false
                    ? `Chybí oprávnění${dashboard.providers.instagram.missingScopes?.length ? `: ${dashboard.providers.instagram.missingScopes.join(', ')}` : ''}`
                    : dashboard?.providers.instagram?.needsReconnect
                      ? 'Token vyžaduje obnovení'
                      : 'Instagram není připraven',
              },
            ]}
          />
          <ProviderCard
            title="YouTube"
            lines={[
              {
                ok: dashboard?.providers.youtube?.configured === true,
                text:
                  dashboard?.providers.youtube?.configured === true
                    ? 'OAuth nakonfigurován'
                    : `OAuth není nakonfigurován${dashboard?.providers.youtube?.missingEnv?.length ? ` · chybí ${dashboard.providers.youtube.missingEnv.join(', ')}` : ''}`,
              },
              {
                ok: dashboard?.providers.youtube?.connected === true,
                text:
                  dashboard?.providers.youtube?.connected === true
                    ? `Připojeno · ${dashboard.providers.youtube.channelTitle ?? 'kanál'}`
                    : 'Kanál není připojen',
              },
              {
                ok: dashboard?.providers.youtube?.uploadScopeOk === true,
                text: dashboard?.providers.youtube?.uploadScopeOk
                  ? 'Upload oprávnění: ✓'
                  : dashboard?.providers.youtube?.connected
                    ? 'Chybí youtube.upload'
                    : 'Upload oprávnění: —',
              },
            ]}
          />
          <ProviderCard
            title="Renderer"
            lines={[
              {
                ok: dashboard?.providers.renderer?.connected === true,
                text: `1080×1920 · ${dashboard?.providers.renderer?.preset ?? 'modern_xxrealit'}`,
              },
              {
                ok: dashboard?.providers.renderer?.connected === true,
                text: dashboard?.providers.renderer?.connected ? 'READY' : 'NOT READY',
              },
            ]}
          />
          <ProviderCard
            title="XXREALIT Shorts"
            lines={[
              {
                ok: dashboard?.providers.shorts?.connected === true,
                text:
                  dashboard?.providers.shorts?.connected === true
                    ? 'READY'
                    : dashboard?.providers.shorts?.message ?? 'NOT CONFIGURED',
              },
            ]}
          />
        </div>
        {elevenLabs?.configured ? (
          <div className="mt-4 space-y-2">
            <label className="block text-sm font-medium text-zinc-700" htmlFor="elevenlabs-voice">
              Hlas AI influencera
            </label>
            {voicesPermission === 'PERMISSION_REQUIRED' ? (
              <p className="text-sm text-amber-800">
                {voicesMessage ||
                  'API klíč nemá oprávnění číst seznam hlasů. Povolte Voices read v ElevenLabs API key.'}
              </p>
            ) : null}
            {voices.length > 0 ? (
              <select
                id="elevenlabs-voice"
                value={selectedVoiceId}
                onChange={(e) => setSelectedVoiceId(e.target.value)}
                className="w-full max-w-md rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              >
                <option value="">— vyberte hlas —</option>
                {voices.map((v) => (
                  <option key={v.voiceId} value={v.voiceId}>
                    {v.name}
                    {v.category ? ` (${v.category})` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="elevenlabs-voice"
                value={selectedVoiceId}
                onChange={(e) => setSelectedVoiceId(e.target.value)}
                placeholder="Zadejte ElevenLabs voice ID ručně"
                className="w-full max-w-md rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
            )}
            <button
              type="button"
              disabled={!apiAccessToken || !selectedVoiceId || busy === 'save-voice'}
              onClick={() => {
                if (!apiAccessToken || !selectedVoiceId) return;
                setBusy('save-voice');
                void nestAiInfluencerUpdateProfile(apiAccessToken, { voiceId: selectedVoiceId }).then(() => {
                  setBusy(null);
                  load();
                });
              }}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
            >
              Uložit hlas
            </button>
          </div>
        ) : null}
        {heygen?.heygenApiKeyPresent ? (
          <div className="mt-4 space-y-2">
            <label className="block text-sm font-medium text-zinc-700" htmlFor="heygen-avatar">
              Avatar AI influencera
            </label>
            {avatarsPermission === 'PERMISSION_REQUIRED' ? (
              <p className="text-sm text-amber-800">
                {avatarsMessage ||
                  'API klíč nemá oprávnění číst seznam avatarů. Zadejte HeyGen Avatar ID ručně.'}
              </p>
            ) : null}
            {avatars.length > 0 ? (
              <div className="space-y-2">
                <select
                  id="heygen-avatar"
                  value={selectedAvatarId}
                  onChange={(e) => setSelectedAvatarId(e.target.value)}
                  className="w-full max-w-md rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                >
                  <option value="">— vyberte avatar —</option>
                  {avatars.map((a) => (
                    <option key={a.avatarId} value={a.avatarId}>
                      {a.name} ({a.avatarId})
                    </option>
                  ))}
                </select>
                {avatars
                  .filter((a) => a.avatarId === selectedAvatarId && a.previewUrl)
                  .map((a) => (
                    <img
                      key={a.avatarId}
                      src={a.previewUrl!}
                      alt={a.name}
                      className="h-24 w-24 rounded-lg border border-zinc-200 object-cover"
                    />
                  ))}
              </div>
            ) : (
              <input
                id="heygen-avatar"
                value={selectedAvatarId}
                onChange={(e) => setSelectedAvatarId(e.target.value)}
                placeholder="HeyGen Avatar ID"
                className="w-full max-w-md rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
            )}
            <button
              type="button"
              disabled={!apiAccessToken || !selectedAvatarId || busy === 'save-avatar'}
              onClick={() => {
                if (!apiAccessToken || !selectedAvatarId) return;
                setBusy('save-avatar');
                void nestAiInfluencerUpdateProfile(apiAccessToken, { avatarId: selectedAvatarId }).then(() => {
                  setBusy(null);
                  load();
                });
              }}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
            >
              Uložit avatar
            </button>
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!apiAccessToken || busy === 'voice'}
            onClick={() => {
              if (!apiAccessToken) return;
              setBusy('voice');
              setVoiceError(null);
              void nestAiInfluencerTestVoice(
                apiAccessToken,
                undefined,
                selectedVoiceId || elevenLabs?.voiceId || undefined,
              ).then((r) => {
                if (r.error) {
                  setVoiceError(r.error);
                  setVoicePreview(null);
                } else if (r.data?.previewUrl) {
                  setVoicePreview(r.data.previewUrl);
                  setVoiceError(null);
                }
                setBusy(null);
                load();
              });
            }}
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
          >
            Otestovat hlas
          </button>
          <button
            type="button"
            disabled={!apiAccessToken || busy === 'pronunciation'}
            onClick={() => {
              if (!apiAccessToken) return;
              setBusy('pronunciation');
              setVoiceError(null);
              void nestAiInfluencerTestPronunciation(
                apiAccessToken,
                'Více informací najdete na XXREALIT.CZ.',
                selectedVoiceId || elevenLabs?.voiceId || undefined,
              ).then((r) => {
                if (r.error) {
                  setVoiceError(r.error);
                  setVoicePreview(null);
                } else if (r.data?.previewUrl) {
                  setVoicePreview(r.data.previewUrl);
                  setVoiceError(null);
                }
                setBusy(null);
              });
            }}
            className="rounded-lg border border-orange-300 px-4 py-2 text-sm font-semibold text-orange-800 hover:bg-orange-50 disabled:opacity-50"
          >
            Test výslovnosti značky
          </button>
          <button
            type="button"
            disabled={!apiAccessToken || busy === 'avatar'}
            onClick={() => {
              if (!apiAccessToken) return;
              setBusy('avatar');
              setAvatarError(null);
              setAvatarMessage(null);
              void nestAiInfluencerTestAvatar(
                apiAccessToken,
                undefined,
                selectedAvatarId || heygen?.avatarId || undefined,
              ).then((r) => {
                if (r.error) {
                  setAvatarError(r.error);
                  setAvatarMessage(null);
                } else if (r.data?.message) {
                  setAvatarMessage(r.data.message);
                  setAvatarError(null);
                }
                setBusy(null);
                load();
              });
            }}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
          >
            Test avatar
          </button>
        </div>
        {voiceError ? <p className="mt-3 text-sm text-red-700">{voiceError}</p> : null}
        {voicePreview ? (
          <audio className="mt-3 w-full" controls src={voicePreview}>
            <track kind="captions" />
          </audio>
        ) : null}
        {avatarError ? <p className="mt-3 text-sm text-red-700">{avatarError}</p> : null}
        {avatarMessage ? <p className="mt-3 text-sm text-emerald-700">{avatarMessage}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!apiAccessToken || busy === 'fb-test'}
            onClick={() => {
              if (!apiAccessToken) return;
              setBusy('fb-test');
              void nestAiInfluencerTestFacebook(apiAccessToken).then((r) => {
                setFbTestMsg(r.error ?? r.data?.pageName ?? 'Facebook OK');
                setBusy(null);
                load();
              });
            }}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
          >
            Otestovat Facebook
          </button>
          <button
            type="button"
            disabled={!apiAccessToken || busy === 'ig-verify'}
            onClick={() => {
              if (!apiAccessToken) return;
              setBusy('ig-verify');
              setIgTestMsg(null);
              void nestAiInfluencerVerifyInstagram(apiAccessToken).then((r) => {
                setBusy(null);
                setIgTestMsg(r.error ?? 'Instagram identita obnovena.');
                load();
              });
            }}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
          >
            Ověřit Instagram
          </button>
          <button
            type="button"
            disabled={!apiAccessToken || busy === 'ig-test'}
            onClick={() => {
              if (!apiAccessToken) return;
              setBusy('ig-test');
              setIgTestMsg(null);
              void nestAiInfluencerTestInstagram(apiAccessToken).then((r) => {
                setBusy(null);
                if (r.data) {
                  setIgTestMsg(
                    `INSTAGRAM CONNECTION\nAccount: ${r.data.account ?? '—'}\nPage: ${r.data.page ?? '—'}\nProfessional account: ${r.data.professionalAccount ? 'YES' : 'NO'}\nPublishing permission: ${r.data.publishingPermission ? 'YES' : 'NO'}\nStatus: ${r.data.status}`,
                  );
                } else {
                  setIgTestMsg(r.error ?? 'Instagram test selhal.');
                }
              });
            }}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
          >
            Test Instagram připojení
          </button>
          {dashboard?.providers.instagram?.needsReconnect ? (
            <Link
              href="/admin/integrace/facebook"
              className="rounded-lg border border-pink-300 px-4 py-2 text-sm font-medium text-pink-800 hover:bg-pink-50"
            >
              Doplnit oprávnění Instagram
            </Link>
          ) : null}
          {igTestMsg ? (
            <p className="col-span-full whitespace-pre-wrap text-xs text-zinc-600">{igTestMsg}</p>
          ) : null}
          <button
            type="button"
            disabled={!apiAccessToken || busy === 'yt-connect'}
            onClick={() => {
              if (!apiAccessToken) return;
              setBusy('yt-connect');
              setYtConnectError(null);
              void nestYoutubeOAuthConnectUrl(apiAccessToken).then((result) => {
                setBusy(null);
                if (result.url) {
                  window.location.href = result.url;
                  return;
                }
                setYtConnectError(result.error ?? 'YouTube OAuth selhalo.');
              });
            }}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
          >
            Připojit YouTube kanál
          </button>
          <button
            type="button"
            disabled={!apiAccessToken || busy === 'yt-test'}
            onClick={() => {
              if (!apiAccessToken) return;
              setBusy('yt-test');
              void nestAiInfluencerTestYoutube(apiAccessToken).then((r) => {
                setYtTestMsg(r.error ?? r.data?.message ?? r.data?.status ?? 'YouTube OK');
                setBusy(null);
                load();
              });
            }}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
          >
            Otestovat YouTube
          </button>
          <button
            type="button"
            disabled={!apiAccessToken || busy === 'yt-reauth'}
            onClick={() => {
              if (!apiAccessToken) return;
              setBusy('yt-reauth');
              setYtConnectError(null);
              void nestYoutubeOAuthConnectUrl(apiAccessToken).then((result) => {
                setBusy(null);
                if (result.url) window.location.href = result.url;
                else setYtConnectError(result.error ?? 'Znovu autorizace selhala.');
              });
            }}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
          >
            Znovu autorizovat
          </button>
          <button
            type="button"
            disabled={!apiAccessToken || busy === 'yt-disconnect'}
            onClick={() => {
              if (!apiAccessToken) return;
              setBusy('yt-disconnect');
              void nestAiInfluencerYoutubeDisconnect(apiAccessToken).then(() => {
                setBusy(null);
                setYtTestMsg('YouTube odpojeno.');
                load();
              });
            }}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
          >
            Odpojit
          </button>
          <button
            type="button"
            disabled={!apiAccessToken || busy === 'yt-upload-test'}
            onClick={() => {
              if (!apiAccessToken) return;
              setBusy('yt-upload-test');
              void nestAiInfluencerTestYoutubeUpload(apiAccessToken).then((r) => {
                setYtTestMsg(
                  r.error ??
                    (r.data?.ok
                      ? `Test upload OK · ${r.data.youtubeUrl ?? r.data.youtubeVideoId}`
                      : r.data?.message ?? 'Test upload selhal'),
                );
                setBusy(null);
              });
            }}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
          >
            Testovací upload
          </button>
        </div>
        {fbTestMsg ? <p className="mt-2 text-sm text-zinc-600">{fbTestMsg}</p> : null}
        {ytTestMsg ? <p className="mt-2 text-sm text-zinc-600">{ytTestMsg}</p> : null}
        {ytConnectError ? <p className="mt-2 text-sm text-red-700">{ytConnectError}</p> : null}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">VIDEO ENGINE</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Hlavní režim: dynamické AI video přes HeyGen Video Agent. Fallback: multi-scene avatar pipeline.
        </p>
        <dl className="mt-4 grid gap-2 text-sm md:grid-cols-2">
          <div>
            <dt className="text-zinc-500">Mode</dt>
            <dd className="font-medium">{dashboard?.providers.videoEngine?.mode ?? 'Dynamické AI video'}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">HeyGen Video Agent</dt>
            <dd className="font-medium">
              {dashboard?.providers.videoEngine?.heygenVideoAgent ?? 'NOT AVAILABLE'}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Fallback</dt>
            <dd className="font-medium">{dashboard?.providers.videoEngine?.fallback ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Formát</dt>
            <dd className="font-medium">{dashboard?.providers.videoEngine?.format ?? '1080x1920 · 9:16'}</dd>
          </div>
        </dl>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4 text-sm">
          <label className="block">
            Režim tvorby videa
            <select
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
              value={dashboard?.settings.videoGenerationMode ?? 'VIDEO_AGENT'}
              onChange={(e) => {
                if (!apiAccessToken) return;
                void nestAiInfluencerUpdateSettings(apiAccessToken, {
                  videoGenerationMode: e.target.value as 'VIDEO_AGENT' | 'AVATAR',
                }).then(load);
              }}
            >
              <option value="VIDEO_AGENT">Dynamické AI video</option>
              <option value="AVATAR">Jednoduchý avatar</option>
            </select>
          </label>
          <label className="block">
            Video styl
            <select
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
              value={dashboard?.settings.videoStyle ?? 'auto'}
              onChange={(e) => {
                if (!apiAccessToken) return;
                void nestAiInfluencerUpdateSettings(apiAccessToken, {
                  videoStyle: e.target.value,
                }).then(load);
              }}
            >
              <option value="auto">Automaticky</option>
              <option value="dynamic_influencer">Dynamický influencer</option>
              <option value="real_estate_news">Realitní zprávy</option>
              <option value="property_showcase">Prezentace nemovitosti</option>
              <option value="educational">Edukační</option>
            </select>
          </label>
          <label className="block">
            Avatar ve scénách
            <select
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
              value={dashboard?.settings.avatarFrequency ?? 'medium'}
              onChange={(e) => {
                if (!apiAccessToken) return;
                void nestAiInfluencerUpdateSettings(apiAccessToken, {
                  avatarFrequency: e.target.value,
                }).then(load);
              }}
            >
              <option value="low">Málo</option>
              <option value="medium">Středně</option>
              <option value="high">Často</option>
            </select>
          </label>
          <label className="flex items-end gap-2 pb-2">
            <input
              type="checkbox"
              checked={dashboard?.settings.allowVideoAgentFallback !== false}
              onChange={(e) => {
                if (!apiAccessToken) return;
                void nestAiInfluencerUpdateSettings(apiAccessToken, {
                  allowVideoAgentFallback: e.target.checked,
                }).then(load);
              }}
            />
            Povolit fallback na avatar pipeline
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={
              !apiAccessToken ||
              busy === 'video-agent' ||
              (videoAgentTest != null &&
                videoAgentTest.status !== 'DONE' &&
                videoAgentTest.status !== 'FAILED')
            }
            onClick={() => {
              if (!apiAccessToken) return;
              setBusy('video-agent');
              setVideoAgentTestError(null);
              void nestAiInfluencerTestVideoAgent(apiAccessToken).then((r) => {
                setBusy(null);
                if (r.error || !r.data) {
                  setVideoAgentTestError(r.error ?? 'Video Agent test selhal.');
                  return;
                }
                void nestAiInfluencerVideoAgentTestStatus(apiAccessToken, r.data.jobId).then((res) => {
                  if (res?.job) setVideoAgentTest(res.job);
                });
              });
            }}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
          >
            Test Video Agent
          </button>
          {videoAgentTest?.status === 'FAILED' ? (
            <button
              type="button"
              disabled={!apiAccessToken || busy === 'video-agent'}
              onClick={() => {
                if (!apiAccessToken) return;
                setBusy('video-agent');
                setVideoAgentTestError(null);
                setVideoAgentTest(null);
                void nestAiInfluencerTestVideoAgent(apiAccessToken).then((r) => {
                  setBusy(null);
                  if (r.error || !r.data) {
                    setVideoAgentTestError(r.error ?? 'Video Agent test selhal.');
                    return;
                  }
                  void nestAiInfluencerVideoAgentTestStatus(apiAccessToken, r.data.jobId).then((res) => {
                    if (res?.job) setVideoAgentTest(res.job);
                  });
                });
              }}
              className="rounded-lg border border-orange-300 px-3 py-1.5 text-sm font-medium text-orange-800 hover:bg-orange-50 disabled:opacity-50"
            >
              Zkusit znovu
            </button>
          ) : null}
          <button
            type="button"
            disabled={!apiAccessToken || busy === 'fallback'}
            onClick={() => {
              if (!apiAccessToken) return;
              setBusy('fallback');
              void nestAiInfluencerTestFallback(
                apiAccessToken,
                selectedAvatarId || heygen?.avatarId || undefined,
              ).then((r) => {
                setBusy(null);
                if (r.error) alert(r.error);
                else alert(r.data?.message ?? 'Fallback avatar OK.');
              });
            }}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
          >
            Test fallback
          </button>
        </div>
        {videoAgentTestError ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <p className="font-semibold">Video Agent test selhal</p>
            <p className="mt-1">{videoAgentTestError}</p>
          </div>
        ) : null}
        {videoAgentTest ? (
          <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">Test Video Agent</p>
              <span className="text-xs text-zinc-500">{videoAgentTest.status}</span>
            </div>
            {videoAgentTest.status !== 'DONE' && videoAgentTest.status !== 'FAILED' ? (
              <div className="mt-2">
                <div className="mb-1 flex justify-between text-xs text-zinc-600">
                  <span>{videoAgentTest.progressLabel}</span>
                  <span>{videoAgentTest.progressPercent} %</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-zinc-200">
                  <div
                    className="h-full rounded-full bg-orange-500 transition-all duration-500"
                    style={{ width: `${Math.min(100, videoAgentTest.progressPercent)}%` }}
                  />
                </div>
              </div>
            ) : null}
            {videoAgentTest.status === 'FAILED' ? (
              <div className="mt-2 text-xs text-red-700">
                <p>Fáze: {videoAgentTest.failedStage ?? '—'}</p>
                <p>Chyba: {videoAgentTest.errorMessage ?? videoAgentTest.errorCode ?? 'Neznámá chyba'}</p>
              </div>
            ) : null}
            {videoAgentTest.status === 'DONE' ? (
              <div className="mt-2 space-y-1 text-xs text-emerald-800">
                <p className="font-semibold text-emerald-900">VIDEO AGENT TEST: PASS</p>
                <p>Délka: {videoAgentTest.durationSec ?? '—'} s</p>
                <p>
                  Rozlišení: {videoAgentTest.width ?? '—'}×{videoAgentTest.height ?? '—'}
                </p>
                <p>Provider job id: {videoAgentTest.providerJobIdMasked ?? '—'}</p>
                {videoAgentTest.previewUrl ? (
                  <video
                    className="mt-2 max-h-64 w-full max-w-xs rounded-lg bg-black"
                    controls
                    src={videoAgentTest.previewUrl}
                  >
                    <track kind="captions" />
                  </video>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {dashboard?.providers.videoEngine?.heygenVideoAgentMessage ? (
          <p className="mt-2 text-sm text-amber-800">
            {dashboard.providers.videoEngine.heygenVideoAgentMessage}
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">Video styl</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Formát: <strong>9:16 · 1080×1920</strong> (VERTICAL_SHORT_9_16) — jediný master pro všechny platformy.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3 text-sm">
          <label className="block">
            Délka
            <select
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
              value={dashboard?.settings.durationPreset ?? '25_35'}
              onChange={(e) => {
                if (!apiAccessToken) return;
                void nestAiInfluencerUpdateSettings(apiAccessToken, {
                  durationPreset: e.target.value as '25_35' | '35_45' | '45_60',
                  targetDurationSec:
                    e.target.value === '45_60' ? 50 : e.target.value === '35_45' ? 40 : 30,
                }).then(load);
              }}
            >
              <option value="25_35">25–35 s</option>
              <option value="35_45">35–45 s</option>
              <option value="45_60">45–60 s</option>
            </select>
          </label>
          <label className="block">
            Frekvence scén
            <select
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
              value={dashboard?.settings.scenePacing ?? 'dynamic'}
              onChange={(e) => {
                if (!apiAccessToken) return;
                void nestAiInfluencerUpdateSettings(apiAccessToken, {
                  scenePacing: e.target.value as 'dynamic' | 'calm',
                }).then(load);
              }}
            >
              <option value="dynamic">Dynamická</option>
              <option value="calm">Klidná</option>
            </select>
          </label>
          <label className="block">
            Cíl videa
            <select
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
              value={dashboard?.settings.videoGoal ?? 'auto'}
              onChange={(e) => {
                if (!apiAccessToken) return;
                void nestAiInfluencerUpdateSettings(apiAccessToken, {
                  videoGoal: e.target.value as
                    | 'website_traffic'
                    | 'youtube_subscribe'
                    | 'facebook_follow'
                    | 'instagram_follow'
                    | 'auto',
                }).then(load);
              }}
            >
              <option value="auto">Automaticky</option>
              <option value="website_traffic">Návštěvnost XXREALIT.CZ</option>
              <option value="youtube_subscribe">Odběr YouTube</option>
              <option value="facebook_follow">Sledování Facebook</option>
              <option value="instagram_follow">Sledování Instagram</option>
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          {(
            [
              ['useArticleImages', 'Obrázky článku'],
              ['usePortalMedia', 'Média XXREALIT'],
              ['useBroll', 'B-roll'],
              ['useMusic', 'Hudba'],
              ['useSubtitles', 'Titulky'],
              ['useLogo', 'Logo'],
              ['useCta', 'CTA'],
              ['mentionBrandInScript', 'Zmínit XXREALIT'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={dashboard?.settings[key] !== false}
                onChange={(e) => {
                  if (!apiAccessToken) return;
                  void nestAiInfluencerUpdateSettings(apiAccessToken, { [key]: e.target.checked }).then(
                    load,
                  );
                }}
              />
              {label}
            </label>
          ))}
        </div>
      </section>

      <AiInfluencerReelEditor
        apiAccessToken={apiAccessToken}
        dashboardSettings={dashboard?.settings}
        onSaved={load}
      />

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">Články</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-zinc-500">
                <th className="py-2 pr-4">Název</th>
                <th className="py-2 pr-4">Score</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2">Akce</th>
              </tr>
            </thead>
            <tbody>
              {articles.map((a) => (
                <tr key={a.id} className="border-b border-zinc-100">
                  <td className="py-3 pr-4">
                    <p className="font-medium text-zinc-900">{a.title}</p>
                    <p className="text-xs text-zinc-500">{a.category}</p>
                  </td>
                  <td className="py-3 pr-4">{a.reelScore ?? '—'}</td>
                  <td className="py-3 pr-4">
                    {a.latestJob ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs ${statusTone(a.latestJob.status)}`}>
                        {statusLabel(a.latestJob.status)}
                      </span>
                    ) : a.reelScore != null ? (
                      <span className="text-xs text-zinc-600">Score {a.reelScore}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-3">
                    {a.latestJob?.status === 'SKIPPED_QUALITY' ? (
                      <button
                        type="button"
                        disabled={!apiAccessToken || busy === a.id}
                        onClick={() => {
                          if (!apiAccessToken) return;
                          setBusy(a.id);
                          void nestAiInfluencerForceStartJob(apiAccessToken, a.latestJob!.id).then(() => {
                            setBusy(null);
                            load();
                          });
                        }}
                        className="text-sm font-medium text-orange-700 hover:underline disabled:opacity-50"
                      >
                        Vytvořit i tak
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={!apiAccessToken || busy === a.id}
                        onClick={() => {
                          if (!apiAccessToken) return;
                          setBusy(a.id);
                          void nestAiInfluencerCreateJob(apiAccessToken, a.id).then(() => {
                            setBusy(null);
                            load();
                          });
                        }}
                        className="text-sm font-medium text-orange-700 hover:underline disabled:opacity-50"
                      >
                        Vytvořit AI Reel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">Fronta / výsledky</h2>
        <div className="mt-3 space-y-3">
          {jobs.map((job) => (
            <div key={job.id} className="rounded-lg border border-zinc-100 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-zinc-900">{resolveAiInfluencerJobTitle(job)}</p>
                  {resolveAiInfluencerJobSubtitle(job) ? (
                    <p className="text-xs text-amber-700">{resolveAiInfluencerJobSubtitle(job)}</p>
                  ) : (
                    <p className="text-xs text-zinc-500">{job.selectedHook || '—'}</p>
                  )}
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${statusTone(job.status)}`}>
                  {statusLabel(job.status)}
                </span>
              </div>
              {isProcessing(job.status) && (job.progressPercent ?? 0) > 0 ? (
                <div className="mt-2">
                  <div className="mb-1 flex justify-between text-xs text-zinc-600">
                    <span>{job.currentStep ?? 'Generuji…'}</span>
                    <span>{job.progressPercent ?? 0} %</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className="h-full rounded-full bg-orange-500 transition-all duration-500"
                      style={{ width: `${Math.min(100, job.progressPercent ?? 0)}%` }}
                    />
                  </div>
                </div>
              ) : null}
              {job.skipReason ? (
                <p className="mt-2 text-xs text-zinc-600">{job.skipReason}</p>
              ) : null}
              {job.errorMessage ? (
                <p className="mt-2 text-xs text-red-700">
                  Krok: {failedStageLabel(effectiveFailedStage(job))} — {job.errorMessage}
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500">
                <span>FB: {job.facebookPublishStatus ?? '—'}</span>
                <span>
                  IG: {job.instagramPublishStatus ?? '—'}
                  {job.instagramUsername ? ` @${job.instagramUsername}` : ''}
                </span>
                <span>YT: {youtubePublishLabel(job, dashboard?.settings)}</span>
                {job.instagramPublishError && job.instagramPublishStatus === 'FAILED' ? (
                  <span className="text-red-600">{job.instagramPublishError.slice(0, 120)}</span>
                ) : null}
                {job.instagramMediaId && job.instagramPublishStatus === 'PUBLISHED' ? (
                  <span>IG ID: {job.instagramMediaId}</span>
                ) : null}
                {job.estimatedDurationSec ? <span>{job.estimatedDurationSec}s</span> : null}
              </div>
              {(job.finalMasterUrl ?? job.videoUrl) ? (
                <video
                  className="mt-3 max-h-64 w-full max-w-xs rounded-lg bg-black"
                  controls
                  src={job.finalMasterUrl ?? job.videoUrl ?? undefined}
                >
                  <track kind="captions" />
                </video>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                {job.status === 'SCRIPT_READY' ? (
                  <button
                    type="button"
                    disabled={!apiAccessToken}
                    onClick={() => {
                      if (!apiAccessToken) return;
                      void nestAiInfluencerApproveScript(apiAccessToken, job.id).then(load);
                    }}
                    className="rounded border border-orange-300 px-3 py-1 text-xs font-medium text-orange-800"
                  >
                    Schválit scénář → voice/avatar/render
                  </button>
                ) : null}
                {job.status === 'FAILED' ? (
                  <button
                    type="button"
                    disabled={!apiAccessToken}
                    onClick={() => {
                      if (!apiAccessToken) return;
                      void nestAiInfluencerRetryJob(apiAccessToken, job.id).then(load);
                    }}
                    className="rounded border border-zinc-300 px-3 py-1 text-xs font-medium"
                  >
                    Zkusit znovu od {failedStageLabel(effectiveFailedStage(job))}
                  </button>
                ) : null}
                {job.status === 'FAILED' &&
                job.failedStage === 'BRANDING_RENDER' &&
                (job.baseMasterUrl || job.videoUrl) ? (
                  <button
                    type="button"
                    disabled={!apiAccessToken}
                    onClick={() => {
                      if (!apiAccessToken) return;
                      void nestAiInfluencerAcceptUnbranded(apiAccessToken, job.id).then(() => load());
                    }}
                    className="rounded border border-amber-300 px-3 py-1 text-xs font-medium text-amber-900"
                  >
                    Použít video bez brandingu
                  </button>
                ) : null}
                {job.status === 'SKIPPED_QUALITY' ? (
                  <button
                    type="button"
                    disabled={!apiAccessToken}
                    onClick={() => {
                      if (!apiAccessToken) return;
                      void nestAiInfluencerForceStartJob(apiAccessToken, job.id).then(load);
                    }}
                    className="rounded border border-orange-300 px-3 py-1 text-xs font-medium text-orange-800"
                  >
                    Vytvořit i tak
                  </button>
                ) : null}
                {job.finalMasterUrl ?? job.videoUrl ? (
                  <Link
                    href={job.finalMasterUrl ?? job.videoUrl!}
                    target="_blank"
                    className="rounded border border-zinc-300 px-3 py-1 text-xs font-medium"
                  >
                    Přehrát náhled
                  </Link>
                ) : null}
                {(job.finalMasterUrl ?? job.videoUrl) && job.status === 'READY' ? (
                  <>
                    <button
                      type="button"
                      disabled={!apiAccessToken}
                      onClick={() => {
                        if (!apiAccessToken) return;
                        void nestAiInfluencerRegenerateJob(apiAccessToken, job.id).then(load);
                      }}
                      className="rounded border border-zinc-300 px-3 py-1 text-xs font-medium"
                    >
                      Přegenerovat
                    </button>
                    <button
                      type="button"
                      disabled={!apiAccessToken || job.facebookPublishStatus === 'PUBLISHED'}
                      onClick={() => {
                        if (!apiAccessToken) return;
                        void nestAiInfluencerPublishFacebook(apiAccessToken, job.id).then(load);
                      }}
                      className="rounded border border-blue-300 px-3 py-1 text-xs font-medium text-blue-800"
                    >
                      FB publikovat
                    </button>
                    <button
                      type="button"
                      disabled={!apiAccessToken || job.instagramPublishStatus === 'PUBLISHED'}
                      onClick={() => {
                        if (!apiAccessToken) return;
                        void nestAiInfluencerPublishInstagram(apiAccessToken, job.id).then(load);
                      }}
                      className="rounded border border-pink-300 px-3 py-1 text-xs font-medium text-pink-800"
                    >
                      IG publikovat
                    </button>
                    <button
                      type="button"
                      disabled={!apiAccessToken || job.youtubePublishStatus === 'PUBLISHED'}
                      onClick={() => {
                        if (!apiAccessToken) return;
                        void nestAiInfluencerPublishYoutube(apiAccessToken, job.id).then(load);
                      }}
                      className="rounded border border-red-300 px-3 py-1 text-xs font-medium text-red-800"
                    >
                      YT publikovat
                    </button>
                  </>
                ) : null}
                {(job.instagramPublishStatus === 'FAILED' ||
                  job.instagramPublishStatus === 'SKIPPED' ||
                  job.instagramPublishStatus === 'AUTH_REQUIRED') &&
                (job.finalMasterUrl ?? job.videoUrl) ? (
                  <button
                    type="button"
                    disabled={!apiAccessToken}
                    onClick={() => {
                      if (!apiAccessToken) return;
                      void nestAiInfluencerPublishInstagram(apiAccessToken, job.id).then(load);
                    }}
                    className="rounded border border-pink-200 px-3 py-1 text-xs font-medium text-pink-700"
                  >
                    Opakovat Instagram
                  </button>
                ) : null}
                {job.facebookPermalink ? (
                  <Link
                    href={job.facebookPermalink}
                    target="_blank"
                    className="rounded border border-zinc-300 px-3 py-1 text-xs font-medium"
                  >
                    Facebook
                  </Link>
                ) : null}
                {job.instagramPermalink ? (
                  <Link
                    href={job.instagramPermalink}
                    target="_blank"
                    className="rounded border border-zinc-300 px-3 py-1 text-xs font-medium"
                  >
                    Instagram
                  </Link>
                ) : null}
                {job.youtubePermalink ? (
                  <Link
                    href={job.youtubePermalink}
                    target="_blank"
                    className="rounded border border-zinc-300 px-3 py-1 text-xs font-medium"
                  >
                    YouTube
                  </Link>
                ) : null}
                {job.videoUrl ? (
                  <Link
                    href={job.videoUrl}
                    target="_blank"
                    className="rounded border border-zinc-300 px-3 py-1 text-xs font-medium"
                  >
                    Master MP4
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
          {!jobs.length ? <p className="text-sm text-zinc-500">Zatím žádné joby.</p> : null}
        </div>
      </section>
    </EditorialCenterShell>
  );
}
