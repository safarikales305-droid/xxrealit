'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { AutoStatusBanner, EditorialCenterShell } from '@/components/admin/redakce/EditorialCenterShell';
import {
  nestEditorialPublishReelJob,
  nestEditorialPublishReelYoutube,
  nestEditorialRetryReelYoutube,
  nestEditorialReelJobs,
  nestEditorialReelMusic,
  nestEditorialReelPending,
  nestEditorialReelSettings,
  nestEditorialReelTemplates,
  nestEditorialRenderReelJob,
  nestEditorialUpdateReelSettings,
  type EditorialReelAutomationSettings,
  type EditorialReelJobRow,
  type EditorialReelTemplate,
  type ReelPendingBuffer,
} from '@/lib/editorial-center-client';

function platformTone(status?: string | null) {
  if (status === 'PUBLISHED') return 'text-emerald-700';
  if (status === 'FAILED' || status === 'AUTH_REQUIRED') return 'text-red-700';
  if (status === 'QUEUED' || status === 'PUBLISHING') return 'text-amber-700';
  return 'text-zinc-500';
}

function statusTone(status: string) {
  if (status === 'PUBLISHED') return 'bg-emerald-100 text-emerald-800';
  if (status === 'FAILED') return 'bg-red-100 text-red-800';
  if (status === 'READY') return 'bg-blue-100 text-blue-800';
  if (status === 'RENDERING' || status === 'PUBLISHING') return 'bg-amber-100 text-amber-800';
  return 'bg-zinc-100 text-zinc-700';
}

