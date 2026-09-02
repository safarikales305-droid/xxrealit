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
  nestAiInfluencerJobs,
  nestAiInfluencerRetryJob,
  nestAiInfluencerTestAvatar,
  nestAiInfluencerTestVoice,
  type AiInfluencerArticleRow,
  type AiInfluencerDashboard,
  type AiInfluencerJobRow,
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

export default function AiInfluencerPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const [dashboard, setDashboard] = useState<AiInfluencerDashboard | null>(null);
  const [articles, setArticles] = useState<AiInfluencerArticleRow[]>([]);
  const [jobs, setJobs] = useState<AiInfluencerJobRow[]>([]);
  const [voicePreview, setVoicePreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    if (!apiAccessToken) return;
    void Promise.all([
      nestAiInfluencerDashboard(apiAccessToken),
      nestAiInfluencerArticles(apiAccessToken),
      nestAiInfluencerJobs(apiAccessToken),
    ]).then(([d, a, j]) => {
      if (d) setDashboard(d);
      if (a) setArticles(a);
      if (j) setJobs(j);
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
        <h2 className="text-sm font-semibold text-zinc-900">Stav providerů</h2>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          {dashboard &&
            Object.entries(dashboard.providers).map(([key, val]) => (
              <span
                key={key}
                className={`rounded-full px-3 py-1 ${
                  val.connected ? 'bg-emerald-50 text-emerald-800' : 'bg-zinc-100 text-zinc-700'
                }`}
              >
                {key}: {providerLabel(val.connected, val.configured)}
              </span>
            ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!apiAccessToken || busy === 'voice'}
            onClick={() => {
              if (!apiAccessToken) return;
              setBusy('voice');
              void nestAiInfluencerTestVoice(apiAccessToken).then((r) => {
                if (r?.previewUrl) setVoicePreview(r.previewUrl);
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
              void nestAiInfluencerTestAvatar(apiAccessToken).then(() => {
                setBusy(null);
                load();
              });
            }}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
          >
            Test avatar
          </button>
        </div>
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
