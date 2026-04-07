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
    <div className="relative w-full h-full bg-black">
      <video
        ref={videoRef}
        muted
        playsInline
        loop
        controls
        preload="metadata"
        className="w-full h-full object-cover"
        onError={() => {
          console.log('VIDEO ERROR', src);
          setError(true);
        }}
        onLoadedData={() => {
          console.log('VIDEO LOADED', src);
        }}
      >
        <source src={src} type="video/mp4" />
      </video>

      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-white bg-black">
          Video failed to load
        </div>
      )}
    </div>
  );
}
