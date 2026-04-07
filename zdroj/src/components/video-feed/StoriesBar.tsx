'use client';

import { memo } from 'react';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import type { ShortVideo } from '@/lib/nest-client';

type StoriesBarProps = {
  videos: ShortVideo[];
  onSelect: (id: string) => void;
};

function StoriesBarBase({ videos, onSelect }: StoriesBarProps) {
  if (videos.length === 0) return null;

  return (
    <div className="md:hidden">
      <div className="flex gap-2 overflow-x-auto px-2 py-2">
        {videos.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => onSelect(v.id)}
            className="relative shrink-0 overflow-hidden rounded-xl border border-white/25"
          >
            <video
              muted
              playsInline
              autoPlay
              loop
              controls
              preload="metadata"
              className="w-full h-full object-cover size-16"
              onError={(e) => console.log('VIDEO ERROR', e)}
              onLoadedData={() => console.log('VIDEO LOADED')}
            >
              <source
                src={nestAbsoluteAssetUrl(v.videoUrl ?? v.url ?? '')}
                type="video/mp4"
              />
            </video>
          </button>
        ))}
      </div>
    </div>
  );
}

export const StoriesBar = memo(StoriesBarBase);
