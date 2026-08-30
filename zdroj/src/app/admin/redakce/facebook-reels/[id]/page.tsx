'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { EditorialCenterShell } from '@/components/admin/redakce/EditorialCenterShell';
import {
  nestEditorialDeleteReelJob,
  nestEditorialPublishReelJob,
  nestEditorialReelJob,
  nestEditorialRenderReelJob,
  type EditorialReelJobRow,
} from '@/lib/editorial-center-client';

export default function ReelJobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const [job, setJob] = useState<EditorialReelJobRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!apiAccessToken || !id) return;
    void nestEditorialReelJob(apiAccessToken, id).then(setJob);
  };

  useEffect(() => {
    if (!isLoading && user?.role !== 'ADMIN') router.replace('/');
  }, [isLoading, user, router]);

  useEffect(load, [apiAccessToken, id]);

  if (isLoading || !user || !job) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-orange-600" />
      </div>
    );
  }

  const errorMessage = job.renderError || job.publishError;

  return (
    <EditorialCenterShell title={job.title ?? 'Reel detail'} subtitle={`Stav: ${job.status}`}>
      <Link href="/admin/redakce/facebook-reels" className="text-sm text-orange-700 underline">
        ← Zpět na Facebook Reels
      </Link>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="font-semibold">Základní údaje</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-zinc-500">Stav</dt>
              <dd className="font-medium">{job.status}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Fáze</dt>
              <dd>{job.failedStage ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Segmentů</dt>
              <dd>{job.videoCount}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Šablona</dt>
              <dd>{job.template?.name ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Pokusů</dt>
              <dd>{job.attemptCount}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Vytvořeno</dt>
              <dd>{new Date(job.createdAt).toLocaleString('cs-CZ')}</dd>
            </div>
            {job.renderedAt ? (
              <div className="flex justify-between">
                <dt className="text-zinc-500">Vyrenderováno</dt>
                <dd>{new Date(job.renderedAt).toLocaleString('cs-CZ')}</dd>
              </div>
            ) : null}
          </dl>

          {errorMessage ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              <p className="font-semibold">CHYBA</p>
              {job.failedStage ? <p>Fáze: {job.failedStage}</p> : null}
              {job.errorCode ? <p>Kód: {job.errorCode}</p> : null}
              <p className="mt-1">{errorMessage}</p>
              {job.lastAttemptAt ? (
                <p className="mt-1 text-xs opacity-80">
                  {new Date(job.lastAttemptAt).toLocaleString('cs-CZ')}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {job.videoUrl ? (
              <a
                href={job.videoUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white"
              >
                Přehrát náhled
              </a>
            ) : null}
            {job.status === 'FAILED' && apiAccessToken ? (
              <button
                type="button"
                disabled={busy}
                className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => {
                  setBusy(true);
                  void nestEditorialRenderReelJob(apiAccessToken, job.id)
                    .then(load)
                    .finally(() => setBusy(false));
                }}
              >
                Zkusit znovu render
              </button>
            ) : null}
            {(job.status === 'READY' || job.publishError) && apiAccessToken ? (
              <button
                type="button"
                disabled={busy}
                className="rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => {
                  setBusy(true);
                  void nestEditorialPublishReelJob(apiAccessToken, job.id)
                    .then(load)
                    .finally(() => setBusy(false));
                }}
              >
                {job.publishError ? 'Publikovat znovu' : 'Publikovat'}
              </button>
            ) : null}
            {apiAccessToken ? (
              <button
                type="button"
                disabled={busy}
                className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700"
                onClick={() => {
                  if (!confirm('Smazat tento Reel job?')) return;
                  setBusy(true);
                  void nestEditorialDeleteReelJob(apiAccessToken, job.id).then(() =>
                    router.push('/admin/redakce/facebook-reels'),
                  );
                }}
              >
                Smazat
              </button>
            ) : null}
          </div>

          {job.facebookPermalink ? (
            <a href={job.facebookPermalink} target="_blank" rel="noreferrer" className="text-sm text-orange-700 underline">
              Otevřít na Facebooku
            </a>
          ) : null}
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="font-semibold">Segmenty ({job.segments?.length ?? 0})</h2>
          <ul className="mt-3 space-y-3">
            {(job.segments ?? []).map((seg) => (
              <li key={seg.id} className="flex gap-3 border-b border-zinc-100 pb-3 last:border-0">
                {seg.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={seg.thumbnailUrl} alt="" className="h-16 w-12 rounded object-cover" />
                ) : (
                  <div className="flex h-16 w-12 items-center justify-center rounded bg-zinc-100 text-[10px]">—</div>
                )}
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">{seg.title ?? seg.post?.title}</p>
                  <p className="text-xs text-zinc-500">{seg.channelTitle ?? seg.post?.youtubeChannelTitle}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {job.videoUrl ? (
        <div className="rounded-xl border border-zinc-200 bg-black p-2">
          <video src={job.videoUrl} controls className="mx-auto max-h-[70vh] w-full max-w-sm" playsInline />
        </div>
      ) : null}
    </EditorialCenterShell>
  );
}
