'use client';

import { useEffect, useRef, useState } from 'react';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import type { ShortVideo } from '@/lib/nest-client';

type VideoCardProps = {
  video: ShortVideo;
};

export default function VideoCard({ video }: VideoCardProps) {
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

      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-white bg-black">
          Video failed to load
        </div>
      )}
    </div>
  );
}