export default function RedakceFacebookReelsPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const [jobs, setJobs] = useState<EditorialReelJobRow[]>([]);
  const [settings, setSettings] = useState<EditorialReelAutomationSettings | null>(null);
  const [pending, setPending] = useState<ReelPendingBuffer | null>(null);
  const [templates, setTemplates] = useState<EditorialReelTemplate[]>([]);
  const [musicTracks, setMusicTracks] = useState<Array<{ id: string; title: string }>>([]);

  const load = () => {
    if (!apiAccessToken) return;
    void Promise.all([
      nestEditorialReelJobs(apiAccessToken),
      nestEditorialReelSettings(apiAccessToken),
      nestEditorialReelPending(apiAccessToken),
      nestEditorialReelTemplates(apiAccessToken),
      nestEditorialReelMusic(apiAccessToken),
    ]).then(([j, s, p, t, m]) => {
      if (j) setJobs(j);
      if (s) setSettings(s);
      if (p) setPending(p);
      if (t) setTemplates(t);
      if (m) setMusicTracks(m);
    });
  };

  useEffect(() => {
    if (!isLoading && user?.role !== 'ADMIN') router.replace('/');
  }, [isLoading, user, router]);

  useEffect(load, [apiAccessToken]);

  const defaultTemplate = templates.find((t) => t.isDefault);
  const defaultMusic = musicTracks.find((m) => m.id === settings?.musicTrackId);
  const lastJob = jobs[0];

  if (isLoading || !user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-orange-600" />
      </div>
    );
  }

  return (
    <EditorialCenterShell title="Facebook Reels" subtitle="Automatické kompilace z YouTube thumbnailů a historie.">
      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin/redakce/facebook-reels/sablony"
          className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
        >
          Šablony
        </Link>
        <Link
          href="/admin/redakce/automatizace"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50"
        >
          Nastavení automatizace
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <AutoStatusBanner active={settings?.enabled ?? false} label="AUTOMATICKÉ REELS" />
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Čekající videa</p>
          <p className="text-lg font-bold text-zinc-900">
            {pending?.count ?? 0} / {pending?.threshold ?? 5}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Poslední Reel</p>
          <p className="text-lg font-bold text-zinc-900">{lastJob?.status ?? '—'}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Výchozí šablona</p>
          <p className="text-lg font-bold text-zinc-900">{defaultTemplate?.name ?? '—'}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Výchozí hudba</p>
          <p className="text-lg font-bold text-zinc-900">{defaultMusic?.title ?? 'Bez hudby'}</p>
        </div>
      </div>

      {pending && pending.count > 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="font-semibold text-zinc-900">
            {pending.count} / {pending.threshold} videí připraveno
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            {pending.count >= pending.threshold
              ? 'Další Reel bude vytvořen při nejbližším běhu workeru.'
              : 'Čeká se na další video.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {pending.posts.map((p) => (
              <div key={p.id} className="w-20 overflow-hidden rounded-lg border border-zinc-200">
                {p.youtubeThumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.youtubeThumbnailUrl} alt="" className="aspect-[9/16] w-full object-cover" />
                ) : (
                  <div className="flex aspect-[9/16] items-center justify-center bg-zinc-100 text-[10px] text-zinc-500">
                    bez náhledu
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="font-semibold text-zinc-900">Automatický režim</h2>
        <div className="mt-3 space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings?.enabled ?? false}
              onChange={(e) => {
                if (!apiAccessToken) return;
                void nestEditorialUpdateReelSettings(apiAccessToken, { enabled: e.target.checked }).then(
                  (s) => s && setSettings(s),
                );
              }}
            />
            Automaticky vytvářet Reels
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings?.autoPublish ?? false}
              onChange={(e) => {
                if (!apiAccessToken) return;
                void nestEditorialUpdateReelSettings(apiAccessToken, { autoPublish: e.target.checked }).then(
                  (s) => s && setSettings(s),
                );
              }}
            />
            Automaticky publikovat na Facebook
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings?.autoPublishYoutube ?? false}
              onChange={(e) => {
                if (!apiAccessToken) return;
                void nestEditorialUpdateReelSettings(apiAccessToken, {
                  autoPublishYoutube: e.target.checked,
                }).then((s) => s && setSettings(s));
              }}
            />
            Automaticky publikovat na YouTube
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Výchozí hudba</span>
            <select
              className="w-full max-w-md rounded-lg border border-zinc-300 px-3 py-2"
              value={settings?.musicTrackId ?? ''}
              onChange={(e) => {
                if (!apiAccessToken) return;
                void nestEditorialUpdateReelSettings(apiAccessToken, {
                  musicTrackId: e.target.value || null,
                }).then((s) => s && setSettings(s));
              }}
            >
              <option value="">Bez hudby</option>
              {musicTracks.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Název</th>
              <th className="px-4 py-3">Segmentů</th>
              <th className="px-4 py-3">Šablona</th>
              <th className="px-4 py-3">Hudba</th>
              <th className="px-4 py-3">Facebook</th>
              <th className="px-4 py-3">YouTube</th>
              <th className="px-4 py-3">Stav</th>
              <th className="px-4 py-3">Fáze / chyba</th>
              <th className="px-4 py-3">Datum</th>
              <th className="px-4 py-3">Akce</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-b border-zinc-100">
                <td className="px-4 py-3">
                  <Link href={`/admin/redakce/facebook-reels/${job.id}`} className="font-medium text-orange-700 hover:underline">
                    {job.title ?? 'Reel'}
                  </Link>
                </td>
                <td className="px-4 py-3">{job.videoCount}</td>
                <td className="px-4 py-3 text-xs">{job.template?.name ?? '—'}</td>
                <td className="px-4 py-3 text-xs">{job.template?.musicTrack?.title ?? 'Bez hudby'}</td>
                <td className="px-4 py-3 text-xs">
                  <span className={platformTone(job.facebookPublishStatus)}>
                    {job.facebookPublishStatus ?? (job.facebookPermalink ? 'PUBLISHED' : 'SKIPPED')}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs">
                  <span className={platformTone(job.youtubePublishStatus)}>
                    {job.youtubePublishStatus ?? 'SKIPPED'}
                  </span>
                  {job.youtubePublishError ? (
                    <p className="text-red-600">{job.youtubePublishError.slice(0, 80)}</p>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone(job.status)}`}>
                    {job.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-red-600">
                  {job.failedStage ? `${job.failedStage}` : ''}
                  {job.renderError ? <p>{job.renderError}</p> : null}
                  {job.publishError ? <p>{job.publishError}</p> : null}
                  {job.errorCode ? <p className="text-zinc-500">{job.errorCode}</p> : null}
                </td>
                <td className="px-4 py-3 text-xs">{new Date(job.createdAt).toLocaleString('cs-CZ')}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    <Link
                      href={`/admin/redakce/facebook-reels/${job.id}`}
                      className="rounded border border-zinc-300 px-2 py-1 text-xs"
                    >
                      Detail
                    </Link>
                    {job.status === 'FAILED' && apiAccessToken ? (
                      <button
                        type="button"
                        className="rounded bg-amber-600 px-2 py-1 text-xs font-semibold text-white"
                        onClick={() => void nestEditorialRenderReelJob(apiAccessToken, job.id).then(load)}
                      >
                        Zkusit znovu
                      </button>
                    ) : null}
                    {(job.status === 'READY' || job.status === 'PUBLISHED') && apiAccessToken ? (
                      <>
                        {job.facebookPublishStatus !== 'PUBLISHED' ? (
                          <button
                            type="button"
                            className="rounded bg-orange-600 px-2 py-1 text-xs font-semibold text-white"
                            onClick={() => void nestEditorialPublishReelJob(apiAccessToken, job.id).then(load)}
                          >
                            Facebook
                          </button>
                        ) : null}
                        {job.youtubePublishStatus !== 'PUBLISHED' ? (
                          <button
                            type="button"
                            className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white"
                            onClick={() =>
                              void (
                                job.youtubePublishStatus === 'FAILED' ||
                                job.youtubePublishStatus === 'AUTH_REQUIRED'
                                  ? nestEditorialRetryReelYoutube(apiAccessToken, job.id)
                                  : nestEditorialPublishReelYoutube(apiAccessToken, job.id)
                              ).then(load)
                            }
                          >
                            YouTube
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </EditorialCenterShell>
  );
}
