'use client';

import { useEffect, useState } from 'react';
import {
  getPostUploadJobs,
  postUploadStatusLabel,
  processPostUploadQueue,
  subscribePostUploadQueue,
  type PostUploadJob,
} from '@/lib/post-upload-queue';

type Props = {
  className?: string;
};

export function PostUploadProgress({ className }: Props) {
  const [jobs, setJobs] = useState<PostUploadJob[]>([]);

  useEffect(() => {
    return subscribePostUploadQueue(setJobs);
  }, []);

  const active = jobs.filter(
    (j) => j.status !== 'PUBLISHED' || Date.now() - j.updatedAt < 8000,
  );
  if (active.length === 0) return null;

  return (
    <div className={className ?? 'mt-3 space-y-2'}>
      {active.map((job) => {
        const isVideo =
          job.payload.hasVideo &&
          (job.status === 'UPLOADING' || job.status === 'PROCESSING' || job.status === 'QUEUED');
        const pct =
          job.status === 'PROCESSING' || job.status === 'PUBLISHED'
            ? 100
            : Math.max(0, Math.min(100, job.progress));
        const failed = job.status === 'FAILED';
        const published = job.status === 'PUBLISHED';

        return (
          <div
            key={job.id}
            className={`rounded-xl border px-3 py-2 text-sm ${
              failed
                ? 'border-red-200 bg-red-50 text-red-800'
                : published
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-sky-200 bg-sky-50 text-sky-900'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{postUploadStatusLabel(job)}</span>
              {isVideo && !failed && !published ? (
                <span className="tabular-nums text-xs">{pct} %</span>
              ) : null}
            </div>
            {!failed && !published ? (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/80">
                <div
                  className="h-full rounded-full bg-sky-500 transition-[width] duration-200"
                  style={{ width: `${pct}%` }}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function PostUploadQueueRunner() {
  useEffect(() => {
    void getPostUploadJobs().then(() => processPostUploadQueue());
    const onPublished = () => {
      window.dispatchEvent(new Event('xxrealit:posts-refresh'));
    };
    window.addEventListener('xxrealit:post-upload-published', onPublished);
    return () => window.removeEventListener('xxrealit:post-upload-published', onPublished);
  }, []);
  return null;
}
