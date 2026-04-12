'use client';

import { useMemo } from 'react';
import type { ShortVideo } from '@/lib/nest-client';
import VideoCard from './VideoCard';

type VideoFeedProps = {
  videos: ShortVideo[];
};

/**
 * Mobilní shorts: jeden slide = celá výška feedu (žádný StoriesBar s náhledy jiných inzerátů).
 * Desktop: zaoblený rám; mobil: edge-to-edge pro „klasické“ shorts.
 */
export function VideoFeed({ videos }: VideoFeedProps) {
  const sorted = useMemo(
    () => [...videos].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [videos],
  );

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto overflow-x-hidden overscroll-y-contain pb-[env(safe-area-inset-bottom)] pt-0">
        {sorted.map((video) => (
          <div
            key={video.id}
            className="h-full min-h-0 w-full shrink-0 snap-start snap-always overflow-hidden rounded-none bg-black max-md:min-h-[calc(100dvh-4.5rem)] md:rounded-xl"
          >
            <VideoCard video={video} />
          </div>
        ))}
      </div>
    </div>
  );
}
