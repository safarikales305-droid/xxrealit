'use client';

import { useCallback, useMemo, useRef } from 'react';
import type { ShortVideo } from '@/lib/nest-client';
import { StoriesBar } from './StoriesBar';
import VideoCard from './VideoCard';

type VideoFeedProps = {
  videos: ShortVideo[];
};

export function VideoFeed({ videos }: VideoFeedProps) {
  const containerRefs = useRef<Record<string, HTMLElement | null>>({});

  const sorted = useMemo(
    () => [...videos].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [videos],
  );

  const scrollToVideo = useCallback((id: string) => {
    const node = containerRefs.current[id];
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <StoriesBar videos={sorted} onSelect={scrollToVideo} />
      <div className="min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto overflow-x-hidden px-2 pb-3 pt-0 md:px-0 md:pb-2">
        {sorted.map((video) => (
          <div
            key={video.id}
            ref={(el) => {
              containerRefs.current[video.id] = el;
            }}
            className="h-full min-h-0 w-full shrink-0 snap-start snap-always overflow-hidden rounded-xl bg-black"
          >
            <VideoCard video={video} />
          </div>
        ))}
      </div>
    </div>
  );
}
