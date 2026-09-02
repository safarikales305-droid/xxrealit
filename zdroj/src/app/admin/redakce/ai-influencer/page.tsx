'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { EditorialCenterShell } from '@/components/admin/redakce/EditorialCenterShell';
import {
  nestAiInfluencerApproveScript,
  nestAiInfluencerArticles,
  nestAiInfluencerCreateJob,
  nestAiInfluencerDashboard,
  nestAiInfluencerElevenLabsVoices,
  nestAiInfluencerHeyGenAvatars,
  nestAiInfluencerJobs,
  nestAiInfluencerProfile,
  nestAiInfluencerRetryJob,
  nestAiInfluencerTestAvatar,
  nestAiInfluencerTestVoice,
  nestAiInfluencerUpdateProfile,
  type AiInfluencerArticleRow,
  type AiInfluencerDashboard,
  type AiInfluencerJobRow,
  type ElevenLabsProviderStatus,
  type ElevenLabsVoiceOption,
  type HeyGenAvatarOption,
  type HeyGenProviderStatus,
} from '@/lib/ai-influencer-client';

function statusTone(status: string) {
  if (status === 'READY' || status === 'PUBLISHED') return 'bg-emerald-100 text-emerald-800';
  if (status === 'FAILED') return 'bg-red-100 text-red-800';
  if (status === 'SCRIPT_READY') return 'bg-blue-100 text-blue-800';
  return 'bg-amber-100 text-amber-800';
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

function heyGenLabel(status?: HeyGenProviderStatus['status']) {
  if (status === 'CONNECTED') return 'CONNECTED';
  if (status === 'INVALID_API_KEY') return 'INVALID API KEY';
  if (status === 'PERMISSION_REQUIRED') return 'PERMISSION REQUIRED';
  if (status === 'RATE_LIMITED') return 'RATE LIMITED';
  if (status === 'API_ERROR') return 'API ERROR';
  if (status === 'CONNECTION_ERROR') return 'CONNECTION ERROR';
  return 'NOT CONFIGURED';
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
  const [voicePreview, setVoicePreview] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [avatarMessage, setAvatarMessage] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [voices, setVoices] = useState<ElevenLabsVoiceOption[]>([]);
  const [avatars, setAvatars] = useState<HeyGenAvatarOption[]>([]);
  const [voicesPermission, setVoicesPermission] = useState<string | null>(null);
  const [avatarsPermission, setAvatarsPermission] = useState<string | null>(null);
  const [voicesMessage, setVoicesMessage] = useState<string | null>(null);
  const [avatarsMessage, setAvatarsMessage] = useState<string | null>(null);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('');
  const [selectedAvatarId, setSelectedAvatarId] = useState<string>('');
  const [busy, setBusy] = useState<string | null>(null);

  const elevenLabs = dashboard?.providers.elevenLabs;
  const heygen = dashboard?.providers.heygen;
  const ready = dashboard?.providers.ready;

  const load = () => {
    if (!apiAccessToken) return;
    void Promise.all([
      nestAiInfluencerDashboard(apiAccessToken),
      nestAiInfluencerArticles(apiAccessToken),
      nestAiInfluencerJobs(apiAccessToken),
      nestAiInfluencerProfile(apiAccessToken),
    ]).then(([d, a, j, profile]) => {
      if (d) setDashboard(d);
      if (a) setArticles(a);
      if (j) setJobs(j);
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
      subtitle="Automatická výroba Reelů z článků s virtuální redaktorkou XXREALIT (Phase 1 — bez auto-publish)."
    >
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
              AI INFLUENCER · {ready.ready ? '● Připraven k výrobě' : `● ${ready.reason}`}
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
            title="ElevenLabs"
            lines={[
              {
                ok: elevenLabs?.status === 'CONNECTED',
                text:
                  elevenLabs?.status === 'CONNECTED'
                    ? 'Připojeno'
                    : elevenLabsLabel(elevenLabs?.status),
              },
              {
                ok: elevenLabs?.voiceStatus === 'SELECTED',
                text:
                  elevenLabs?.voiceStatus === 'SELECTED' ? 'Hlas vybrán' : 'Hlas není vybrán',
              },
            ]}
          />
          <ProviderCard
            title="HeyGen"
            lines={[
              {
                ok: heygen?.status === 'CONNECTED',
                text:
                  heygen?.status === 'CONNECTED'
                    ? 'Připojeno'
                    : heyGenLabel(heygen?.status),
              },
              {
                ok: heygen?.avatarStatus === 'SELECTED',
                text:
                  heygen?.avatarStatus === 'SELECTED' ? 'Avatar vybrán' : 'Avatar není vybrán',
              },
            ]}
          />
          <ProviderCard
            title="Facebook"
            lines={[
              {
                ok: dashboard?.providers.facebook?.connected === true,
                text: providerLabel(
                  dashboard?.providers.facebook?.connected ?? null,
                  dashboard?.providers.facebook?.configured ?? false,
                ),
              },
            ]}
          />
          <ProviderCard
            title="YouTube"
            lines={[
              {
                ok: dashboard?.providers.youtube?.connected === true,
                text: providerLabel(
                  dashboard?.providers.youtube?.connected ?? null,
                  dashboard?.providers.youtube?.configured ?? false,
                ),
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
        {avatarError ? <p className="mt-3 text-sm text-red-700">{avatarError}</p> : null}
        {avatarMessage ? <p className="mt-3 text-sm text-emerald-700">{avatarMessage}</p> : null}
        {voicePreview ? (
          <audio className="mt-3 w-full" controls src={voicePreview}>
            <track kind="captions" />
          </audio>
        ) : null}
      </section>

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
                        {a.latestJob.status}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-3">
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
                  <p className="font-medium text-zinc-900">{job.article.title}</p>
                  <p className="text-xs text-zinc-500">{job.selectedHook || '—'}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${statusTone(job.status)}`}>
                  {job.status}
                </span>
              </div>
              {job.errorMessage ? (
                <p className="mt-2 text-xs text-red-700">{job.errorMessage}</p>
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
                    Zkusit znovu
                  </button>
                ) : null}
                {job.videoUrl ? (
                  <Link
                    href={job.videoUrl}
                    target="_blank"
                    className="rounded border border-zinc-300 px-3 py-1 text-xs font-medium"
                  >
                    Náhled MP4
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
