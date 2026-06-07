'use client';

import Link from 'next/link';
import { VideoFeed } from '@/components/video-feed/VideoFeed';
import type { ShortVideo } from '@/lib/nest-client';

type Props = {
  video: ShortVideo;
  backHref?: string;
};

export function ShortsSinglePage({ video, backHref = '/' }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="absolute left-0 top-0 z-[60] p-3">
        <Link
          href={backHref}
          className="inline-flex rounded-full border border-white/30 bg-black/50 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-md hover:bg-black/70"
        >
          ← Zpět
        </Link>
      </div>
      <div className="min-h-0 flex-1">
        <VideoFeed videos={[video]} />
      </div>
    </div>
  );
}
