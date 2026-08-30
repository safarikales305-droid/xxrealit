'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { EditorialCenterShell } from '@/components/admin/redakce/EditorialCenterShell';
import {
  nestEditorialPublishReelJob,
  nestEditorialReelJobs,
  nestEditorialReelSettings,
  nestEditorialUpdateReelSettings,
  type EditorialReelAutomationSettings,
  type EditorialReelJobRow,
} from '@/lib/editorial-center-client';

export default function RedakceFacebookReelsPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const [jobs, setJobs] = useState<EditorialReelJobRow[]>([]);
  const [settings, setSettings] = useState<EditorialReelAutomationSettings | null>(null);

  const load = () => {
    if (!apiAccessToken) return;
    void Promise.all([
      nestEditorialReelJobs(apiAccessToken),
      nestEditorialReelSettings(apiAccessToken),
    ]).then(([j, s]) => {
      if (j) setJobs(j);
      if (s) setSettings(s);
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
    <EditorialCenterShell title="Facebook Reels" subtitle="Automatické kompilace z YouTube thumbnailů a historie.">
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="font-semibold text-zinc-900">Automatický režim</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Reel po {settings?.videosPerReel ?? 5} videích · min. {settings?.minVideos ?? 3} · max. čekání{' '}
          {settings?.maxWaitHours ?? 24} h
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings?.enabled ?? false}
            onChange={(e) => {
              if (!apiAccessToken) return;
              void nestEditorialUpdateReelSettings(apiAccessToken, { enabled: e.target.checked }).then(setSettings);
            }}
          />
          Automaticky vytvářet Facebook Reels
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Název</th>
              <th className="px-4 py-3">Segmentů</th>
              <th className="px-4 py-3">Stav</th>
              <th className="px-4 py-3">Datum</th>
              <th className="px-4 py-3">Akce</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-b border-zinc-100">
                <td className="px-4 py-3">{job.title ?? 'Reel'}</td>
                <td className="px-4 py-3">{job.videoCount}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold">{job.status}</span>
                  {job.publishError ? (
                    <p className="mt-1 text-xs text-red-600">{job.publishError}</p>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-xs">
                  {new Date(job.createdAt).toLocaleString('cs-CZ')}
                </td>
                <td className="px-4 py-3">
                  {job.status === 'READY' && apiAccessToken ? (
                    <button
                      type="button"
                      className="rounded bg-orange-600 px-2 py-1 text-xs font-semibold text-white"
                      onClick={() => void nestEditorialPublishReelJob(apiAccessToken, job.id).then(load)}
                    >
                      Publikovat
                    </button>
                  ) : null}
                  {job.facebookPermalink ? (
                    <a href={job.facebookPermalink} target="_blank" rel="noreferrer" className="ml-2 text-xs text-orange-700 underline">
                      Facebook
                    </a>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </EditorialCenterShell>
  );
}
