'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import type { ShortVideo } from '@/lib/nest-client';

type VideoCardProps = {
  video: ShortVideo;
};

export default function VideoCard({ video }: VideoCardProps) {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!videoRef.current) return;

    const vid = videoRef.current;

    const tryPlay = () => {
      vid.play().catch(() => {
        console.log('Autoplay blocked');
      });
    };

    tryPlay();

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!vid) return;

        if (entry.isIntersecting) {
          tryPlay();
        } else {
          vid.pause();
        }
      },
      { threshold: 0.6 },
    );

    observer.observe(vid);

    return () => observer.disconnect();
  }, []);

  const src = nestAbsoluteAssetUrl(video.videoUrl ?? video.url ?? '');
  if (!src) {
    return <div className="text-white">Missing video</div>;
  }

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-black">
      <video
        ref={videoRef}
        src={src}
        muted
        playsInline
        loop
        autoPlay
        preload="metadata"
        className="aspect-[9/16] h-full w-full max-h-[100dvh] object-cover"
        onError={() => {
          setError(true);
        }}
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 text-white">
        <div className="space-y-1">
          <div className="text-xl font-bold text-white">
            <span className={isAuthenticated ? '' : 'blur-[6px] select-none opacity-90'}>
              {Number(video.price ?? 0).toLocaleString('cs-CZ')} Kč
            </span>
          </div>
          <div className="text-sm font-medium">
            {video.title ?? ''} {video.city ?? ''}
          </div>
          <button
            type="button"
            onClick={() => router.push(`/post/${video.id}?from=shorts`)}
            className="pointer-events-auto mt-2 inline-flex items-center rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-black"
          >
            Zobrazit inzerát
          </button>
        </div>
      </div>

      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-white bg-black">
          Video failed to load
        </div>
      )}
    </div>
  );
}
