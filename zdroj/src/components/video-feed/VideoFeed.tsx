'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { ShortVideo } from '@/lib/nest-client';
import { StoriesBar } from './StoriesBar';
import { VideoCard } from './VideoCard';

type VideoFeedProps = {
  videos: ShortVideo[];
};

export function VideoFeed({ videos }: VideoFeedProps) {
  const [likedById, setLikedById] = useState<Record<string, boolean>>({});
  const containerRefs = useRef<Record<string, HTMLElement | null>>({});

  const sorted = useMemo(
    () => [...videos].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [videos],
  );

  const toggleLike = useCallback((id: string) => {
    setLikedById((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const scrollToVideo = useCallback((id: string) => {
    const node = containerRefs.current[id];
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <StoriesBar videos={sorted} onSelect={scrollToVideo} />
      <div className="min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto space-y-2 px-2 pb-24 md:px-0 md:pb-0">
        {sorted.map((video) => (
          <VideoCard
            key={video.id}
            video={video}
            liked={!!likedById[video.id]}
            onToggleLike={() => toggleLike(video.id)}
            bindContainerRef={(el) => {
              containerRefs.current[video.id] = el;
            }}
          />
        ))}
      </div>
    </div>
  );
}
